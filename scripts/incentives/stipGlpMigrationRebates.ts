import fs from "fs";
import path from "path";
import hre from "hardhat";
import { bigNumberify, expandDecimals, formatAmount } from "../../utils/math";
import { STIP_MIGRATION_DISTRIBUTION_TYPE_ID, getBlockByTimestamp, requestPrices, requestSubgraph } from "./helpers";

const BASIS_POINTS_DIVISOR = 10000;

async function requestMigrationData(fromTimestamp: number, fromBlockNumber: number, toBlockNumber: number) {
  const data: {
    userGlpGmMigrationStats: {
      gmDepositUsd: string;
      glpRedemptionUsd: string;
      eligableRedemptionInArb: string;
      eligableRedemptionUsd: string;
      glpRedemptionWeightedAverageFeeBps: number;
      account: string;
    }[];
    glpGmMigrationStatBefore: {
      eligableRedemptionInArb: string;
    };
    glpGmMigrationStatAfter: {
      eligableRedemptionInArb: string;
    };
  } = await requestSubgraph(`{
    userGlpGmMigrationStats(
      first: 10000,
      where: {
        timestamp: ${fromTimestamp},
        period: "1w"
        eligableRedemptionInArb_gt: 0
      }
    ) {
      gmDepositUsd
      glpRedemptionUsd
      glpRedemptionWeightedAverageFeeBps
      eligableRedemptionInArb
      eligableRedemptionUsd
      account
    }
    glpGmMigrationStatBefore: glpGmMigrationStat(
      id:"total",
      block: {
        number: ${fromBlockNumber}
      }
    ) {
      eligableRedemptionInArb
    }
    glpGmMigrationStatAfter: glpGmMigrationStat(
      id:"total",
      block: {
        number: ${toBlockNumber}
      }
    ) {
      eligableRedemptionInArb
    }
  }`);

  return {
    userGlpGmMigrationStats: data.userGlpGmMigrationStats.map((item) => {
      return {
        ...item,
        gmDepositUsd: bigNumberify(item.gmDepositUsd),
        glpRedemptionUsd: bigNumberify(item.glpRedemptionUsd),
        eligableRedemptionInArb: bigNumberify(item.eligableRedemptionInArb),
        eligableRedemptionUsd: bigNumberify(item.eligableRedemptionUsd),
      };
    }),
    eligableRedemptionInArbBefore: bigNumberify(data.glpGmMigrationStatBefore.eligableRedemptionInArb),
    eligableRedemptionInArbAfter: bigNumberify(data.glpGmMigrationStatAfter.eligableRedemptionInArb),
  };
}

