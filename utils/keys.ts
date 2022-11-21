import { hashString, hashData } from "./hash";

export const WETH = hashString("WETH");
export const MAX_LEVERAGE = hashString("MAX_LEVERAGE");

export const MIN_ORACLE_BLOCK_CONFIRMATIONS = hashString("MIN_ORACLE_BLOCK_CONFIRMATIONS");
export const MAX_ORACLE_BLOCK_AGE = hashString("MAX_ORACLE_BLOCK_AGE");
export const MIN_ORACLE_SIGNERS = hashString("MIN_ORACLE_SIGNERS");

export const FEE_RECEIVER_DEPOSIT_FACTOR = hashString("FEE_RECEIVER_DEPOSIT_FACTOR");
export const FEE_RECEIVER_WITHDRAWAL_FACTOR = hashString("FEE_RECEIVER_WITHDRAWAL_FACTOR");
export const FEE_RECEIVER_WITHDRAWAL_FACTOR = hashString("FEE_RECEIVER_WITHDRAWAL_FACTOR");

export const PRICE_FEED = hashString("PRICE_FEED");
export const PRICE_FEED_MULTIPLIER = hashString("PRICE_FEED_MULTIPLIER");
export const ORACLE_TYPE = hashString("ORACLE_TYPE");
export const RESERVE_FACTOR = hashString("RESERVE_FACTOR");
export const SWAP_FEE_FACTOR = hashString("SWAP_FEE_FACTOR");
export const SWAP_IMPACT_FACTOR = hashString("SWAP_IMPACT_FACTOR");
export const SWAP_IMPACT_EXPONENT_FACTOR = hashString("SWAP_IMPACT_EXPONENT_FACTOR");
export const POOL_AMOUNT = hashString("POOL_AMOUNT");
export const SWAP_IMPACT_POOL_AMOUNT = hashString("SWAP_IMPACT_POOL_AMOUNT");

export function priceFeedKey(token) {
  return hashData(["bytes32", "address"], [PRICE_FEED, token]);
}

export function priceFeedMultiplierKey(token) {
  return hashData(["bytes32", "address"], [PRICE_FEED_MULTIPLIER, token]);
}

export function oracleTypeKey(token) {
  return hashData(["bytes32", "address"], [ORACLE_TYPE, token]);
}

export function reserveFactorKey(market, isLong) {
  return hashData(["bytes32", "address", "bool"], [RESERVE_FACTOR, market, isLong]);
}

export function swapFeeFactorKey(market) {
  return hashData(["bytes32", "address"], [SWAP_FEE_FACTOR, market]);
}

export function swapImpactFactorKey(market, isPositive) {
  return hashData(["bytes32", "address", "bool"], [SWAP_IMPACT_FACTOR, market, isPositive]);
}

export function swapImpactExponentFactorKey(market) {
  return hashData(["bytes32", "address"], [SWAP_IMPACT_EXPONENT_FACTOR, market]);
}
