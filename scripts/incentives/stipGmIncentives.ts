import fs from "fs";
import path from "path";
import { BigNumber, ethers } from "ethers";
import hre from "hardhat";
import fetch from "node-fetch";
import { bigNumberify, expandDecimals, formatAmount } from "../../utils/math";

const ARBITRUM_SUBGRAPH_ENDPOINT =
  "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-arbitrum-stats/version/incentives3-231101071410-21be98d/api";
const API_ENDPOINT = "https://arbitrum-api.gmxinfra.io/incentives/stip/lp";

async function requestSubgraph(query: string) {
  const payload = JSON.stringify({ query });
  const res = await fetch(ARBITRUM_SUBGRAPH_ENDPOINT, {
    method: "POST",
    body: payload,
    headers: { "Content-Type": "application/json" },
  });

  const j = await res.json();
  if (j.errors) {
    throw new Error(JSON.stringify(j));
  }

  return j.data;
}

function guessBlockNumberByTimestamp(block: ethers.providers.Block, timestamp: number) {
  return block.number - Math.floor((block.timestamp - timestamp) * 3.75);
}

async function getBlockByTimestamp(timestamp: number) {
  const tolerance = 30; // 30 seconds
  const latestBlock = await hre.ethers.provider.getBlock("latest");
  let nextBlockNumber = guessBlockNumberByTimestamp(latestBlock, timestamp);

  console.log("latest block: %s %s", latestBlock.number, latestBlock.timestamp);

  const i = 0;
  while (i < 10) {
    console.log("requesting next block %s", nextBlockNumber);
    const block = await hre.ethers.provider.getBlock(nextBlockNumber);
    if (Math.abs(block.timestamp - timestamp) < tolerance) {
      console.log("found block %s %s diff %s", block.number, block.timestamp, block.timestamp - timestamp);
      return block;
    }

    console.log("%s seconds away", block.timestamp - timestamp);

    nextBlockNumber = guessBlockNumberByTimestamp(block, timestamp);

    if (block.number === nextBlockNumber) {
      console.log("search stopped");
      return block;
    }
  }
  throw new Error("block is not found");
}

async function requestBalancesData(fromTimestamp: number, toBlockNumber: number) {
  const data: {
    liquidityProviderIncentivesStats: {
      account: string;
      marketAddress: string;
      weightedAverageMarketTokensBalance: string;
    }[];
    marketIncentivesStats: {
      weightedAverageMarketTokensSupply: string;
      marketAddress: string;
    }[];
    userMarketInfos: {
      account: string;
      marketAddress: string;
      marketTokensBalance: string;
    }[];
    marketInfos: {
      marketToken: string;
      marketTokensSupply: string;
    }[];
  } = await requestSubgraph(`{
    liquidityProviderIncentivesStats(
      first: 10000
      where: {
        timestamp: ${fromTimestamp}
        period: "1w"
      }
    ) {
      account
      marketAddress
      weightedAverageMarketTokensBalance
    }
    marketIncentivesStats(
      first: 100
      where: {
        timestamp: ${fromTimestamp}
        period: "1w"
      }
    ) {
      marketAddress
      weightedAverageMarketTokensSupply
    }
    userMarketInfos(
      first: 10000
      block: {
        number: ${toBlockNumber}
      }
    ) {
      account
      marketAddress
      marketTokensBalance
    }
    marketInfos(
      first: 100
      block: {
        number: ${toBlockNumber}
      }
    ) {
      marketToken
      marketTokensSupply
    }
  }`);

  if (data.liquidityProviderIncentivesStats.length === 10000) {
    throw new Error("should paginate liquidityProviderIncentivesStats");
  }

  if (data.userMarketInfos.length === 10000) {
    throw new Error("should paginate userMarketInfos");
  }

  const dataByMarket = Object.fromEntries(
    data.marketInfos.map((marketInfo) => {
      const userBalances: Record<string, BigNumber> = {};
      for (const lpStat of data.liquidityProviderIncentivesStats) {
        if (lpStat.marketAddress === marketInfo.marketToken) {
          // console.log("set 1 %s", lpStat.weightedAverageMarketTokensBalance)
          userBalances[ethers.utils.getAddress(lpStat.account)] = bigNumberify(
            lpStat.weightedAverageMarketTokensBalance
          );
        }
      }
      for (const info of data.userMarketInfos) {
        if (info.marketAddress !== marketInfo.marketToken) {
          continue;
        }
        if (ethers.utils.getAddress(info.account) in userBalances) {
          continue;
        }
        if (info.marketTokensBalance === "0") {
          continue;
        }
        userBalances[ethers.utils.getAddress(info.account)] = bigNumberify(info.marketTokensBalance);
      }

      const weightedAverageMarketTokensSupply = data.marketIncentivesStats.find(
        (marketStat) => marketStat.marketAddress == marketInfo.marketToken
      )?.weightedAverageMarketTokensSupply;

      return [
        ethers.utils.getAddress(marketInfo.marketToken),
        {
          marketTokensSupply: bigNumberify(weightedAverageMarketTokensSupply || marketInfo.marketTokensSupply),
          userBalances,
        },
      ];
    })
  );

  return dataByMarket;
}

