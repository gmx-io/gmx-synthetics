import fs from "fs";
import path from "path";
import hre from "hardhat";
import { bigNumberify, decimalToFloat, expandDecimals, formatAmount } from "../../utils/math";
import { STIP_MIGRATION_DISTRIBUTION_TYPE_ID, requestPrices, requestSubgraph } from "./helpers";

const BASIS_POINTS_DIVISOR = 10000;

async function requestMigrationData(fromTimestamp: number) {
  const data: {
    userGlpGmMigrationStats: {
      gmDepositUsd: string;
      glpRedemptionUsd: string;
      glpRedemptionWeightedAverageFeeBps: number;
      account: string;
    }[];
  } = await requestSubgraph(`{
    userGlpGmMigrationStats(
      first: 10000,
      where: {
        timestamp: ${fromTimestamp},
        period: "1w"
        glpRedemptionUsd_gt: 0
        gmDepositUsd_gt: 0
      }
    ) {
      gmDepositUsd
      glpRedemptionUsd
      glpRedemptionWeightedAverageFeeBps
      account
    }
  }`);

  return data.userGlpGmMigrationStats.map((item) => {
    return {
      ...item,
      gmDepositUsd: bigNumberify(item.gmDepositUsd),
      glpRedemptionUsd: bigNumberify(item.glpRedemptionUsd),
    };
  });
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
    throw Error("Start date should start from Wednesday");
  }

  const fromTimestamp = Math.floor(+fromDate / 1000);

  const toTimestamp = fromTimestamp + 86400 * 7;
  const toDate = new Date(toTimestamp * 1000);

  console.log("Running script to get distribution data");
  console.log("From: %s (timestamp %s)", fromDate.toISOString().substring(0, 19), fromTimestamp);
  console.log("To: %s (timestamp %s)", toDate.toISOString().substring(0, 19), toTimestamp);

  const [prices, migrationData] = await Promise.all([requestPrices(), requestMigrationData(fromTimestamp)]);

  const arbPrice = prices.find((price) => price.tokenSymbol === "ARB").maxPrice;

  if (!arbPrice) {
    throw new Error("ARB price is undefined");
  }
  console.log("ARB price $%s", formatAmount(arbPrice, 12, 3));

  const highestRebateBps = Math.max(...migrationData.map((data) => data.glpRedemptionWeightedAverageFeeBps));
  console.log("highest rebate bps: %s", highestRebateBps);

  const amounts: Record<string, string> = {};
  const REWARD_THRESHOLD = expandDecimals(1, 17); // 0.1 ARB
  let userTotalRewards = bigNumberify(0);
  let usersBelowThreshold = 0;

  for (const item of migrationData) {
    const rebateableGlpRedemptionUsd = item.glpRedemptionUsd;
    if (rebateableGlpRedemptionUsd.lt(item.gmDepositUsd)) {
      rebateableGlpRedemptionUsd.mul(decimalToFloat(1)).div(item.gmDepositUsd);
    }

    const rebatesUsd = rebateableGlpRedemptionUsd
      .mul(item.glpRedemptionWeightedAverageFeeBps)
      .div(BASIS_POINTS_DIVISOR);
    const amount = rebatesUsd.div(arbPrice);

    userTotalRewards = userTotalRewards.add(amount);

    console.log(
      "user %s rebate amount %s %s redeemed glp: $%s rebates fee bps: %s gm deposit: $%s",
      item.account,
      `${formatAmount(amount, 18, 2)} ARB`.padEnd(13),
      `($${formatAmount(rebatesUsd, 30, 2, true)})`.padEnd(12),
      formatAmount(item.glpRedemptionUsd, 30, 2, true).padEnd(12),
      item.glpRedemptionWeightedAverageFeeBps.toString().padEnd(2),
      formatAmount(item.gmDepositUsd, 30, 2, true).padEnd(12)
    );

    if (amount.lt(REWARD_THRESHOLD)) {
      usersBelowThreshold++;
      continue;
    }

    amounts[item.account] = amount.toString();
  }

  console.log("min reward threshold: %s ARB", formatAmount(REWARD_THRESHOLD, 18, 2));
  console.log("eligable users: %s", Object.keys(amounts).length);
  console.log("users below threshold: %s", usersBelowThreshold);

  console.log("sum of user rewards: %s ARB", formatAmount(userTotalRewards, 18, 2));

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
