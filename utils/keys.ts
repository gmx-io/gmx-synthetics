import { hashString, hashData } from "./hash";

export const WNT = hashString("WNT");
export const NONCE = hashString("NONCE");

export const FEE_RECEIVER = hashString("FEE_RECEIVER");
export const HOLDING_ADDRESS = hashString("HOLDING_ADDRESS");
export const MIN_HANDLE_EXECUTION_ERROR_GAS = hashString("MIN_HANDLE_EXECUTION_ERROR_GAS");

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

export const CREATE_DEPOSIT_FEATURE_DISABLED = hashString("CREATE_DEPOSIT_FEATURE_DISABLED");
export const CANCEL_DEPOSIT_FEATURE_DISABLED = hashString("CANCEL_DEPOSIT_FEATURE_DISABLED");
export const EXECUTE_DEPOSIT_FEATURE_DISABLED = hashString("EXECUTE_DEPOSIT_FEATURE_DISABLED");

export const CREATE_ORDER_FEATURE_DISABLED = hashString("CREATE_ORDER_FEATURE_DISABLED");
export const EXECUTE_ORDER_FEATURE_DISABLED = hashString("EXECUTE_ORDER_FEATURE_DISABLED");
export const EXECUTE_ADL_FEATURE_DISABLED = hashString("EXECUTE_ADL_FEATURE_DISABLED");
export const UPDATE_ORDER_FEATURE_DISABLED = hashString("UPDATE_ORDER_FEATURE_DISABLED");
export const CANCEL_ORDER_FEATURE_DISABLED = hashString("CANCEL_ORDER_FEATURE_DISABLED");

export const CLAIMABLE_FEE_AMOUNT = hashString("CLAIMABLE_FEE_AMOUNT");
export const CLAIMABLE_FUNDING_AMOUNT = hashString("CLAIMABLE_FUNDING_AMOUNT");
export const CLAIMABLE_COLLATERAL_AMOUNT = hashString("CLAIMABLE_COLLATERAL_AMOUNT");
export const CLAIMABLE_COLLATERAL_FACTOR = hashString("CLAIMABLE_COLLATERAL_FACTOR");
export const CLAIMABLE_COLLATERAL_TIME_DIVISOR = hashString("CLAIMABLE_COLLATERAL_TIME_DIVISOR");

export const MAX_UI_FEE_FACTOR = hashString("MAX_UI_FEE_FACTOR");

export const IS_MARKET_DISABLED = hashString("IS_MARKET_DISABLED");
export const MAX_SWAP_PATH_LENGTH = hashString("MAX_SWAP_PATH_LENGTH");

export const MIN_ORACLE_BLOCK_CONFIRMATIONS = hashString("MIN_ORACLE_BLOCK_CONFIRMATIONS");
export const MAX_ORACLE_PRICE_AGE = hashString("MAX_ORACLE_PRICE_AGE");
export const MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR = hashString("MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR");
export const MIN_ORACLE_SIGNERS = hashString("MIN_ORACLE_SIGNERS");

export const MIN_COLLATERAL_FACTOR = hashString("MIN_COLLATERAL_FACTOR");
export const MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER = hashString(
  "MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER"
);
export const MIN_COLLATERAL_USD = hashString("MIN_COLLATERAL_USD");
export const MIN_POSITION_SIZE_USD = hashString("MIN_POSITION_SIZE_USD");

export const SWAP_FEE_RECEIVER_FACTOR = hashString("SWAP_FEE_RECEIVER_FACTOR");

export const TOKEN_TRANSFER_GAS_LIMIT = hashString("TOKEN_TRANSFER_GAS_LIMIT");
export const NATIVE_TOKEN_TRANSFER_GAS_LIMIT = hashString("NATIVE_TOKEN_TRANSFER_GAS_LIMIT");

export const MAX_CALLBACK_GAS_LIMIT = hashString("MAX_CALLBACK_GAS_LIMIT");

