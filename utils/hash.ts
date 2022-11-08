import { ethers } from "ethers";

export function hashData(dataTypes, dataValues) {
  const bytes = ethers.utils.defaultAbiCoder.encode(dataTypes, dataValues);
  const hash = ethers.utils.keccak256(ethers.utils.arrayify(bytes));

  return hash;
}

export function hashString(string) {
  return ethers.utils.solidityKeccak256(["string"], [string]);
}
