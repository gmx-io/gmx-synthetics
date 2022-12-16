import { hashString, hashData } from "./hash";

export const WNT = hashString("WNT");
export const MAX_LEVERAGE = hashString("MAX_LEVERAGE");

export const MIN_ORACLE_BLOCK_CONFIRMATIONS = hashString("MIN_ORACLE_BLOCK_CONFIRMATIONS");
export const MAX_ORACLE_PRICE_AGE = hashString("MAX_ORACLE_PRICE_AGE");
export const MIN_ORACLE_SIGNERS = hashString("MIN_ORACLE_SIGNERS");

export const FEE_RECEIVER_DEPOSIT_FACTOR = hashString("FEE_RECEIVER_DEPOSIT_FACTOR");
export const FEE_RECEIVER_WITHDRAWAL_FACTOR = hashString("FEE_RECEIVER_WITHDRAWAL_FACTOR");

export const TOKEN_TRANSFER_GAS_LIMIT = hashString("TOKEN_TRANSFER_GAS_LIMIT");
export const NATIVE_TOKEN_TRANSFER_GAS_LIMIT = hashString("NATIVE_TOKEN_TRANSFER_GAS_LIMIT");

export const PRICE_FEED = hashString("PRICE_FEED");
export const PRICE_FEED_MULTIPLIER = hashString("PRICE_FEED_MULTIPLIER");
export const ORACLE_TYPE = hashString("ORACLE_TYPE");
export const RESERVE_FACTOR = hashString("RESERVE_FACTOR");
export const SWAP_FEE_FACTOR = hashString("SWAP_FEE_FACTOR");
export const SWAP_IMPACT_FACTOR = hashString("SWAP_IMPACT_FACTOR");
export const SWAP_IMPACT_EXPONENT_FACTOR = hashString("SWAP_IMPACT_EXPONENT_FACTOR");
export const POOL_AMOUNT = hashString("POOL_AMOUNT");
export const SWAP_IMPACT_POOL_AMOUNT = hashString("SWAP_IMPACT_POOL_AMOUNT");

export const POSITION_IMPACT_FACTOR = hashString("POSITION_IMPACT_FACTOR");
export const POSITION_IMPACT_EXPONENT_FACTOR = hashString("POSITION_IMPACT_EXPONENT_FACTOR");
export const POSITION_FEE_FACTOR = hashString("POSITION_FEE_FACTOR");

export function tokenTransferGasLimit(token: string) {
  return hashData(["bytes32", "address"], [TOKEN_TRANSFER_GAS_LIMIT, token]);
}

export function priceFeedKey(token: string) {
  return hashData(["bytes32", "address"], [PRICE_FEED, token]);
}

export function priceFeedMultiplierKey(token: string) {
  return hashData(["bytes32", "address"], [PRICE_FEED_MULTIPLIER, token]);
}

export function oracleTypeKey(token: string) {
  return hashData(["bytes32", "address"], [ORACLE_TYPE, token]);
}

export function reserveFactorKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [RESERVE_FACTOR, market, isLong]);
}

export function poolAmountKey(market: string, token: string) {
  return hashData(["bytes32", "address", "address"], [POOL_AMOUNT, market, token]);
}

export function swapImpactPoolAmountKey(market: string, token: string) {
  return hashData(["bytes32", "address", "address"], [SWAP_IMPACT_POOL_AMOUNT, market, token]);
}

export function swapFeeFactorKey(market: string) {
  return hashData(["bytes32", "address"], [SWAP_FEE_FACTOR, market]);
}

export function swapImpactFactorKey(market: string, isPositive: boolean) {
  return hashData(["bytes32", "address", "bool"], [SWAP_IMPACT_FACTOR, market, isPositive]);
}

export function swapImpactExponentFactorKey(market: string) {
  return hashData(["bytes32", "address"], [SWAP_IMPACT_EXPONENT_FACTOR, market]);
}

export function positionImpactFactorKey(market: string, isPositive: boolean) {
  return hashData(["bytes32", "address", "bool"], [POSITION_IMPACT_FACTOR, market, isPositive]);
}

export function positionImpactExponentFactorKey(market: string) {
  return hashData(["bytes32", "address"], [POSITION_IMPACT_EXPONENT_FACTOR, market]);
}

export function positionFeeFactorKey(market: string) {
  return hashData(["bytes32", "address"], [POSITION_FEE_FACTOR, market]);
}