export const REQUEST_EXPIRATION_BLOCK_AGE = hashString("REQUEST_EXPIRATION_BLOCK_AGE");

export const PRICE_FEED = hashString("PRICE_FEED");
export const PRICE_FEED_MULTIPLIER = hashString("PRICE_FEED_MULTIPLIER");
export const PRICE_FEED_HEARTBEAT_DURATION = hashString("PRICE_FEED_HEARTBEAT_DURATION");
export const STABLE_PRICE = hashString("STABLE_PRICE");

export const ORACLE_TYPE = hashString("ORACLE_TYPE");

export const OPEN_INTEREST = hashString("OPEN_INTEREST");
export const OPEN_INTEREST_IN_TOKENS = hashString("OPEN_INTEREST_IN_TOKENS");

export const COLLATERAL_SUM = hashString("COLLATERAL_SUM");
export const POOL_AMOUNT = hashString("POOL_AMOUNT");
export const MAX_POOL_AMOUNT = hashString("MAX_POOL_AMOUNT");
export const MAX_OPEN_INTEREST = hashString("MAX_OPEN_INTEREST");

export const POSITION_IMPACT_POOL_AMOUNT = hashString("POSITION_IMPACT_POOL_AMOUNT");
export const SWAP_IMPACT_POOL_AMOUNT = hashString("SWAP_IMPACT_POOL_AMOUNT");

export const POSITION_FEE_RECEIVER_FACTOR = hashString("POSITION_FEE_RECEIVER_FACTOR");
export const BORROWING_FEE_RECEIVER_FACTOR = hashString("BORROWING_FEE_RECEIVER_FACTOR");

export const SWAP_FEE_FACTOR = hashString("SWAP_FEE_FACTOR");
export const SWAP_IMPACT_FACTOR = hashString("SWAP_IMPACT_FACTOR");
export const SWAP_IMPACT_EXPONENT_FACTOR = hashString("SWAP_IMPACT_EXPONENT_FACTOR");

export const POSITION_IMPACT_FACTOR = hashString("POSITION_IMPACT_FACTOR");
export const POSITION_IMPACT_EXPONENT_FACTOR = hashString("POSITION_IMPACT_EXPONENT_FACTOR");
export const MAX_POSITION_IMPACT_FACTOR = hashString("MAX_POSITION_IMPACT_FACTOR");
export const MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS = hashString("MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS");
export const POSITION_FEE_FACTOR = hashString("POSITION_FEE_FACTOR");

export const RESERVE_FACTOR = hashString("RESERVE_FACTOR");
export const OPEN_INTEREST_RESERVE_FACTOR = hashString("OPEN_INTEREST_RESERVE_FACTOR");

export const MAX_PNL_FACTOR = hashString("MAX_PNL_FACTOR");
export const MAX_PNL_FACTOR_FOR_TRADERS = hashString("MAX_PNL_FACTOR_FOR_TRADERS");
export const MAX_PNL_FACTOR_FOR_ADL = hashString("MAX_PNL_FACTOR_FOR_ADL");
export const MIN_PNL_FACTOR_AFTER_ADL = hashString("MIN_PNL_FACTOR_AFTER_ADL");
export const MAX_PNL_FACTOR_FOR_DEPOSITS = hashString("MAX_PNL_FACTOR_FOR_DEPOSITS");
export const MAX_PNL_FACTOR_FOR_WITHDRAWALS = hashString("MAX_PNL_FACTOR_FOR_WITHDRAWALS");

export const LATEST_ADL_BLOCK = hashString("LATEST_ADL_BLOCK");
export const IS_ADL_ENABLED = hashString("IS_ADL_ENABLED");

export const FUNDING_FACTOR = hashString("FUNDING_FACTOR");
export const FUNDING_EXPONENT_FACTOR = hashString("FUNDING_EXPONENT_FACTOR");