async function requestAllocationData(timestamp: number) {
  const url = new URL(API_ENDPOINT);
  url.searchParams.set("timestamp", String(timestamp));
  if (process.env.IGNORE_START_DATE) {
    url.searchParams.set("ignoreStartDate", "1");
  }
  const res = await fetch(url);
  const data = (await res.json()) as {
    isActive: boolean;
    totalRewards: string;
    period: number;
    rewardsPerMarket: Record<string, string>;
  };

  return {
    isActive: data.isActive,
    totalRewards: data.totalRewards && bigNumberify(data.totalRewards),
    period: data.period,
    rewardsPerMarket:
      data.rewardsPerMarket &&
      Object.fromEntries(
        Object.entries(data.rewardsPerMarket).map(([marketAddress, rewards]) => {
          return [marketAddress, bigNumberify(rewards)];
        })
      ),
  };
}

/*
Example of usage:
...
*/

async function main() {
  if (!process.env.FROM_DATE) {
    throw new Error("FROM_DATE is required");
  }

  const fromDate = new Date(process.env.FROM_DATE);
  if (fromDate.getDay() !== 3) {
    throw Error("Start date should start from Wednesday");
  }

  const fromTimestamp = Math.floor(+fromDate / 1000);

  const toTimestamp = fromTimestamp + 86400 * 7;
  const toDate = new Date(toTimestamp * 1000);

  const toBlock = await getBlockByTimestamp(toTimestamp);
  console.log("found toBlock %s %s for timestamp %s", toBlock.number, toBlock.timestamp, toTimestamp);

  console.log("Running script to get distribution data");
  console.log("From: %s (timestamp %s)", fromDate.toISOString().substring(0, 19), fromTimestamp);
  console.log("To: %s (timestamp %s)", toDate.toISOString().substring(0, 19), toTimestamp);

  const [balancesData, allocationData] = await Promise.all([
    requestBalancesData(fromTimestamp, toBlock.number),
    requestAllocationData(fromTimestamp),
  ]);

  console.log("allocationData", allocationData);

  if (!allocationData.isActive) {
    throw new Error(`There is no incentives for week starting on ${fromDate}`);
  }

  const usersDistributionResult: Record<string, BigNumber> = {};

  for (const marketAddress of Object.keys(allocationData.rewardsPerMarket)) {
    if (!(marketAddress in balancesData)) {
      throw new Error(`No balances data for market ${marketAddress}`);
    }
    const userBalances = balancesData[marketAddress].userBalances;
    const userBalancesSum = Object.values(userBalances).reduce((acc, userBalance) => {
      return acc.add(userBalance);
    }, bigNumberify(0));

    const { marketTokensSupply } = balancesData[marketAddress];

    if (userBalancesSum.sub(marketTokensSupply).abs().gt(expandDecimals(1, 18))) {
      throw Error(
        "Sum of user balances and market tokens supply don't match." +
          `market ${marketAddress} ${marketTokensSupply} vs ${userBalancesSum}`
      );
    } else {
      console.log(
        "market %s userBalancesSum: %s marketTokensSupply: %s",
        marketAddress,
        userBalancesSum,
        marketTokensSupply
      );
    }

    const marketRewards = allocationData.rewardsPerMarket[marketAddress];
    for (const [userAccount, userBalance] of Object.entries(userBalances)) {
      if (!(userAccount in usersDistributionResult)) {
        usersDistributionResult[userAccount] = bigNumberify(0);
      }

      const userRewards = userBalance.mul(marketRewards).div(marketTokensSupply);
      usersDistributionResult[userAccount] = usersDistributionResult[userAccount].add(userRewards);
    }
  }

  const REWARD_THRESHOLD = expandDecimals(1, 17); // 0.1 ARB
  let userTotalRewards = bigNumberify(0);
  const jsonResult = {};
  let usersBelowThreshold = 0;

  for (const [userAccount, userRewards] of Object.entries(usersDistributionResult)) {
    userTotalRewards = userTotalRewards.add(userRewards);
    if (userRewards.lt(REWARD_THRESHOLD)) {
      usersBelowThreshold++;
      continue;
    }
    console.log("user: %s rewards: %s ARB", userAccount, formatAmount(userRewards, 18, 2));
    jsonResult[userAccount] = userRewards.toString();
  }

  if (userTotalRewards.gt(allocationData.totalRewards)) {
    throw new Error(
      "Sum of user rewards exceeds total allocated rewards." + `${userTotalRewards} > ${allocationData.totalRewards}`
    );
  }

  console.log("min reward threshold: %s ARB", formatAmount(REWARD_THRESHOLD, 18, 2));
  console.log("eligable users: %s", Object.keys(jsonResult).length);
  console.log("users below threshold: %s", usersBelowThreshold);

  // userTotalRewards can be slightly lower than allocated rewards because of rounding
  console.log("sum of user rewards: %s ARB", formatAmount(userTotalRewards, 18, 2));
  console.log("allocated rewards: %s ARB", formatAmount(allocationData.totalRewards, 18, 2));

  const filename = path.join(
    __dirname,
    "distributions",
    `stipGmIncentivesDistribution_${fromDate.toISOString().substring(0, 10)}.json`
  );
  const tokens = await hre.gmx.getTokens();
  const arbToken = tokens.ARB;

  fs.writeFileSync(
    filename,
    JSON.stringify(
      {
        token: arbToken.address,
        distributionTypeId: 1001,
        amounts: jsonResult,
      },
      null,
      4
    )
  );
  console.log("data is saved to %s", filename);

  //
}

main()
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
