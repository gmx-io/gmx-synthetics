import { calculateCreate2 } from "eth-create2-calculator";

import GlvArtifact from "../../artifacts/contracts/glv/Glv.sol/Glv.json";

import { hashData } from "../hash";

export * from "./glvDeposit";
export * from "./glvWithdrawal";
export * from "./glvShift";

export function getGlvAddress(
  longToken: string,
  shortToken: string,
  glvType: string,
  glvFactoryAddress: string,
  roleStoreAddress: string,
  dataStoreAddress: string
) {
  const salt = hashData(["string", "address", "address", "bytes32"], ["GMX_GLV", longToken, shortToken, glvType]);
  const byteCode = GlvArtifact.bytecode;
  return calculateCreate2(glvFactoryAddress, salt, byteCode, {
    params: [roleStoreAddress, dataStoreAddress],
    types: ["address", "address"],
  });
}