import { calculateCreate2 } from "eth-create2-calculator";

import GlvTokenArtifact from "../../artifacts/contracts/glv/GlvToken.sol/GlvToken.json";

import * as keys from "../keys";

import { hashData } from "../hash";

export const DEFAULT_GLV_TYPE = ethers.constants.HashZero;

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
