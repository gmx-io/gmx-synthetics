const MAX_UINT8 = "255"; // 2^8 - 1
const MAX_UINT32 = "4294967295"; // 2^32 - 1
const MAX_UINT64 = "18446744073709551615"; // 2^64 - 1

function bigNumberify(n) {
  return ethers.BigNumber.from(n);
}

function expandDecimals(n, decimals) {
  return bigNumberify(n).mul(bigNumberify(10).pow(decimals));
}

function expandFloatDecimals(value) {
  return expandDecimals(value, 30);
}

function decimalToFloat(value, decimals = 0) {
  return expandDecimals(value, 30 - decimals);
}

module.exports = {
  MAX_UINT8,
  MAX_UINT32,
  MAX_UINT64,
  bigNumberify,
  expandDecimals,
  expandFloatDecimals,
  decimalToFloat,
};