export const FUNDING_FEE_AMOUNT_PER_SIZE = hashString("FUNDING_FEE_AMOUNT_PER_SIZE");
export const CLAIMABLE_FUNDING_AMOUNT_PER_SIZE = hashString("CLAIMABLE_FUNDING_AMOUNT_PER_SIZE");
export const FUNDING_UPDATED_AT = hashString("FUNDING_UPDATED_AT");

export const BORROWING_FACTOR = hashString("BORROWING_FACTOR");
export const BORROWING_EXPONENT_FACTOR = hashString("BORROWING_EXPONENT_FACTOR");

export const SKIP_BORROWING_FEE_FOR_SMALLER_SIDE = hashString("SKIP_BORROWING_FEE_FOR_SMALLER_SIDE");

export const ESTIMATED_GAS_FEE_BASE_AMOUNT = hashString("ESTIMATED_GAS_FEE_BASE_AMOUNT");
export const ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR = hashString("ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR");

export const EXECUTION_GAS_FEE_BASE_AMOUNT = hashString("EXECUTION_GAS_FEE_BASE_AMOUNT");
export const EXECUTION_GAS_FEE_MULTIPLIER_FACTOR = hashString("EXECUTION_GAS_FEE_MULTIPLIER_FACTOR");

export const DEPOSIT_GAS_LIMIT = hashString("DEPOSIT_GAS_LIMIT");
export const WITHDRAWAL_GAS_LIMIT = hashString("WITHDRAWAL_GAS_LIMIT");
export const SINGLE_SWAP_GAS_LIMIT = hashString("SINGLE_SWAP_GAS_LIMIT");
export const INCREASE_ORDER_GAS_LIMIT = hashString("INCREASE_ORDER_GAS_LIMIT");
export const DECREASE_ORDER_GAS_LIMIT = hashString("DECREASE_ORDER_GAS_LIMIT");
export const SWAP_ORDER_GAS_LIMIT = hashString("SWAP_ORDER_GAS_LIMIT");

export const CUMULATIVE_BORROWING_FACTOR = hashString("CUMULATIVE_BORROWING_FACTOR");
export const CUMULATIVE_BORROWING_FACTOR_UPDATED_AT = hashString("CUMULATIVE_BORROWING_FACTOR_UPDATED_AT");

export const VIRTUAL_TOKEN_ID = hashString("VIRTUAL_TOKEN_ID");
export const VIRTUAL_MARKET_ID = hashString("VIRTUAL_MARKET_ID");

const VIRTUAL_INVENTORY_FOR_SWAPS = hashString("VIRTUAL_INVENTORY_FOR_SWAPS");
const VIRTUAL_INVENTORY_FOR_POSITIONS = hashString("VIRTUAL_INVENTORY_FOR_POSITIONS");

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

export function isMarketDisabledKey(market) {
  return hashData(["bytes32", "address"], [IS_MARKET_DISABLED, market]);
}

export function createDepositFeatureDisabledKey(contract) {
  return hashData(["bytes32", "address"], [CREATE_DEPOSIT_FEATURE_DISABLED, contract]);
}

export function cancelDepositFeatureDisabledKey(contract) {
  return hashData(["bytes32", "address"], [CANCEL_DEPOSIT_FEATURE_DISABLED, contract]);
}

export function executeDepositFeatureDisabledKey(contract) {
  return hashData(["bytes32", "address"], [EXECUTE_DEPOSIT_FEATURE_DISABLED, contract]);
}

export function createOrderFeatureDisabledKey(contract, orderType) {
  return hashData(["bytes32", "address", "uint256"], [CREATE_ORDER_FEATURE_DISABLED, contract, orderType]);
}

export function executeOrderFeatureDisabledKey(contract, orderType) {
  return hashData(["bytes32", "address", "uint256"], [EXECUTE_ORDER_FEATURE_DISABLED, contract, orderType]);
}

