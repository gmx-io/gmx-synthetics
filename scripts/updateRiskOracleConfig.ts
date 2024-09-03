import hre from "hardhat";
import { encodeData } from "../utils/hash";
import { getFullKey } from "../utils/config";
import * as keys from "../utils/keys";

export async function main() {
  const riskOracleConfig = await hre.gmx.getRiskOracle();

  const dataStore = await hre.ethers.getContract("DataStore");
  const config = await hre.ethers.getContract("Config");

  if (!riskOracleConfig) {
    throw new Error("No configuration found for the current network");
  }

  const syncConfigKeys = [];
  
  for (const marketAddress in riskOracleConfig.markets) {
    const marketConfig = riskOracleConfig.markets[marketAddress];
    syncConfigKeys.push({
      baseKey: keys.SYNC_CONFIG_MARKET_DISABLED,
      data: encodeData(["address"], [marketAddress]),
      newValue: marketConfig.syncConfigMarketDisabled,
      description: `market: ${marketAddress}, market disabled: ${marketConfig.syncConfigMarketDisabled}`,
    });
    for (const marketParameter in marketConfig.marketParameters) {
      syncConfigKeys.push({
        baseKey: keys.SYNC_CONFIG_MARKET_PARAMETER_DISABLED,
        data: encodeData(["address", "string"], [marketAddress, marketParameter]),
        newValue: marketConfig.marketParameters[marketParameter],
        description: `market: ${marketAddress}, parameter: ${marketParameter}, parameter disabled for market: ${marketConfig.marketParameters[marketParameter]}`,
      });
    }
  }

  for (const parameter in riskOracleConfig.parameters) {
    syncConfigKeys.push({
      baseKey: keys.SYNC_CONFIG_PARAMETER_DISABLED,
      data: encodeData(["string"], [parameter]),
      newValue: riskOracleConfig.parameters[parameter],
      description: `parameter: ${parameter}, parameter disabled: ${riskOracleConfig.parameters[parameter]}`,
    });
  }

  const multicallWriteParams = [];

  for (const syncConfigKey of syncConfigKeys) {
    const baseKey = syncConfigKey.baseKey;
    const data = syncConfigKey.data;
    const key = getFullKey(baseKey, data);

    const newValue = syncConfigKey.newValue;
    const oldValue = await dataStore.getBool(key);

    if (newValue !== oldValue) {
      multicallWriteParams.push(
        config.interface.encodeFunctionData("setBool", [
          baseKey,
          data,
          newValue,
        ])
      );
      console.info(`updating: ${syncConfigKey.description}`);
    }
  }

  console.info(`updating for ${multicallWriteParams.length} keys`);
  console.info("multicallWriteParams", multicallWriteParams);

  if (multicallWriteParams.length > 0 && process.env.WRITE === "true") {
    console.log("sending transaction...");
    const tx = await config.multicall(multicallWriteParams);
    console.info(`tx sent: ${tx.hash}`);
  } 
  else if (multicallWriteParams.length === 0 && process.env.WRITE === "true") {
    console.info("no updates needed, thus no transactions were sent");
  }
  else if (multicallWriteParams.length > 0 && process.env.WRITE !== "true") {
    console.info("executed in read-only mode, thus no transactions were sent");
  }
  else {
    console.info("executed in read-only mode and no updates were needed, thus no transactions were sent");
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
