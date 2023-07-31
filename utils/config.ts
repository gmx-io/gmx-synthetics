import hre from "hardhat";
import { BigNumber } from "ethers";

export const EXCLUDED_CONFIG_KEYS = {
  ACCOUNT_DEPOSIT_LIST: true,
  ACCOUNT_ORDER_LIST: true,
  ACCOUNT_POSITION_LIST: true,
  ACCOUNT_WITHDRAWAL_LIST: true,
  SAVED_CALLBACK_CONTRACT: true,
  AFFILIATE_REWARD: true,
  CLAIMABLE_COLLATERAL_AMOUNT: true,
  CLAIMABLE_COLLATERAL_TIME_DIVISOR: true,
  CLAIMABLE_FEE_AMOUNT: true,
  CLAIMABLE_FUNDING_AMOUNT: true,
  CLAIMABLE_UI_FEE_AMOUNT: true,
  CLAIMED_COLLATERAL_AMOUNT: true,
  COLLATERAL_SUM: true,
  CUMULATIVE_BORROWING_FACTOR: true,
  CUMULATIVE_BORROWING_FACTOR_UPDATED_AT: true,
  DEPOSIT_FEE_TYPE: true,
  DEPOSIT_LIST: true,
  FEE_RECEIVER: true,
  FUNDING_FEE_AMOUNT_PER_SIZE: true,
  CLAIMABLE_FUNDING_AMOUNT_PER_SIZE: true,
  FUNDING_UPDATED_AT: true,
  IS_ADL_ENABLED: true,
  LATEST_ADL_BLOCK: true,
  MARKET_LIST: true,
  MAX_PNL_FACTOR_FOR_TRADERS: true,
  MAX_PNL_FACTOR_FOR_ADL: true,
  MAX_PNL_FACTOR_FOR_DEPOSITS: true,
  MAX_PNL_FACTOR_FOR_WITHDRAWALS: true,
  MIN_ORACLE_SIGNERS: true,
  NONCE: true,
  OPEN_INTEREST: true,
  OPEN_INTEREST_IN_TOKENS: true,
  ORDER_LIST: true,
  POOL_AMOUNT: true,
  POSITION_FEE_TYPE: true,
  POSITION_IMPACT_POOL_AMOUNT: true,
  POSITION_LIST: true,
  PRICE_FEED: true,
  PRICE_FEED_MULTIPLIER: true,
  REENTRANCY_GUARD_STATUS: true,
  STABLE_PRICE: true,
  SWAP_FEE_TYPE: true,
  SWAP_IMPACT_POOL_AMOUNT: true,
  SWAP_PATH_MARKET_FLAG: true,
  TOTAL_BORROWING: true,
  UI_DEPOSIT_FEE_TYPE: true,
  UI_FEE_FACTOR: true,
  UI_POSITION_FEE_TYPE: true,
  UI_SWAP_FEE_TYPE: true,
  UI_WITHDRAWAL_FEE_TYPE: true,
  USER_INITIATED_CANCEL: true,
  WITHDRAWAL_FEE_TYPE: true,
  // exclude the WITHDRAWAL_GAS_LIMIT key because it is the hashed version
  // of the key that needs to be set instead
  WITHDRAWAL_GAS_LIMIT: true,
  WITHDRAWAL_LIST: true,
  WNT: true,
};

export async function appendUintConfigIfDifferent(
  list: Array,
  dataCache: Map,
  baseKey: string,
  keyData: string,
  value: BigNumber | string | number,
  label?: string
) {
  await appendConfigIfDifferent(list, dataCache, "uint", baseKey, keyData, value, {
    compare: (a, b) => a.eq(b),
    label,
  });
}

export async function appendIntConfigIfDifferent(
  list: Array,
  dataCache: Map,
  baseKey: string,
  keyData: string,
  value: BigNumber | string | number,
  label?: string
) {
  await appendConfigIfDifferent(list, dataCache, "int", baseKey, keyData, value, {
    compare: (a, b) => a.eq(b),
    label,
  });
}

export async function appendAddressConfigIfDifferent(
  list: Array,
  dataCache: Map,
  baseKey: string,
  keyData: string,
  value: string,
  label?: string
) {
  await appendConfigIfDifferent(list, dataCache, "address", baseKey, keyData, value, {
    compare: (a, b) => a.toLowerCase() == b.toLowerCase(),
    label,
  });
}

export async function appendBytes32ConfigIfDifferent(
  list: Array,
  dataCache: Map,
  baseKey: string,
  keyData: string,
  value: string,
  label?: string
) {
  await appendConfigIfDifferent(list, dataCache, "bytes32", baseKey, keyData, value, { label });
}

export async function appendBoolConfigIfDifferent(
  list: Array,
  dataCache: Map,
  baseKey: string,
  keyData: string,
  value: boolean,
  label?: string
) {
  await appendConfigIfDifferent(list, dataCache, "bool", baseKey, keyData, value, { label });
}

async function appendConfigIfDifferent(
  list: Array,
  dataCache: Map,
  type: "uint" | "int" | "address" | "data" | "bool" | "bytes32",
  baseKey: string,
  keyData: string,
  value: any,
  { compare, label }: { compare?: (a: any, b: any) => boolean; label?: string } = {}
) {
  if (value === undefined) {
    throw new Error(`Value for ${label || key} of type ${type} is undefined`);
  }

  const config = await hre.ethers.getContract("Config");

  const key = getFullKey(baseKey, keyData);

  const setMethod = `set${type[0].toUpperCase()}${type.slice(1)}`;

  const currentValue: string = dataCache[key];
  if (currentValue === undefined) {
    throw new Error(`currentValue is undefined for ${label}`);
  }

  if (compare ? !compare(currentValue, value) : currentValue != value) {
    console.log(
      "appending config %s %s (%s) to %s, prev: %s",
      type,
      label,
      key,
      value.toString(),
      currentValue.toString()
    );
    list.push(config.interface.encodeFunctionData(setMethod, [baseKey, keyData, value]));
  } else {
    console.log("skipping config %s %s (%s) as it is already set to %s", type, label, key, value.toString());
  }
}

export function getFullKey(baseKey: string, keyData: string) {
  if (keyData === "0x") {
    return baseKey;
  }

  const keyArray = ethers.utils.concat([ethers.utils.arrayify(baseKey), ethers.utils.arrayify(keyData)]);

  return ethers.utils.keccak256(keyArray);
}