export function executeAdlFeatureDisabledKey(contract, orderType) {
  return hashData(["bytes32", "address", "uint256"], [EXECUTE_ADL_FEATURE_DISABLED, contract, orderType]);
}

export function updateOrderFeatureDisabledKey(contract, orderType) {
  return hashData(["bytes32", "address", "uint256"], [UPDATE_ORDER_FEATURE_DISABLED, contract, orderType]);
}

export function cancelOrderFeatureDisabledKey(contract, orderType) {
  return hashData(["bytes32", "address", "uint256"], [CANCEL_ORDER_FEATURE_DISABLED, contract, orderType]);
}

export function claimableFeeAmountKey(market: string, token: string) {
  return hashData(["bytes32", "address", "address"], [CLAIMABLE_FEE_AMOUNT, market, token]);
}

export function claimableFundingAmountKey(market: string, token: string, account: string) {
  return hashData(["bytes32", "address", "address", "address"], [CLAIMABLE_FUNDING_AMOUNT, market, token, account]);
}

export function claimableCollateralAmountKey(market: string, token: string, timeKey: number, account: string) {
  return hashData(
    ["bytes32", "address", "address", "uint256", "address"],
    [CLAIMABLE_COLLATERAL_AMOUNT, market, token, timeKey, account]
  );
}

export function claimableCollateralFactorKey(market: string, token: string, timeKey: number) {
  return hashData(["bytes32", "address", "address", "uint256"], [CLAIMABLE_COLLATERAL_FACTOR, market, token, timeKey]);
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

export function priceFeedHeartbeatDurationKey(token: string) {
  return hashData(["bytes32", "address"], [PRICE_FEED_HEARTBEAT_DURATION, token]);
}

export function stablePriceKey(token: string) {
  return hashData(["bytes32", "address"], [STABLE_PRICE, token]);
}

export function oracleTypeKey(token: string) {
  return hashData(["bytes32", "address"], [ORACLE_TYPE, token]);
}

export function openInterestKey(market: string, collateralToken: string, isLong: boolean) {
  return hashData(["bytes32", "address", "address", "bool"], [OPEN_INTEREST, market, collateralToken, isLong]);
}

export function openInterestInTokensKey(market: string, collateralToken: string, isLong: boolean) {
  return hashData(
    ["bytes32", "address", "address", "bool"],
    [OPEN_INTEREST_IN_TOKENS, market, collateralToken, isLong]
  );
}

export function minCollateralFactorKey(market: string) {
  return hashData(["bytes32", "address"], [MIN_COLLATERAL_FACTOR, market]);
}

export function minCollateralFactorForOpenInterestMultiplierKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER, market, isLong]);
}

export function reserveFactorKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [RESERVE_FACTOR, market, isLong]);
}

export function openInterestReserveFactorKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [OPEN_INTEREST_RESERVE_FACTOR, market, isLong]);
}

export function maxPnlFactorKey(pnlFactorType: string, market: string, isLong: boolean) {
  return hashData(["bytes32", "bytes32", "address", "bool"], [MAX_PNL_FACTOR, pnlFactorType, market, isLong]);
}

export function minPnlFactorAfterAdl(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [MIN_PNL_FACTOR_AFTER_ADL, market, isLong]);
}

export function collateralSumKey(market: string, collateralToken: string, isLong: boolean) {
  return hashData(["bytes32", "address", "address", "bool"], [COLLATERAL_SUM, market, collateralToken, isLong]);
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

export function positionImpactPoolAmountKey(market: string) {
  return hashData(["bytes32", "address"], [POSITION_IMPACT_POOL_AMOUNT, market]);
}

export function swapImpactPoolAmountKey(market: string, token: string) {
  return hashData(["bytes32", "address", "address"], [SWAP_IMPACT_POOL_AMOUNT, market, token]);
}

export function swapImpactPoolAmountKey(market: string, token: string) {
  return hashData(["bytes32", "address", "address"], [SWAP_IMPACT_POOL_AMOUNT, market, token]);
}

export function swapFeeFactorKey(market: string, forPositiveImpact: boolean) {
  return hashData(["bytes32", "address", "bool"], [SWAP_FEE_FACTOR, market, forPositiveImpact]);
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

export function maxPositionImpactFactorForLiquidationsKey(market: string) {
  return hashData(["bytes32", "address"], [MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS, market]);
}

export function positionFeeFactorKey(market: string, forPositiveImpact: boolean) {
  return hashData(["bytes32", "address", "bool"], [POSITION_FEE_FACTOR, market, forPositiveImpact]);
}

export function latestAdlBlockKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [LATEST_ADL_BLOCK, market, isLong]);
}

