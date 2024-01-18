import hre from "hardhat";
import { bigNumberify, expandDecimals, formatAmount } from "../../utils/math";
import {
  STIP_TRADING_INCENTIVES_DISTRIBUTION_TYPE_ID,
  overrideReceivers,
  processArgs,
  requestAllocationData,
  requestSubgraph,
  saveDistribution,
} from "./helpers";

async function requestMigrationData(fromTimestamp: number) {
  const data: {
    userTradingIncentivesStats: {
      eligibleFeesInArb: string;
      eligibleFeesUsd: string;
      positionFeesUsd: string;
      positionFeesInArb: string;
      account: string;
    }[];
    tradingIncentivesStat: {
      eligibleFeesInArb: string;
      eligibleFeesUsd: string;
      positionFeesUsd: string;
      positionFeesInArb: string;
      rebatesCapInArb: string;
    };
  } = await requestSubgraph(`{
    userTradingIncentivesStats(
      first: 10000,
      where: {
        timestamp: ${fromTimestamp},
        period: "1w"
      }
    ) {
      eligibleFeesInArb
      eligibleFeesUsd
      positionFeesUsd
      positionFeesInArb
      account
    }
    tradingIncentivesStat(id: "1w:${fromTimestamp}") {
      eligibleFeesInArb
      eligibleFeesUsd
      positionFeesUsd
      positionFeesInArb
      rebatesCapInArb
    }
  }`);

  return {
    userTradingIncentivesStats: data.userTradingIncentivesStats
      .map((item) => {
        return {
          ...item,
          eligibleFeesInArb: bigNumberify(item.eligibleFeesInArb),
          eligibleFeesUsd: bigNumberify(item.eligibleFeesUsd),
          positionFeesUsd: bigNumberify(item.positionFeesUsd),
          positionFeesInArb: bigNumberify(item.positionFeesInArb),
        };
      })
      .sort((a, b) => (a.eligibleFeesInArb.lt(b.eligibleFeesInArb) ? -1 : 1)),
    tradingIncentivesStat: data.tradingIncentivesStat
      ? {
          ...data.tradingIncentivesStat,
          eligibleFeesInArb: bigNumberify(data.tradingIncentivesStat.eligibleFeesInArb),
          eligibleFeesUsd: bigNumberify(data.tradingIncentivesStat.eligibleFeesUsd),
          positionFeesUsd: bigNumberify(data.tradingIncentivesStat.positionFeesUsd),
          positionFeesInArb: bigNumberify(data.tradingIncentivesStat.positionFeesInArb),
          rebatesCapInArb: bigNumberify(data.tradingIncentivesStat.rebatesCapInArb),
        }
      : null,
  };
}

async function main() {
  const { fromTimestamp, fromDate, toTimestamp, toDate } = processArgs();

  console.log("Running script to get distribution data");
  console.log("From: %s (timestamp %s)", fromDate.toISOString().substring(0, 19), fromTimestamp);
  console.log("To: %s (timestamp %s)", toDate.toISOString().substring(0, 19), toTimestamp);

  const [{ userTradingIncentivesStats, tradingIncentivesStat }, allocationData] = await Promise.all([
    requestMigrationData(fromTimestamp),
    requestAllocationData(fromTimestamp),
  ]);

  if (userTradingIncentivesStats.length === 0) {
    console.warn("WARN: no userTradingIncentivesStats data for this period");
    return;
  }

  if (!tradingIncentivesStat) {
    console.warn("WARN: no tradingIncentivesStat data for this period");
    return;
  }

  const jsonResult: Record<string, string> = {};
  const MIN_REWARD_THRESHOLD = expandDecimals(1, 17); // 0.1 ARB
  let usersBelowThreshold = 0;
  let eligibleUsers = 0;
  let userTotalPositionFeesInArb = bigNumberify(0);
  let userTotalPositionFeesUsd = bigNumberify(0);

  const allocation = allocationData.trading.allocation;
  let adjustedRebatePercent = bigNumberify(allocationData.trading.rebatePercent);

  userTradingIncentivesStats.sort((a, b) => {
    return a.positionFeesInArb.lt(b.positionFeesInArb) ? -1 : 1;
  });
  for (const item of userTradingIncentivesStats) {
    userTotalPositionFeesUsd = userTotalPositionFeesUsd.add(item.positionFeesUsd);
    userTotalPositionFeesInArb = userTotalPositionFeesInArb.add(item.positionFeesInArb);
  }

  const usedAllocation = userTotalPositionFeesInArb.mul(adjustedRebatePercent).div(10000);
  if (usedAllocation.gt(allocation)) {
    adjustedRebatePercent = adjustedRebatePercent.mul(allocation).div(usedAllocation);
  }

  let userTotalRewards = bigNumberify(0);
  for (const item of userTradingIncentivesStats) {
    const userRebates = item.positionFeesInArb.mul(adjustedRebatePercent).div(10000);

    userTotalRewards = userTotalRewards.add(userRebates);
  }

  for (const item of userTradingIncentivesStats) {
    const userRebates = item.positionFeesInArb.mul(adjustedRebatePercent).div(10000);

    console.log(
      "user %s rebate %s (%s%) position fee: %s %s",
      item.account,
      `${formatAmount(userRebates, 18, 2, true)} ARB`.padEnd(14),
      formatAmount(userRebates.mul(10000).div(userTotalRewards), 2, 2),
      `${formatAmount(item.positionFeesInArb, 18, 2, true)} ARB`.padEnd(15),
      `($${formatAmount(item.positionFeesUsd, 30, 2, true)})`.padEnd(14)
    );

    if (userRebates.lt(MIN_REWARD_THRESHOLD)) {
      usersBelowThreshold++;
      console.log("skip user %s", item.account);
      continue;
    }
    eligibleUsers++;

    jsonResult[item.account] = userRebates.toString();
  }

  overrideReceivers(jsonResult);

  console.log(
    "Trading incentives for period from %s to %s",
    fromDate.toISOString().substring(0, 10),
    toDate.toISOString().substring(0, 10)
  );

  console.log(
    "sum of position fees paid: %s ARB ($%s)",
    formatAmount(userTotalPositionFeesInArb, 18, 2, true),
    formatAmount(userTotalPositionFeesUsd, 30, 2, true)
  );

  console.log("allocation: %s ARB", formatAmount(allocationData.trading.allocation, 18, 2, true));
  console.log("used allocation %s ARB", formatAmount(usedAllocation, 18, 2, true));

  console.log(
    "initial rebate percent: %s%, adjusted rebate percent: %s%",
    formatAmount(allocationData.trading.rebatePercent, 2, 2),
    formatAmount(adjustedRebatePercent, 2, 2)
  );
  console.log("min reward threshold: %s ARB", formatAmount(MIN_REWARD_THRESHOLD, 18, 2));
  console.log("eligible users: %s", eligibleUsers);
  console.log("users below threshold: %s", usersBelowThreshold);

  console.log("sum of user rewards: %s ARB", formatAmount(userTotalRewards, 18, 2, true));

  const tokens = await hre.gmx.getTokens();
  const arbToken = tokens.ARB;

  saveDistribution(
    fromDate,
    "stipTradingIncentives",
    arbToken.address,
    jsonResult,
    STIP_TRADING_INCENTIVES_DISTRIBUTION_TYPE_ID
  );
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
