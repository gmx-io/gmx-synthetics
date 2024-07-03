import { BigNumber, ethers } from "ethers";
import hre from "hardhat";
import { bigNumberify, expandDecimals, formatAmount } from "../../utils/math";
import {
  getBlockByTimestamp,
  getMinRewardThreshold,
  overrideReceivers,
  processArgs,
  requestAllocationData,
  requestPrices,
  requestSubgraph,
  saveDistribution,
} from "./helpers";
import { toLoggableObject } from "../../utils/print";
import { setTimeout } from "timers/promises";

function getUserMarketInfosQuery(i: number, toBlockNumber: number, marketsWithRewardsCond: string) {
  return `
    userMarketInfos(
      first: 10000
      skip: ${i * 10000}
      block: {
        number: ${toBlockNumber}
      }
      where: {
        marketAddress_in: ${marketsWithRewardsCond}
      }
    ) {
      account
      marketAddress
      marketTokensBalance
    }
  `;
}

type UserMarketInfo = {
  account: string;
  marketAddress: string;
  marketTokensBalance: string;
};

async function requestBalancesData(fromTimestamp: number, toBlockNumber: number, marketsWithRewards: string[]) {
  const marketsWithRewardsCond = '["' + marketsWithRewards.map((m) => m.toLowerCase()).join('","') + '"]';
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
    userMarketInfos0: UserMarketInfo[];
    userMarketInfos1: UserMarketInfo[];
    userMarketInfos2: UserMarketInfo[];
    userMarketInfos3: UserMarketInfo[];
    userMarketInfos4: UserMarketInfo[];
    userMarketInfos5: UserMarketInfo[];
    userMarketInfos6: UserMarketInfo[];
    userMarketInfos7: UserMarketInfo[];
    userMarketInfos8: UserMarketInfo[];
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
        marketAddress_in: ${marketsWithRewardsCond}
      }
    ) {
      account
      marketAddress
      weightedAverageMarketTokensBalance
    }
    marketIncentivesStats(
      first: 10000
      where: {
        marketAddress_in: ${marketsWithRewardsCond}
        timestamp: ${fromTimestamp}
        period: "1w"
      }
    ) {
      marketAddress
      weightedAverageMarketTokensSupply
    }
    userMarketInfos0: ${getUserMarketInfosQuery(0, toBlockNumber, marketsWithRewardsCond)}
    userMarketInfos1: ${getUserMarketInfosQuery(1, toBlockNumber, marketsWithRewardsCond)}
    userMarketInfos2: ${getUserMarketInfosQuery(2, toBlockNumber, marketsWithRewardsCond)}
    userMarketInfos3: ${getUserMarketInfosQuery(3, toBlockNumber, marketsWithRewardsCond)}
    userMarketInfos4: ${getUserMarketInfosQuery(4, toBlockNumber, marketsWithRewardsCond)}
    userMarketInfos5: ${getUserMarketInfosQuery(5, toBlockNumber, marketsWithRewardsCond)}
    userMarketInfos6: ${getUserMarketInfosQuery(6, toBlockNumber, marketsWithRewardsCond)}
    userMarketInfos7: ${getUserMarketInfosQuery(7, toBlockNumber, marketsWithRewardsCond)}
    userMarketInfos8: ${getUserMarketInfosQuery(8, toBlockNumber, marketsWithRewardsCond)}
    marketInfos(
      first: 10000
      block: {
        number: ${toBlockNumber}
      }
      where: {
        marketToken_in: ${marketsWithRewardsCond}
      }
    ) {
      marketToken
      marketTokensSupply
    }
  }`);

  if (data.marketInfos.length === 10000) {
    throw new Error("should paginate marketInfos");
  }

  if (data.marketIncentivesStats.length === 10000) {
    throw new Error("should paginate marketIncentivesStats");
  }

  if (data.liquidityProviderIncentivesStats.length === 10000) {
    throw new Error("should paginate liquidityProviderIncentivesStats");
  }

  const userMarketInfos = [
    ...data.userMarketInfos0,
    ...data.userMarketInfos1,
    ...data.userMarketInfos2,
    ...data.userMarketInfos3,
    ...data.userMarketInfos4,
    ...data.userMarketInfos5,
    ...data.userMarketInfos6,
    ...data.userMarketInfos7,
    ...data.userMarketInfos8,
  ];

  if (userMarketInfos.length === 90000) {
    throw new Error("should paginate userMarketInfos");
  }

  const seenUserMarketInfo = new Set();
  for (const userMarketInfo of userMarketInfos) {
    const key = `${userMarketInfo.account}:${userMarketInfo.marketAddress}`;
    if (seenUserMarketInfo.has(key)) {
      console.error(
        "ERROR: duplicated userMarketInfo account %s market %s",
        userMarketInfo.account,
        userMarketInfo.marketAddress
      );
      throw new Error("Duplicated userMarketInfo");
    }
    seenUserMarketInfo.add(key);
  }

  const dataByMarket = Object.fromEntries(
    data.marketInfos.map((marketInfo) => {
      const userBalances: Record<string, BigNumber> = {};
      for (const lpStat of data.liquidityProviderIncentivesStats) {
        if (lpStat.marketAddress === marketInfo.marketToken) {
          userBalances[ethers.utils.getAddress(lpStat.account)] = bigNumberify(
            lpStat.weightedAverageMarketTokensBalance
          );
        }
      }
      for (const info of userMarketInfos) {
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
  const { fromTimestamp, fromDate, toTimestamp, toDate, distributionTypeId } = processArgs("lp");

  const toBlock = await getBlockByTimestamp(toTimestamp);
  console.log("found toBlock %s %s for timestamp %s", toBlock.number, toBlock.timestamp, toTimestamp);

  console.log("Running script to get distribution data");
  console.log("From: %s (timestamp %s)", fromDate.toISOString().substring(0, 19), fromTimestamp);
  console.log("To: %s (timestamp %s)", toDate.toISOString().substring(0, 19), toTimestamp);

  const [allocationData, prices] = await Promise.all([requestAllocationData(fromTimestamp), requestPrices()]);

  const lpAllocationData = allocationData.lp;

  if (!lpAllocationData.isActive) {
    console.warn("WARN: LP incentives are not active for this period");
    return;
  }

  const marketsWithRewards = Object.entries(lpAllocationData.rewardsPerMarket)
    .filter(([, allocation]) => {
      return allocation.gt(0);
    })
    .map(([marketAddress]) => marketAddress);

  const balancesData = await requestBalancesData(fromTimestamp, toBlock.number, marketsWithRewards);

  const tokens = await hre.gmx.getTokens();
  const rewardToken = Object.values(tokens).find((t: any) => t.address === lpAllocationData.token) as any;
  console.log("rewardToken %s %s", rewardToken.symbol, rewardToken.address);
  if (!rewardToken) {
    throw new Error(`Unknown reward token ${lpAllocationData.token}`);
  }
  const rewardTokenPrice = prices.find((p) => p.tokenAddress === rewardToken.address);
  if (!rewardTokenPrice) {
    throw new Error(`No price for reward token ${rewardToken.symbol}`);
  }

  if (Math.abs(lpAllocationData.totalShare - 1) > 0.001) {
    console.warn("WARN: total share %s of market allocations is not 1", lpAllocationData.totalShare);
    await setTimeout(3000);
  }

  console.log("allocationData", toLoggableObject(lpAllocationData));

  if (!lpAllocationData.isActive) {
    throw new Error(`There is no incentives for week starting on ${fromDate}`);
  }

  const usersDistributionResult: Record<string, BigNumber> = {};

  for (const marketAddress of Object.keys(lpAllocationData.rewardsPerMarket)) {
    if (lpAllocationData.rewardsPerMarket[marketAddress].eq(0)) {
      continue;
    }
    if (!(marketAddress in balancesData)) {
      throw new Error(`No balances data for market ${marketAddress}`);
    }
    const userBalances = balancesData[marketAddress].userBalances;
    const userBalancesSum = Object.values(userBalances).reduce((acc, userBalance) => {
      return acc.add(userBalance);
    }, bigNumberify(0));

    const { marketTokensSupply } = balancesData[marketAddress];

    const diff = userBalancesSum.sub(marketTokensSupply);
    console.info(
      "market %s sum of user balances %s, market tokens supply %s, diff %s (%s%)",
      marketAddress,
      formatAmount(userBalancesSum, rewardToken.decimals, 2, true),
      formatAmount(marketTokensSupply, rewardToken.decimals, 2, true),
      formatAmount(diff, rewardToken.decimals, 2, true),
      formatAmount(diff.mul(10000).div(userBalancesSum), 2, 2, true)
    );
    if (diff.abs().gt(marketTokensSupply.div(100))) {
      throw Error("Sum of user balances and market tokens supply don't match.");
    }

    const marketAllocation = lpAllocationData.rewardsPerMarket[marketAddress];
    console.log(
      "market %s allocation %s userBalancesSum: %s marketTokensSupply: %s",
      marketAddress,
      formatAmount(marketAllocation, rewardToken.decimals, 2, true),
      formatAmount(userBalancesSum, rewardToken.decimals, 2, true),
      formatAmount(marketTokensSupply, rewardToken.decimals, 2, true)
    );

    let userTotalRewardsForMarket = bigNumberify(0);
    for (const [userAccount, userBalance] of Object.entries(userBalances)) {
      if (!(userAccount in usersDistributionResult)) {
        usersDistributionResult[userAccount] = bigNumberify(0);
      }

      const userRewards = userBalance.mul(marketAllocation).div(userBalancesSum);
      userTotalRewardsForMarket = userTotalRewardsForMarket.add(userRewards);

      console.log(
        "market %s user %s rewards %s %s avg balance %s (%s%)",
        marketAddress,
        userAccount,
        formatAmount(userRewards, rewardToken.decimals, 2, true).padStart(8),
        rewardToken.symbol,
        formatAmount(userBalance, rewardToken.decimals, 2, true).padStart(12),
        formatAmount(userBalance.mul(10000).div(marketTokensSupply), 2, 2)
      );

      usersDistributionResult[userAccount] = usersDistributionResult[userAccount].add(userRewards);
    }

    if (userTotalRewardsForMarket.gt(marketAllocation)) {
      console.error(
        "ERROR: market %s user total rewards for market %s exceeds market allocation %s",
        marketAddress,
        formatAmount(userTotalRewardsForMarket, rewardToken.decimals, 2, true),
        formatAmount(marketAllocation, rewardToken.decimals, 2, true)
      );
      throw new Error("User total rewards for market exceeds market allocation");
    }
  }
  const minRewardThreshold = getMinRewardThreshold(rewardToken);

  let userTotalRewards = bigNumberify(0);
  const jsonResult: Record<string, string> = {};
  let usersBelowThreshold = 0;
  let eligibleUsers = 0;

  for (const [userAccount, userRewards] of Object.entries(usersDistributionResult).sort((a, b) => {
    return a[1].lt(b[1]) ? -1 : 1;
  })) {
    userTotalRewards = userTotalRewards.add(userRewards);
    if (userRewards.lt(minRewardThreshold)) {
      console.log(
        "user %s rewards: %s %s below threshold",
        userAccount,
        formatAmount(userRewards, rewardToken.decimals, 2, true),
        rewardToken.symbol
      );
      usersBelowThreshold++;
      continue;
    }
    eligibleUsers++;
    console.log(
      "user: %s rewards: %s %s (%s%)",
      userAccount,
      formatAmount(userRewards, rewardToken.decimals, 2, true),
      rewardToken.symbol,
      formatAmount(userRewards.mul(10000).div(lpAllocationData.totalRewards), 2, 2)
    );

    jsonResult[userAccount] = userRewards.toString();
  }

  if (userTotalRewards.sub(lpAllocationData.totalRewards).gt(expandDecimals(1, rewardToken.decimals))) {
    throw new Error(
      "Sum of user rewards exceeds total allocated rewards " + `${userTotalRewards} > ${lpAllocationData.totalRewards}`
    );
  }

  const appliedOverrides = await overrideReceivers(jsonResult);

  for (const marketAddress of Object.keys(lpAllocationData.rewardsPerMarket)) {
    console.log(
      "market %s allocation: %s",
      marketAddress,
      formatAmount(lpAllocationData.rewardsPerMarket[marketAddress], rewardToken.decimals, 2, true)
    );
  }

  console.log(
    "Liquidity incentives for period from %s to %s",
    fromDate.toISOString().substring(0, 10),
    toDate.toISOString().substring(0, 10)
  );
  console.log(
    "allocated rewards: %s %s",
    formatAmount(lpAllocationData.totalRewards, rewardToken.decimals, 2, true),
    rewardToken.symbol
  );

  console.log(
    "min reward threshold: %s %s ($%s)",
    formatAmount(minRewardThreshold, rewardToken.expandDecimals, 4),
    rewardToken.symbol,
    formatAmount(minRewardThreshold.mul(rewardTokenPrice.maxPrice), 30, 2)
  );
  console.log("total users: %s", eligibleUsers + usersBelowThreshold);
  console.log("eligible users: %s", eligibleUsers);
  console.log("users below threshold: %s", usersBelowThreshold);

  // userTotalRewards can be slightly lower than allocated rewards because of rounding
  console.log(
    "sum of user rewards: %s %s",
    formatAmount(userTotalRewards, rewardToken.decimals, 2, true),
    rewardToken.symbol
  );

  saveDistribution(fromDate, "lpIncentives", rewardToken.address, jsonResult, distributionTypeId, appliedOverrides);
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
