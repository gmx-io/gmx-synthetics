import hre from "hardhat";

import { encodeData } from "../utils/hash";
import * as keys from "../utils/keys";

async function main() {
  const buybackConfig = await hre.gmx.getBuyback();

  const dataStore = await hre.ethers.getContract("DataStore");
  const config = await hre.ethers.getContract("Config");

  for (const { token, amount } of buybackConfig.batchAmounts) {
    const key = keys.buybackBatchAmountKey(token);

    const oldBatchAmount = await dataStore.getUint(key);

    if (oldBatchAmount.eq(amount)) {
      console.log(`no change for buybackBatchAmount(${token}): ${oldBatchAmount.toString()} -> ${amount.toString()}`);
      continue;
    }

    console.log(`updated value for buybackBatchAmount(${token}): ${oldBatchAmount.toString()} -> ${amount.toString()}`);
    if (process.env.WRITE === "true") {
      console.log("sending transaction...");
      const tx = await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [token]), amount);
      console.log("tx sent: %s", tx.hash);
    }
  }

  for (const { version, factor } of buybackConfig.gmxFactors) {
    const key = keys.buybackGmxFactorKey(version);

    const oldFactor = await dataStore.getUint(key);
    if (oldFactor.eq(factor)) {
      console.log(`no change for gmxFactor(${version}): ${oldFactor.toString()} -> ${factor.toString()}`);
      continue;
    }

    console.log(`updated value for gmxFactor(${version}): ${oldFactor.toString()} -> ${factor.toString()}`);
    if (process.env.WRITE === "true") {
      console.log("sending transaction...");
      const tx = await config.setUint(keys.BUYBACK_GMX_FACTOR, encodeData(["uint256"], [version]), factor);
      console.log("tx sent: %s", tx.hash);
    }
  }

  const oldMaxPriceAge = await dataStore.getUint(keys.BUYBACK_MAX_PRICE_AGE);
  if (oldMaxPriceAge == buybackConfig.maxPriceAge) {
    console.log(`no change for maxPriceAge: ${oldMaxPriceAge.toString()} -> ${buybackConfig.maxPriceAge.toString()}`);
  } else {
    console.log(
      `updated value for maxPriceAge: ${oldMaxPriceAge.toString()} -> ${buybackConfig.maxPriceAge.toString()}`
    );

    if (process.env.WRITE === "true") {
      console.log("sending transaction...");
      const tx = await config.setUint(keys.BUYBACK_MAX_PRICE_AGE, "0x", buybackConfig.maxPriceAge);
      console.log("tx sent: %s", tx.hash);
    }
  }

  if (process.env.WRITE !== "true") {
    console.log("NOTE: executed in read-only mode, no transactions were sent");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
