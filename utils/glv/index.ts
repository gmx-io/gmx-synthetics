import { calculateCreate2 } from "eth-create2-calculator";

import GlvTokenArtifact from "../../artifacts/contracts/glv/GlvToken.sol/GlvToken.json";

import * as keys from "../keys";

import { hashData, hashString } from "../hash";

export const DEFAULT_GLV_TYPE = hashString("basic-v1");

export * from "./glvDeposit";
export * from "./glvWithdrawal";
export * from "./glvShift";

export function getGlvAddress(
  longToken: string,
  shortToken: string,
  glvType: string,
  glvName: string,
  glvSymbol: string,
  glvFactoryAddress: string,
  roleStoreAddress: string,
  dataStoreAddress: string
) {
  const salt = hashData(["string", "address", "address", "bytes32"], ["GMX_GLV", longToken, shortToken, glvType]);
  const byteCode = GlvTokenArtifact.bytecode;
  return calculateCreate2(glvFactoryAddress, salt, byteCode, {
    types: ["address", "address", "string", "string"],
    params: [roleStoreAddress, dataStoreAddress, glvName, glvSymbol],
  });
}

export function getGlvKeys(dataStore, start, end) {
  return dataStore.getAddressValuesAt(keys.GLV_LIST, start, end);
}

export function getGlvCount(dataStore) {
  return dataStore.getAddressCount(keys.GLV_LIST);
}

export function getGlvTokenAddresses(longTokenSymbol, shortTokenSymbol, tokens) {
  if (!(longTokenSymbol in tokens)) {
    throw new Error(`Unknown token ${longTokenSymbol}`);
  }
  if (!(shortTokenSymbol in tokens)) {
    throw new Error(`Unknown token ${shortTokenSymbol}`);
  }
  const longToken = tokens[longTokenSymbol].address;
  const shortToken = tokens[shortTokenSymbol].address;
  return [longToken, shortToken];
}

export function getGlvKey(longToken: string, shortToken: string) {
  return [longToken, shortToken].join(":");
}

export function createGlvConfigByKey({ glvConfigs, tokens }) {
  const glvConfigByKey = {};

  // TODO check if long/short tokens are duplicated

  for (const glvConfig of glvConfigs) {
    const [longToken, shortToken] = getGlvTokenAddresses(glvConfig.longToken, glvConfig.shortToken, tokens);
    const glvKey = getGlvKey(longToken, shortToken);
    glvConfigByKey[glvKey] = glvConfig;
  }

  return glvConfigByKey;
}