export function isAdlEnabledKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [IS_ADL_ENABLED, market, isLong]);
}

export function fundingFactorKey(market: string) {
  return hashData(["bytes32", "address"], [FUNDING_FACTOR, market]);
}

export function fundingExponentFactorKey(market: string) {
  return hashData(["bytes32", "address"], [FUNDING_EXPONENT_FACTOR, market]);
}

export function fundingFeeAmountPerSizeKey(market: string, collateralToken: string, isLong: boolean) {
  return hashData(
    ["bytes32", "address", "address", "bool"],
    [FUNDING_FEE_AMOUNT_PER_SIZE, market, collateralToken, isLong]
  );
}

export function claimableFundingAmountPerSizeKey(market: string, collateralToken: string, isLong: boolean) {
  return hashData(
    ["bytes32", "address", "address", "bool"],
    [CLAIMABLE_FUNDING_AMOUNT_PER_SIZE, market, collateralToken, isLong]
  );
}

export function fundingUpdatedAtKey(market: string) {
  return hashData(["bytes32", "address"], [FUNDING_UPDATED_AT, market]);
}

export function borrowingFactorKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [BORROWING_FACTOR, market, isLong]);
}

export function borrowingExponentFactorKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [BORROWING_EXPONENT_FACTOR, market, isLong]);
}

export function depositGasLimitKey(singleToken: boolean) {
  return hashData(["bytes32", "bool"], [DEPOSIT_GAS_LIMIT, singleToken]);
}

export function withdrawalGasLimitKey() {
  return hashData(["bytes32"], [WITHDRAWAL_GAS_LIMIT]);
}

export function singleSwapGasLimitKey() {
  return hashData(["bytes32"], [SINGLE_SWAP_GAS_LIMIT]);
}

export function increaseOrderGasLimitKey() {
  return hashData(["bytes32"], [INCREASE_ORDER_GAS_LIMIT]);
}

export function decreaseOrderGasLimitKey() {
  return hashData(["bytes32"], [DECREASE_ORDER_GAS_LIMIT]);
}

export function swapOrderGasLimitKey() {
  return hashData(["bytes32"], [SWAP_ORDER_GAS_LIMIT]);
}

export function cumulativeBorrowingFactorKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [CUMULATIVE_BORROWING_FACTOR, market, isLong]);
}

export function cumulativeBorrowingFactorUpdatedAtKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [CUMULATIVE_BORROWING_FACTOR_UPDATED_AT, market, isLong]);
}

export function virtualTokenIdKey(token: string) {
  return hashData(["bytes32", "address"], [VIRTUAL_TOKEN_ID, token]);
}

export function virtualMarketIdKey(market: string) {
  return hashData(["bytes32", "address"], [VIRTUAL_MARKET_ID, market]);
}

export function virtualInventoryForSwapsKey(virtualMarketId: string, token: string) {
  return hashData(["bytes32", "bytes32", "address"], [VIRTUAL_INVENTORY_FOR_SWAPS, virtualMarketId, token]);
}

export function virtualInventoryForPositionsKey(virtualTokenId: string) {
  return hashData(["bytes32", "bytes32"], [VIRTUAL_INVENTORY_FOR_POSITIONS, virtualTokenId]);
}
