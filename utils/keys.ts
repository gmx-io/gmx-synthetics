import { hashString, hashData } from "./hash";

export const WNT = hashString("WNT");
export const MAX_LEVERAGE = hashString("MAX_LEVERAGE");

export const MARKET_LIST = hashString("MARKET_LIST");

export const DEPOSIT_LIST = hashString("DEPOSIT_LIST");
export const ACCOUNT_DEPOSIT_LIST = hashString("ACCOUNT_DEPOSIT_LIST");

export const WITHDRAWAL_LIST = hashString("WITHDRAWAL_LIST");
export const ACCOUNT_WITHDRAWAL_LIST = hashString("ACCOUNT_WITHDRAWAL_LIST");

export const POSITION_LIST = hashString("POSITION_LIST");
export const ACCOUNT_POSITION_LIST = hashString("ACCOUNT_POSITION_LIST");

export const ORDER_LIST = hashString("ORDER_LIST");
export const ACCOUNT_ORDER_LIST = hashString("ACCOUNT_ORDER_LIST");

export const MIN_ORACLE_BLOCK_CONFIRMATIONS = hashString("MIN_ORACLE_BLOCK_CONFIRMATIONS");
export const MAX_ORACLE_PRICE_AGE = hashString("MAX_ORACLE_PRICE_AGE");
export const MIN_ORACLE_SIGNERS = hashString("MIN_ORACLE_SIGNERS");

export const MIN_COLLATERAL_FACTOR = hashString("MIN_COLLATERAL_FACTOR");
export const MIN_COLLATERAL_USD = hashString("MIN_COLLATERAL_USD");

export const FEE_RECEIVER_FACTOR = hashString("FEE_RECEIVER_FACTOR");

export const TOKEN_TRANSFER_GAS_LIMIT = hashString("TOKEN_TRANSFER_GAS_LIMIT");
export const NATIVE_TOKEN_TRANSFER_GAS_LIMIT = hashString("NATIVE_TOKEN_TRANSFER_GAS_LIMIT");

export const PRICE_FEED = hashString("PRICE_FEED");
export const PRICE_FEED_MULTIPLIER = hashString("PRICE_FEED_MULTIPLIER");
export const ORACLE_TYPE = hashString("ORACLE_TYPE");
export const RESERVE_FACTOR = hashString("RESERVE_FACTOR");
export const MAX_PNL_FACTOR = hashString("MAX_PNL_FACTOR");
export const MAX_PNL_FACTOR_FOR_WITHDRAWALS = hashString("MAX_PNL_FACTOR_FOR_WITHDRAWALS");

export const CLAIMABLE_FEE_AMOUNT = hashString("CLAIMABLE_FEE_AMOUNT");

export const SWAP_FEE_FACTOR = hashString("SWAP_FEE_FACTOR");
export const SWAP_IMPACT_FACTOR = hashString("SWAP_IMPACT_FACTOR");
export const SWAP_IMPACT_EXPONENT_FACTOR = hashString("SWAP_IMPACT_EXPONENT_FACTOR");
export const POOL_AMOUNT = hashString("POOL_AMOUNT");
export const MAX_POOL_AMOUNT = hashString("MAX_POOL_AMOUNT");
export const MAX_OPEN_INTEREST = hashString("MAX_OPEN_INTEREST");
export const SWAP_IMPACT_POOL_AMOUNT = hashString("SWAP_IMPACT_POOL_AMOUNT");

export const POSITION_IMPACT_FACTOR = hashString("POSITION_IMPACT_FACTOR");
export const POSITION_IMPACT_EXPONENT_FACTOR = hashString("POSITION_IMPACT_EXPONENT_FACTOR");
export const MAX_POSITION_IMPACT_FACTOR = hashString("MAX_POSITION_IMPACT_FACTOR");
export const POSITION_FEE_FACTOR = hashString("POSITION_FEE_FACTOR");

export const EXECUTE_ADL_FEATURE = hashString("EXECUTE_ADL_FEATURE");

export function accountDepositListKey(account) {
  return hashData(["bytes32", "address"], [ACCOUNT_DEPOSIT_LIST, account]);
}

export function accountWithdrawalListKey(account) {
  return hashData(["bytes32", "address"], [ACCOUNT_WITHDRAWAL_LIST, account]);
}

export function accountPositionListKey(account) {
  return hashData(["bytes32", "address"], [ACCOUNT_POSITION_LIST, account]);
}

export function accountOrderListKey(account) {
  return hashData(["bytes32", "address"], [ACCOUNT_ORDER_LIST, account]);
}

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

export function minCollateralFactorKey(market: string) {
  return hashData(["bytes32", "address"], [MIN_COLLATERAL_FACTOR, market]);
}

export function reserveFactorKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [RESERVE_FACTOR, market, isLong]);
}

export function maxPnlFactorKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [MAX_PNL_FACTOR, market, isLong]);
}

export function maxPnlFactorForWithdrawalsKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [MAX_PNL_FACTOR_FOR_WITHDRAWALS, market, isLong]);
}

export function claimableFeeAmountKey(market: string, token: string) {
  return hashData(["bytes32", "address", "address"], [CLAIMABLE_FEE_AMOUNT, market, token]);
}

export function poolAmountKey(market: string, token: string) {
  return hashData(["bytes32", "address", "address"], [POOL_AMOUNT, market, token]);
}

export function maxPoolAmountKey(market: string, token: string) {
  return hashData(["bytes32", "address", "address"], [MAX_POOL_AMOUNT, market, token]);
}

export function maxOpenInterestKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [MAX_OPEN_INTEREST, market, isLong]);
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

export function maxPositionImpactFactorKey(market: string, isPositive: boolean) {
  return hashData(["bytes32", "address", "bool"], [MAX_POSITION_IMPACT_FACTOR, market, isPositive]);
}

export function positionFeeFactorKey(market: string) {
  return hashData(["bytes32", "address"], [POSITION_FEE_FACTOR, market]);
}

export function executeAdlFeatureKey(module: string, orderType: number) {
  return hashData(["bytes32", "address", "uint256"], [EXECUTE_ADL_FEATURE, module, orderType]);
}
