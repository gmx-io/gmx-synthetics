import hre from "hardhat";

import { encodeData } from "../utils/hash";
import { getFullKey } from "../utils/config";
import { handleInBatches } from "../utils/batch";
import * as keys from "../utils/keys";

export async function updateRiskOracleConfig({ write }) {
  const riskOracleConfig = await hre.gmx.getRiskOracle();

  const dataStore = await hre.ethers.getContract("DataStore");
  const multicall = await hre.ethers.getContract("Multicall3");
  const config = await hre.ethers.getContract("Config");

  const syncConfigKeys = [];
  const multicallReadParams = [];

  if (!riskOracleConfig) {
    throw new Error("no configuration found for the current network");
  }
  
  if (riskOracleConfig.markets) {
    for (const [marketAddress, marketConfig] of Object.entries(riskOracleConfig.markets)) {
      if (marketConfig.syncConfigMarketDisabled !== undefined) {
        const baseKey = keys.SYNC_CONFIG_MARKET_DISABLED;
        const data = encodeData(["address"], [marketAddress]);
        const key = getFullKey(baseKey, data);
        
        syncConfigKeys.push({
          description: `key: SYNC_CONFIG_MARKET_DISABLED for market: ${marketAddress}`,
          baseKey: baseKey,
          data: data,
          key: key,
          newValue: marketConfig.syncConfigMarketDisabled,
        });
        
        multicallReadParams.push({
          target: dataStore.address,
          allowFailure: false,
          callData: dataStore.interface.encodeFunctionData("getBool", [key]),
        });
      }

      if (marketConfig.parameters) {
        for (const [parameterKey, parameterValue] of Object.entries(marketConfig.parameters)) {
          const baseKey = keys.SYNC_CONFIG_MARKET_PARAMETER_DISABLED;
          const data = encodeData(["address", "string"], [marketAddress, parameterKey]);
          const key = getFullKey(baseKey, data);
          
          syncConfigKeys.push({
            description: `key: SYNC_CONFIG_MARKET_PARAMETER_DISABLED for market: ${marketAddress} and parameter: ${parameterKey}`,
            baseKey: baseKey,
            data: data,
            key: key,
            newValue: parameterValue,
          });
          
          multicallReadParams.push({
            target: dataStore.address,
            allowFailure: false,
            callData: dataStore.interface.encodeFunctionData("getBool", [key]),
          });
        }
      }
    }
  }

  if (riskOracleConfig.parameters) {
    for (const [parameterKey, parameterValue] of Object.entries(riskOracleConfig.parameters)) {
      const baseKey = keys.SYNC_CONFIG_PARAMETER_DISABLED;
      const data = encodeData(["string"], [parameterKey]);
      const key = getFullKey(baseKey, data);
      
      syncConfigKeys.push({
        description: `key: SYNC_CONFIG_PARAMETER_DISABLED for parameter: ${parameterKey}`,
        baseKey: baseKey,
        data: data,
        key: key,
        newValue: parameterValue,
      });

      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getBool", [key]),
      });
    }
  }

  const result = await multicall.callStatic.aggregate3(multicallReadParams);
  const multicallWriteParams = [];

  for (let i = 0; i < syncConfigKeys.length; i++) {
    const description = syncConfigKeys[i].description;
    const baseKey = syncConfigKeys[i].baseKey;
    const data = syncConfigKeys[i].data;
    const oldValue = ethers.utils.defaultAbiCoder.decode(["bool"], result[i].returnData)[0];
    const newValue = syncConfigKeys[i].newValue;
    
    if (newValue !== oldValue) {
      multicallWriteParams.push(
        config.interface.encodeFunctionData("setBool", [
          baseKey,
          data,
          newValue,
        ])
      );
      console.info(`updating ${description} from ${oldValue} to ${newValue}`);
    } else {
      console.info(`skipping ${description} as it is already set to ${newValue}`);
    }
  }

  console.info(`updating ${multicallWriteParams.length} params`);
  console.info("multicallWriteParams", multicallWriteParams);

  if (write) {
    await handleInBatches(multicallWriteParams, 100, async (batch) => {
      const tx = await config.multicall(batch);
      console.info(`tx sent: ${tx.hash}`);
    });
  } else {
    console.info("NOTE: executed in read-only mode, no transactions were sent");
  }
}