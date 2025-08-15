import { ethers } from "ethers";
const { getAddress, keccak256, toUtf8Bytes } = ethers;

export function encodeData(dataTypes, dataValues) {
  const bytes = ethers.AbiCoder.defaultAbiCoder().encode(dataTypes, dataValues);
  return ethers.toBeHex(bytes);
}

export function decodeData(dataTypes, data) {
  return ethers.AbiCoder.defaultAbiCoder().decode(dataTypes, data);
}

export function hashData(dataTypes, dataValues) {
  const bytes = ethers.AbiCoder.defaultAbiCoder().encode(dataTypes, dataValues);
  const hash = ethers.keccak256(ethers.getBytes(bytes));

  return hash;
}

export function hashString(string) {
  return hashData(["string"], [string]);
}

export function keccakString(string) {
  return keccak256(toUtf8Bytes(string));
}

export function getAddressFromHash(hash: string) {
  // Extract the last 20 bytes of the hash to construct the address
  return getAddress("0x" + hash.slice(-40));
}
