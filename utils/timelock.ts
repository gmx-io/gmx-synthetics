import prompts from "prompts";

import { signExternally } from "./signer";
import { hashString } from "./hash";
import { TimelockConfig } from "../typechain-types";
import * as keys from "./keys";

export async function timelockWriteMulticall({ timelock, multicallWriteParams }) {
  console.info("multicallWriteParams", multicallWriteParams);

  if (multicallWriteParams.length === 0) {
    return;
  }

  await hre.deployments.read(
    "Timelock",
    {
      from: "0xE014cbD60A793901546178E1c16ad9132C927483",
      log: true,
    },
    "multicall",
    multicallWriteParams
  );

  let write = process.env.WRITE === "true";

  if (!write) {
    ({ write } = await prompts({
      type: "confirm",
      name: "write",
      message: "Do you want to execute the transactions?",
    }));
  }

  if (write) {
    if (multicallWriteParams.length === 0) {
      throw new Error("multicallWriteParams is empty");
    }
    await signExternally(await timelock.populateTransaction.multicall(multicallWriteParams));
  } else {
    console.info("NOTE: executed in read-only mode, no transactions were sent, simulation was successful");
  }
}

export async function cancelAction(timelock: TimelockConfig, target: string, payload: string) {
  const id = await timelock.getHash(target, payload);
  await cancelActionById(timelock, id);
}

export async function cancelActionById(timelock: TimelockConfig, id: string) {
  await timelock.cancelAction(id);
}

export async function setPriceFeedPayload(
  token: string,
  priceFeedAddress: string,
  priceFeedMultiplier: any,
  priceFeedHeartbeatDuration: any,
  stablePrice: any
) {
  const dataStore = await hre.ethers.getContract("DataStore");
  const targets = [dataStore.address, dataStore.address, dataStore.address, dataStore.address];
  const values = [0, 0, 0, 0];
  const payloads = [
    dataStore.interface.encodeFunctionData("setAddress", [keys.priceFeedKey(token), priceFeedAddress]),
    dataStore.interface.encodeFunctionData("setUint", [keys.priceFeedMultiplierKey(token), priceFeedMultiplier]),
    dataStore.interface.encodeFunctionData("setUint", [
      keys.priceFeedHeartbeatDurationKey(token),
      priceFeedHeartbeatDuration,
    ]),
    dataStore.interface.encodeFunctionData("setUint", [keys.stablePriceKey(token), stablePrice]),
  ];
  return { targets, values, payloads };
}

export async function setDataStreamPayload(
  token: string,
  feedId: string,
  dataStreamMultiplier: any,
  dataStreamSpreadReductionFactor: any
) {
  const dataStore = await hre.ethers.getContract("DataStore");

  const targets = [dataStore.address, dataStore.address, dataStore.address];
  const values = [0, 0, 0];
  const payloads = [
    dataStore.interface.encodeFunctionData("setBytes32", [keys.dataStreamIdKey(token), hashString(feedId)]),
    dataStore.interface.encodeFunctionData("setUint", [keys.dataStreamMultiplierKey(token), dataStreamMultiplier]),
    dataStore.interface.encodeFunctionData("setUint", [
      keys.dataStreamSpreadReductionFactorKey(token),
      dataStreamSpreadReductionFactor,
    ]),
  ];

  return { targets, values, payloads };
}

export async function getGrantRolePayload(address: string, roleKey: string) {
  const roleStore = await hre.ethers.getContract("RoleStore");
  return {
    target: roleStore.address,
    payload: roleStore.interface.encodeFunctionData("grantRole", [address, roleKey]),
  };
}

export async function getRevokeRolePayload(address: string, roleKey: string) {
  const roleStore = await hre.ethers.getContract("RoleStore");
  return {
    target: roleStore.address,
    payload: roleStore.interface.encodeFunctionData("revokeRole", [address, roleKey]),
  };
}

export async function setOracleProviderEnabledPayload(providerAddress: string, value: boolean) {
  const dataStore = await hre.ethers.getContract("DataStore");
  return {
    target: dataStore.address,
    payload: dataStore.interface.encodeFunctionData("setBool", [
      keys.isOracleProviderEnabledKey(providerAddress),
      value,
    ]),
  };
}

export async function setOracleProviderForTokenPayload(tokenAddress: string, providerAddress: string) {
  const dataStore = await hre.ethers.getContract("DataStore");
  return {
    target: dataStore.address,
    payload: dataStore.interface.encodeFunctionData("setAddress", [
      keys.oracleProviderForTokenKey(tokenAddress),
      providerAddress,
    ]),
  };
}

export async function setAtomicOracleProviderPayload(providerAddress: string, value: boolean) {
  const dataStore = await hre.ethers.getContract("DataStore");
  return {
    target: dataStore.address,
    payload: dataStore.interface.encodeFunctionData("setBool", [
      keys.isAtomicOracleProviderKey(providerAddress),
      value,
    ]),
  };
}
