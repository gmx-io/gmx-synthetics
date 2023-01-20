import { ethers } from "ethers";

export const MAX_UINT8 = "255"; // 2^8 - 1
export const MAX_UINT32 = "4294967295"; // 2^32 - 1
export const MAX_UINT64 = "18446744073709551615"; // 2^64 - 1

export function bigNumberify(n) {
  return ethers.BigNumber.from(n);
}

export function expandDecimals(n, decimals) {
  return bigNumberify(n).mul(bigNumberify(10).pow(decimals));
}

export function decimalToFloat(value, decimals = 0) {
  return expandDecimals(value, 30 - decimals);
}
