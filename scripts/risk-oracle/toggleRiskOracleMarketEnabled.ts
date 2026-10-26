import hre from "hardhat";

import { isRiskOracleMarketEnabledKey } from "../../utils/keys";

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const config = await hre.ethers.getContract("RiskOracleConfig");
  const keyLabel = "RISK_ORACLE_MARKET_ENABLED";

  const ENABLED = process.env.IS_ENABLED;
  if (!ENABLED) {
    throw new Error("IS_ENABLED is not set");
  }

  const marketToken = process.env.MARKET;
  if (!marketToken) {
    throw new Error("MARKET is not set");
  }

  const originalValue = await dataStore.getBool(isRiskOracleMarketEnabledKey(marketToken));
  console.log(`${keyLabel}:`, originalValue.toString());

  if (originalValue.toString() === ENABLED) {
    throw new Error("Already set");
  }
  await config.setRiskOracleMarketEnabled(marketToken, ENABLED === "true");

  const newValue = await dataStore.getBool(isRiskOracleMarketEnabledKey(marketToken));
  console.log(`${keyLabel}:`, newValue.toString());
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
