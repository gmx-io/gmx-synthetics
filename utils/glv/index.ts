import { calculateCreate2 } from "eth-create2-calculator";

import GlvTokenArtifact from "../../artifacts/contracts/glv/GlvToken.sol/GlvToken.json";

import { hashData } from "../hash";

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
