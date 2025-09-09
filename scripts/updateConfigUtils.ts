import prompts from "prompts";
import {
  appendAddressConfigIfDifferent,
  appendBoolConfigIfDifferent,
  appendUintConfigIfDifferent,
  getFullKey,
} from "../utils/config";
import { bigNumberify } from "../utils/math";
import { handleInBatches } from "../utils/batch";

export interface ConfigChangeItem {
  type: string;
  baseKey: string;
  keyData?: string;
  value: any;
  label: string;
}

export enum ChangeResult {
  NO_CHANGES,
  SIMULATE,
  WRITE,
}

export async function handleConfigChanges(
  items: ConfigChangeItem[],
  write: boolean,
  batchSize = 0
): Promise<ChangeResult> {
  const dataStore = await hre.ethers.getContract("DataStore");
  const multicall = await hre.ethers.getContract("Multicall3");
  const config = await hre.ethers.getContract("Config");

  const configKeys = [];
  const multicallReadParams = [];
  const types = [];

  for (const item of items) {
    const key = getFullKey(item.baseKey, item.keyData);

    configKeys.push(key);
    types.push(item.type);

    if (item.type === "uint") {
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [key]),
      });
    } else if (item.type === "address") {
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getAddress", [key]),
      });
    } else if (item.type === "bool") {
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getBool", [key]),
      });
    } else {
      throw new Error(`Unsupported type: ${item.type}`);
    }
  }

  const result = await multicall.callStatic.aggregate3(multicallReadParams);
  const dataCache = {};
  for (let i = 0; i < configKeys.length; i++) {
    const type = types[i];
    const key = configKeys[i];
    const value = result[i].returnData;
    if (type === "uint") {
      dataCache[key] = bigNumberify(value);
    } else if (type === "address") {
      dataCache[key] = ethers.utils.defaultAbiCoder.decode(["address"], value)[0];
    } else if (type === "bool") {
      dataCache[key] = ethers.utils.defaultAbiCoder.decode(["bool"], value)[0];
    } else {
      throw new Error(`Unsupported type: ${type}`);
    }
  }

  const multicallWriteParams = [];

  for (const item of items) {
    if (item.type === "uint") {
      await appendUintConfigIfDifferent(
        multicallWriteParams,
        dataCache,
        item.baseKey,
        item.keyData,
        item.value,
        item.label
      );
    } else if (item.type === "address") {
      await appendAddressConfigIfDifferent(
        multicallWriteParams,
        dataCache,
        item.baseKey,
        item.keyData,
        item.value,
        item.label
      );
    } else if (item.type === "bool") {
      await appendBoolConfigIfDifferent(
        multicallWriteParams,
        dataCache,
        item.baseKey,
        item.keyData,
        item.value,
        item.label
      );
    } else {
      throw new Error(`Unsupported type: ${item.type}`);
    }
  }

  if (multicallWriteParams.length === 0) {
    console.log("no changes to apply");
    return ChangeResult.NO_CHANGES;
  }

  console.log(`updating ${multicallWriteParams.length} params`);
  console.log("multicallWriteParams", multicallWriteParams);

  const { roles } = await hre.gmx.getRoles();
  const from = Object.keys(roles.CONFIG_KEEPER)[0];
  if (batchSize == 0) {
    batchSize = multicallWriteParams.length;
  }
  await handleInBatches(multicallWriteParams, batchSize, async (batch) => {
    await config.connect(from).callStatic.multicall(batch);
  });

  if (!write) {
    ({ write } = await prompts({
      type: "confirm",
      name: "write",
      message: "Do you want to execute the transactions?",
    }));
  }

  try {
    if (write) {
      await handleInBatches(multicallWriteParams, batchSize, async (batch) => {
        const tx = await config.multicall(batch);
        console.log(`tx sent: ${tx.hash}`);
      });
      return ChangeResult.WRITE;
    } else {
      console.log("NOTE: executed in read-only mode, no transactions were sent");
      return ChangeResult.SIMULATE;
    }
  } catch (ex) {
    if (
      ex.errorName === "InvalidBaseKey" &&
      hre.network.name === "avalanche" &&
      process.env.SKIP_GLV_LIMITS_AVALANCHE !== "true"
    ) {
      console.error(ex);
      console.log("Use SKIP_GLV_LIMITS_AVALANCHE=true to skip updating GLV gas limits on Avalanche");
    }

    throw ex;
  }
}
