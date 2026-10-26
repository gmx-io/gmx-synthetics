import prompts from "prompts";
import { ethers } from "ethers";
import {
  appendAddressConfigIfDifferent,
  appendBoolConfigIfDifferent,
  appendUintConfigIfDifferent,
  appendIntConfigIfDifferent,
  getFullKey,
} from "../utils/config";
import { bigNumberify } from "../utils/math";
import * as keys from "../utils/keys";
import { handleInBatches } from "../utils/batch";

const isCliCall = process.env.CLI === "true";

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

// Config rejects any write that leaves the deposit or withdrawal cap above the trader cap.
// Each dependent cap goes first if it fits under the current trader cap, otherwise the trader cap goes first.
// Collect both dependencies before reordering so that moving one cap cannot invalidate the other cap's order.
export function orderMaxPnlFactorItems(items: ConfigChangeItem[], dataCache: Record<string, any>): ConfigChangeItem[] {
  const decodeMaxPnlFactorItem = (item: ConfigChangeItem) => {
    if (item.type !== "uint" || item.baseKey !== keys.MAX_PNL_FACTOR || !item.keyData) {
      return undefined;
    }
    try {
      const [pnlFactorType, market, isLong] = ethers.utils.defaultAbiCoder.decode(
        ["bytes32", "address", "bool"],
        item.keyData
      );
      return { pnlFactorType, market, isLong };
    } catch (e) {
      return undefined;
    }
  };

  const prerequisites = new Map<ConfigChangeItem, ConfigChangeItem[]>();

  for (const dependentItem of items) {
    const dependent = decodeMaxPnlFactorItem(dependentItem);
    if (
      !dependent ||
      (dependent.pnlFactorType !== keys.MAX_PNL_FACTOR_FOR_DEPOSITS &&
        dependent.pnlFactorType !== keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS)
    ) {
      continue;
    }

    const tradersItem = items.find((item) => {
      const traders = decodeMaxPnlFactorItem(item);
      return (
        traders &&
        traders.pnlFactorType === keys.MAX_PNL_FACTOR_FOR_TRADERS &&
        traders.market === dependent.market &&
        traders.isLong === dependent.isLong
      );
    });
    if (!tradersItem) {
      continue;
    }

    const currentTraders = dataCache[getFullKey(tradersItem.baseKey, tradersItem.keyData)];
    const dependentFirst = currentTraders !== undefined && bigNumberify(dependentItem.value).lte(currentTraders);
    const [first, second] = dependentFirst ? [dependentItem, tradersItem] : [tradersItem, dependentItem];
    prerequisites.set(second, [...(prerequisites.get(second) || []), first]);
  }

  const ordered: ConfigChangeItem[] = [];
  const emitted = new Set<ConfigChangeItem>();
  const appendWithPrerequisites = (item: ConfigChangeItem) => {
    if (emitted.has(item)) {
      return;
    }
    for (const prerequisite of prerequisites.get(item) || []) {
      appendWithPrerequisites(prerequisite);
    }
    emitted.add(item);
    ordered.push(item);
  };
  for (const item of items) {
    appendWithPrerequisites(item);
  }

  return ordered;
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
    } else if (item.type === "int") {
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getInt", [key]),
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

  let result = [];

  if (batchSize == 0) {
    batchSize = 50;
  }

  await handleInBatches(multicallReadParams, batchSize, async (batch) => {
    const batchResult = await multicall.callStatic.aggregate3(batch);
    result = result.concat(batchResult);
  });

  const dataCache = {};
  for (let i = 0; i < configKeys.length; i++) {
    const type = types[i];
    const key = configKeys[i];
    const value = result[i].returnData;
    if (type === "uint") {
      dataCache[key] = bigNumberify(value);
    } else if (type === "int") {
      dataCache[key] = ethers.utils.defaultAbiCoder.decode(["int256"], value)[0];
    } else if (type === "address") {
      dataCache[key] = ethers.utils.defaultAbiCoder.decode(["address"], value)[0];
    } else if (type === "bool") {
      dataCache[key] = ethers.utils.defaultAbiCoder.decode(["bool"], value)[0];
    } else {
      throw new Error(`Unsupported type: ${type}`);
    }
  }

  const multicallWriteParams = [];

  for (const item of orderMaxPnlFactorItems(items, dataCache)) {
    if (item.type === "uint") {
      await appendUintConfigIfDifferent(
        multicallWriteParams,
        dataCache,
        item.baseKey,
        item.keyData,
        item.value,
        item.label
      );
    } else if (item.type === "int") {
      await appendIntConfigIfDifferent(
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

  const [signer] = await hre.ethers.getSigners();
  console.log("config update signer:", signer.address);
  // later writes may depend on earlier ones, e.g. deposit and withdrawal caps must not exceed
  // the trader cap, so each batch is simulated on top of the batches before it
  const simulatedWriteParams = [];
  await handleInBatches(multicallWriteParams, batchSize, async (batch) => {
    simulatedWriteParams.push(...batch);
    await config.connect(signer).callStatic.multicall(simulatedWriteParams);
  });

  if (!write && !isCliCall) {
    ({ write } = await prompts({
      type: "confirm",
      name: "write",
      message: "Do you want to execute the transactions?",
    }));
  }

  try {
    if (write) {
      await handleInBatches(multicallWriteParams, batchSize, async (batch) => {
        const tx = await config.connect(signer).multicall(batch);
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
