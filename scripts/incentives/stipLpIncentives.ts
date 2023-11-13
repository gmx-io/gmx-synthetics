import { BigNumber, ethers } from "ethers";
import hre from "hardhat";
import { bigNumberify, expandDecimals, formatAmount } from "../../utils/math";
import {
  STIP_LP_DISTRIBUTION_TYPE_ID,
  getBlockByTimestamp,
  overrideReceivers,
  processArgs,
  requestAllocationData,
  requestSubgraph,
  saveDistribution,
} from "./helpers";

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

/*
Example of usage:
...
*/

async function main() {
  const { fromTimestamp, fromDate, toTimestamp, toDate } = processArgs();

  const toBlock = await getBlockByTimestamp(toTimestamp);
  console.log("found toBlock %s %s for timestamp %s", toBlock.number, toBlock.timestamp, toTimestamp);

  console.log("Running script to get distribution data");
  console.log("From: %s (timestamp %s)", fromDate.toISOString().substring(0, 19), fromTimestamp);
  console.log("To: %s (timestamp %s)", toDate.toISOString().substring(0, 19), toTimestamp);

  const [balancesData, allocationData] = await Promise.all([
    requestBalancesData(fromTimestamp, toBlock.number),
    requestAllocationData(fromTimestamp),
  ]);

  const lpAllocationData = allocationData.lp;

  console.log("allocationData", lpAllocationData);

  if (!lpAllocationData.isActive) {
    throw new Error(`There is no incentives for week starting on ${fromDate}`);
  }

  const usersDistributionResult: Record<string, BigNumber> = {};

  for (const marketAddress of Object.keys(lpAllocationData.rewardsPerMarket)) {
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
    }

    console.log(
      "market %s userBalancesSum: %s marketTokensSupply: %s",
      marketAddress,
      formatAmount(userBalancesSum, 18, 2, true),
      formatAmount(marketTokensSupply, 18, 2, true)
    );

    const marketRewards = lpAllocationData.rewardsPerMarket[marketAddress];
    for (const [userAccount, userBalance] of Object.entries(userBalances)) {
      if (!(userAccount in usersDistributionResult)) {
        usersDistributionResult[userAccount] = bigNumberify(0);
      }

      const userRewards = userBalance.mul(marketRewards).div(marketTokensSupply);
      usersDistributionResult[userAccount] = usersDistributionResult[userAccount].add(userRewards);
    }
  }

  const MIN_REWARD_THRESHOLD = expandDecimals(1, 17); // 0.1 ARB
  let userTotalRewards = bigNumberify(0);
  const jsonResult: Record<string, string> = {};
  let usersBelowThreshold = 0;

  for (const [userAccount, userRewards] of Object.entries(usersDistributionResult)) {
    userTotalRewards = userTotalRewards.add(userRewards);
    if (userRewards.lt(MIN_REWARD_THRESHOLD)) {
      usersBelowThreshold++;
      continue;
    }
    console.log("user: %s rewards: %s ARB", userAccount, formatAmount(userRewards, 18, 2, true));

    jsonResult[userAccount] = userRewards.toString();
  }

  if (userTotalRewards.gt(lpAllocationData.totalRewards)) {
    throw new Error(
      "Sum of user rewards exceeds total allocated rewards." + `${userTotalRewards} > ${lpAllocationData.totalRewards}`
    );
  }

  overrideReceivers(jsonResult);

  for (const marketAddress of Object.keys(lpAllocationData.rewardsPerMarket)) {
    console.log(
      "market %s allocation: %s",
      marketAddress,
      formatAmount(lpAllocationData.rewardsPerMarket[marketAddress], 18, 2, true)
    );
  }
  console.log("allocated rewards: %s ARB", formatAmount(lpAllocationData.totalRewards, 18, 2, true));

  console.log("min reward threshold: %s ARB", formatAmount(MIN_REWARD_THRESHOLD, 18, 2, true));
  console.log("eligible users: %s", Object.keys(jsonResult).length);
  console.log("users below threshold: %s", usersBelowThreshold);

  // userTotalRewards can be slightly lower than allocated rewards because of rounding
  console.log("sum of user rewards: %s ARB", formatAmount(userTotalRewards, 18, 2, true));

  const tokens = await hre.gmx.getTokens();
  const arbToken = tokens.ARB;

  saveDistribution(fromDate, "stipLpIncentives", arbToken.address, jsonResult, STIP_LP_DISTRIBUTION_TYPE_ID);
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
