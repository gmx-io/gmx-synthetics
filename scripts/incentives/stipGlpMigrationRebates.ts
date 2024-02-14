import hre from "hardhat";
import { bigNumberify, expandDecimals, formatAmount } from "../../utils/math";
import {
  STIP_MIGRATION_DISTRIBUTION_TYPE_ID,
  getBlockByTimestamp,
  overrideReceivers,
  processArgs,
  requestSubgraph,
  saveDistribution,
} from "./helpers";

const BASIS_POINTS_DIVISOR = 10000;

async function requestMigrationData(fromTimestamp: number, fromBlockNumber: number, toBlockNumber: number) {
  const data: {
    userGlpGmMigrationStats: {
      gmDepositUsd: string;
      glpRedemptionUsd: string;
      eligibleRedemptionInArb: string;
      eligibleRedemptionUsd: string;
      glpRedemptionWeightedAverageFeeBps: number;
      account: string;
    }[];
    glpGmMigrationStatBefore: {
      eligibleRedemptionInArb: string;
    };
    glpGmMigrationStatAfter: {
      eligibleRedemptionInArb: string;
    };
  } = await requestSubgraph(`{
    userGlpGmMigrationStats(
      first: 10000,
      where: {
        timestamp: ${fromTimestamp},
        period: "1w"
        eligibleRedemptionInArb_gt: 0
      }
    ) {
      gmDepositUsd
      glpRedemptionUsd
      glpRedemptionWeightedAverageFeeBps
      eligibleRedemptionInArb
      eligibleRedemptionUsd
      account
    }
    glpGmMigrationStatBefore: glpGmMigrationStat(
      id:"total",
      block: {
        number: ${fromBlockNumber}
      }
    ) {
      eligibleRedemptionInArb
    }
    glpGmMigrationStatAfter: glpGmMigrationStat(
      id:"total",
      block: {
        number: ${toBlockNumber}
      }
    ) {
      eligibleRedemptionInArb
    }
  }`);

  return {
    userGlpGmMigrationStats: data.userGlpGmMigrationStats
      .map((item) => {
        return {
          ...item,
          gmDepositUsd: bigNumberify(item.gmDepositUsd),
          glpRedemptionUsd: bigNumberify(item.glpRedemptionUsd),
          eligibleRedemptionInArb: bigNumberify(item.eligibleRedemptionInArb),
          eligibleRedemptionUsd: bigNumberify(item.eligibleRedemptionUsd),
        };
      })
      .sort((a, b) => (a.eligibleRedemptionInArb.lt(b.eligibleRedemptionInArb) ? -1 : 1)),
    eligibleRedemptionInArbBefore: bigNumberify(data.glpGmMigrationStatBefore?.eligibleRedemptionInArb ?? 0),
    eligibleRedemptionInArbAfter: bigNumberify(data.glpGmMigrationStatAfter.eligibleRedemptionInArb),
  };
}

async function main() {
  throw new Error("GLP migration incentives are ended");

  const { fromTimestamp, fromDate, toTimestamp, toDate } = processArgs();

  const [fromBlock, toBlock] = await Promise.all([
    getBlockByTimestamp(fromTimestamp),
    getBlockByTimestamp(toTimestamp),
  ]);

  console.log("Running script to get distribution data");
  console.log("From: %s (timestamp %s)", fromDate.toISOString().substring(0, 19), fromTimestamp);
  console.log("To: %s (timestamp %s)", toDate.toISOString().substring(0, 19), toTimestamp);

  const { userGlpGmMigrationStats, eligibleRedemptionInArbAfter, eligibleRedemptionInArbBefore } =
    await requestMigrationData(fromTimestamp, fromBlock.number, toBlock.number);

  if (userGlpGmMigrationStats.length === 0) {
    console.warn("WARN: no migration data for this period");
    return;
  }

  const highestRebateBps = Math.max(...userGlpGmMigrationStats.map((data) => data.glpRedemptionWeightedAverageFeeBps));
  console.log("highest rebate bps: %s", highestRebateBps);

  const jsonResult: Record<string, string> = {};
  const MIN_REWARD_THRESHOLD = expandDecimals(1, 17); // 0.1 ARB
  let userTotalRewards = bigNumberify(0);
  let usersBelowThreshold = 0;
  let eligibleUsers = 0;
  let glpRedemptionWeightedAverageFeeBpsSum = 0;
  let userEligibleRedemptionInArb = bigNumberify(0);

  for (const item of userGlpGmMigrationStats) {
    const userRebates = item.eligibleRedemptionInArb
      .mul(item.glpRedemptionWeightedAverageFeeBps)
      .div(BASIS_POINTS_DIVISOR);

    userEligibleRedemptionInArb = userEligibleRedemptionInArb.add(item.eligibleRedemptionInArb);

    userTotalRewards = userTotalRewards.add(userRebates);
    glpRedemptionWeightedAverageFeeBpsSum += item.glpRedemptionWeightedAverageFeeBps;

    console.log(
      "user %s rebate %s: eligible redemption: %s %s redeemed glp: $%s rebates fee bps: %s gm deposit: $%s",
      item.account,
      formatAmount(userRebates, 18, 2, true),
      `${formatAmount(item.eligibleRedemptionInArb, 18, 2, true)} ARB`.padEnd(15),
      `($${formatAmount(item.eligibleRedemptionUsd, 30, 2, true)})`.padEnd(14),
      formatAmount(item.glpRedemptionUsd, 30, 2, true).padEnd(12),
      item.glpRedemptionWeightedAverageFeeBps.toString().padEnd(2),
      formatAmount(item.gmDepositUsd, 30, 2, true).padEnd(12)
    );

    if (userRebates.lt(MIN_REWARD_THRESHOLD)) {
      usersBelowThreshold++;
      continue;
    }
    eligibleUsers++;

    jsonResult[item.account] = userRebates.toString();
  }

  overrideReceivers(jsonResult);

  console.log(
    "GLP to GM migration for period from %s to %s",
    fromDate.toISOString().substring(0, 10),
    toDate.toISOString().substring(0, 10)
  );

  console.log(
    "average redemption bps: %s",
    (glpRedemptionWeightedAverageFeeBpsSum / userGlpGmMigrationStats.length).toFixed(2)
  );
  console.log("min reward threshold: %s ARB", formatAmount(MIN_REWARD_THRESHOLD, 18, 2));
  console.log("eligible users: %s", eligibleUsers);
  console.log("users below threshold: %s", usersBelowThreshold);

  console.log(
    "global eligible redemptions before: %s ARB after: %s ARB (+%s ARB)",
    formatAmount(eligibleRedemptionInArbBefore, 18, 2, true),
    formatAmount(eligibleRedemptionInArbAfter, 18, 2, true),
    formatAmount(eligibleRedemptionInArbAfter.sub(eligibleRedemptionInArbBefore), 18, 2, true)
  );
  console.log("sum of user eligible redemptions: %s ARB", formatAmount(userEligibleRedemptionInArb, 18, 2, true));
  console.log("sum of user rewards: %s ARB", formatAmount(userTotalRewards, 18, 2, true));

  const tokens = await hre.gmx.getTokens();
  const arbToken = tokens.ARB;

  saveDistribution(
    fromDate,
    "stipGlpMigrationRebates",
    arbToken.address,
    jsonResult,
    STIP_MIGRATION_DISTRIBUTION_TYPE_ID
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
