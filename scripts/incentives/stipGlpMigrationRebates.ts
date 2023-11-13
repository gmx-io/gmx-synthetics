import fs from "fs";
import path from "path";
import hre from "hardhat";
import { bigNumberify, expandDecimals, formatAmount } from "../../utils/math";
import { STIP_MIGRATION_DISTRIBUTION_TYPE_ID, getBlockByTimestamp, requestSubgraph } from "./helpers";
import { getBatchSenderCalldata } from "./batchSend";

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
    userGlpGmMigrationStats: data.userGlpGmMigrationStats.map((item) => {
      return {
        ...item,
        gmDepositUsd: bigNumberify(item.gmDepositUsd),
        glpRedemptionUsd: bigNumberify(item.glpRedemptionUsd),
        eligibleRedemptionInArb: bigNumberify(item.eligibleRedemptionInArb),
        eligibleRedemptionUsd: bigNumberify(item.eligibleRedemptionUsd),
      };
    }),
    eligibleRedemptionInArbBefore: bigNumberify(data.glpGmMigrationStatBefore?.eligibleRedemptionInArb ?? 0),
    eligibleRedemptionInArbAfter: bigNumberify(data.glpGmMigrationStatAfter.eligibleRedemptionInArb),
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
      "user %s eligible rebate: %s %s redeemed glp: $%s rebates fee bps: %s gm deposit: $%s",
      item.account,
      `${formatAmount(item.eligibleRedemptionInArb, 18, 2, true)} ARB`.padEnd(13),
      `($${formatAmount(item.eligibleRedemptionUsd, 30, 2, true)})`.padEnd(12),
      formatAmount(item.glpRedemptionUsd, 30, 2, true).padEnd(12),
      item.glpRedemptionWeightedAverageFeeBps.toString().padEnd(2),
      formatAmount(item.gmDepositUsd, 30, 2, true).padEnd(12)
    );

    if (userRebates.lt(MIN_REWARD_THRESHOLD)) {
      usersBelowThreshold++;
      continue;
    }

    jsonResult[item.account] = userRebates.toString();
  }

  console.log(
    "average redemption bps: %s",
    (glpRedemptionWeightedAverageFeeBpsSum / userGlpGmMigrationStats.length).toFixed(2)
  );
  console.log("min reward threshold: %s ARB", formatAmount(MIN_REWARD_THRESHOLD, 18, 2));
  console.log("eligible users: %s", Object.keys(jsonResult).length);
  console.log("users below threshold: %s", usersBelowThreshold);

  console.log(
    "global eligible redemptions before: %s ARB after: %s ARB (+%s ARB)",
    formatAmount(eligibleRedemptionInArbBefore, 18, 2, true),
    formatAmount(eligibleRedemptionInArbAfter, 18, 2, true),
    formatAmount(eligibleRedemptionInArbAfter.sub(eligibleRedemptionInArbBefore), 18, 2, true)
  );
  console.log("sum of user eligible redemptions: %s ARB", formatAmount(userEligibleRedemptionInArb, 18, 2, true));
  console.log("sum of user rewards: %s ARB", formatAmount(userTotalRewards, 18, 2));

  const tokens = await hre.gmx.getTokens();
  const arbToken = tokens.ARB;

  const dirpath = path.join(__dirname, "distributions", `epoch_${fromDate.toISOString().substring(0, 10)}`);
  if (!fs.existsSync(dirpath)) {
    fs.mkdirSync(dirpath);
  }
  const filename = path.join(dirpath, `stipGlpMigrationRebatesDistribution.json`);

  fs.writeFileSync(
    filename,
    JSON.stringify(
      {
        token: arbToken.address,
        distributionTypeId: STIP_MIGRATION_DISTRIBUTION_TYPE_ID,
        amounts: jsonResult,
        fromTimestamp,
        toTimestamp,
      },
      null,
      4
    )
  );
  console.log("data is saved to %s", filename);

  const amounts = Object.values(jsonResult);
  const recipients = Object.keys(jsonResult);
  const batchSenderCalldata = getBatchSenderCalldata(
    arbToken.address,
    recipients,
    amounts,
    STIP_MIGRATION_DISTRIBUTION_TYPE_ID
  );
  const filename2 = path.join(dirpath, `stipGlpMigrationRebatesDistribution_transactionData.json`);
  fs.writeFileSync(
    filename2,
    JSON.stringify(
      {
        userTotalRewards: userTotalRewards.toString(),
        batchSenderCalldata,
      },
      null,
      4
    )
  );

  console.log("send batches: %s", Object.keys(batchSenderCalldata).length);
  console.log("batch sender calldata saved to %s", filename2);
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