async function main() {
  if (hre.network.name !== "arbitrum") {
    throw new Error("Unsupported network");
  }

  if (!process.env.FROM_DATE) {
    throw new Error("FROM_DATE is required");
  }

  const fromDate = new Date(process.env.FROM_DATE);
  if (fromDate.getDay() !== 3) {
    throw Error(`FROM_DATE should be Wednesday: ${fromDate.getDay()}`);
  }

  const fromTimestamp = Math.floor(+fromDate / 1000);

  let toTimestamp = fromTimestamp + 86400 * 7;
  if (toTimestamp > Date.now() / 1000) {
    console.warn("WARN: epoch has not ended yet");
    toTimestamp = Math.floor(Date.now() / 1000) - 60;
  }
  const toDate = new Date(toTimestamp * 1000);

  const [fromBlock, toBlock] = await Promise.all([
    getBlockByTimestamp(fromTimestamp),
    getBlockByTimestamp(toTimestamp),
  ]);

  console.log("Running script to get distribution data");
  console.log("From: %s (timestamp %s)", fromDate.toISOString().substring(0, 19), fromTimestamp);
  console.log("To: %s (timestamp %s)", toDate.toISOString().substring(0, 19), toTimestamp);

  const { userGlpGmMigrationStats, eligableRedemptionInArbAfter, eligableRedemptionInArbBefore } =
    await requestMigrationData(fromTimestamp, fromBlock.number, toBlock.number);

  if (userGlpGmMigrationStats.length === 0) {
    console.warn("WARN: no migration data for this period");
    return;
  }

  const highestRebateBps = Math.max(...userGlpGmMigrationStats.map((data) => data.glpRedemptionWeightedAverageFeeBps));
  console.log("highest rebate bps: %s", highestRebateBps);

  const amounts: Record<string, string> = {};
  const MIN_REWARD_THRESHOLD = expandDecimals(1, 17); // 0.1 ARB
  let userTotalRewardsInArb = bigNumberify(0);
  let usersBelowThreshold = 0;
  let glpRedemptionWeightedAverageFeeBpsSum = 0;
  let userEligableRedemptionInArb = bigNumberify(0);

  for (const item of userGlpGmMigrationStats) {
    const rebatesInArb = item.eligableRedemptionInArb
      .mul(item.glpRedemptionWeightedAverageFeeBps)
      .div(BASIS_POINTS_DIVISOR);

    userEligableRedemptionInArb = userEligableRedemptionInArb.add(item.eligableRedemptionInArb);

    userTotalRewardsInArb = userTotalRewardsInArb.add(rebatesInArb);
    glpRedemptionWeightedAverageFeeBpsSum += item.glpRedemptionWeightedAverageFeeBps;

    console.log(
      "user %s eligable rebate: %s %s redeemed glp: $%s rebates fee bps: %s gm deposit: $%s",
      item.account,
      `${formatAmount(item.eligableRedemptionInArb, 18, 2, true)} ARB`.padEnd(13),
      `($${formatAmount(item.eligableRedemptionUsd, 30, 2, true)})`.padEnd(12),
      formatAmount(item.glpRedemptionUsd, 30, 2, true).padEnd(12),
      item.glpRedemptionWeightedAverageFeeBps.toString().padEnd(2),
      formatAmount(item.gmDepositUsd, 30, 2, true).padEnd(12)
    );

    if (rebatesInArb.lt(MIN_REWARD_THRESHOLD)) {
      usersBelowThreshold++;
      continue;
    }

    amounts[item.account] = rebatesInArb.toString();
  }

  console.log(
    "average redemption bps: %s",
    (glpRedemptionWeightedAverageFeeBpsSum / userGlpGmMigrationStats.length).toFixed(2)
  );
  console.log("min reward threshold: %s ARB", formatAmount(MIN_REWARD_THRESHOLD, 18, 2));
  console.log("eligable users: %s", Object.keys(amounts).length);
  console.log("users below threshold: %s", usersBelowThreshold);

  console.log(
    "global eligable redemptions before: %s ARB after: %s ARB (%s ARB)",
    formatAmount(eligableRedemptionInArbBefore, 18, 2, true),
    formatAmount(eligableRedemptionInArbAfter, 18, 2, true),
    formatAmount(eligableRedemptionInArbAfter.sub(eligableRedemptionInArbBefore), 18, 2, true)
  );
  console.log("sum of user eligable redemptions: %s ARB", formatAmount(userEligableRedemptionInArb, 18, 2, true));
  console.log("sum of user rewards: %s ARB", formatAmount(userTotalRewardsInArb, 18, 2));

  const filename = path.join(
    __dirname,
    "distributions",
    `stipGlpMigrationRebatesDistribution_${fromDate.toISOString().substring(0, 10)}.json`
  );
  const tokens = await hre.gmx.getTokens();
  const arbToken = tokens.ARB;

  fs.writeFileSync(
    filename,
    JSON.stringify(
      {
        token: arbToken.address,
        distributionTypeId: STIP_MIGRATION_DISTRIBUTION_TYPE_ID,
        amounts,
        fromTimestamp,
        toTimestamp,
      },
      null,
      4
    )
  );
  console.log("data is saved to %s", filename);

  // console.log("migrationData", migrationData);
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
