import { ethers } from "ethers";

export function addressToBytes32(address) {
  return ethers.utils.hexlify(ethers.utils.zeroPad(ethers.utils.arrayify(address), 32));
}

export function hashData(dataTypes, dataValues) {
  const bytes = ethers.utils.defaultAbiCoder.encode(dataTypes, dataValues);
  const hash = ethers.utils.keccak256(ethers.utils.arrayify(bytes));

  return hash;
}

export function hashString(string) {
  return hashData(["string"], [string]);
}
