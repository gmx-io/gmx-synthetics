import { calculateCreate2 } from "eth-create2-calculator";
import { expandDecimals } from "./math";
import { hashData } from "./hash";
import { poolAmountKey, swapImpactPoolAmountKey } from "./keys";
import * as keys from "./keys";

import MarketTokenArtifact from "../artifacts/contracts/market/MarketToken.sol/MarketToken.json";

export function getMarketCount(dataStore) {
  return dataStore.getAddressCount(keys.MARKET_LIST);
}

export function getMarketKeys(dataStore, start, end) {
  return dataStore.getAddressValuesAt(keys.MARKET_LIST, start, end);
}

export async function getPoolAmount(dataStore, market, token) {
  const key = poolAmountKey(market, token);
  return await dataStore.getUint(key);
}

export async function getSwapImpactPoolAmount(dataStore, market, token) {
  const key = swapImpactPoolAmountKey(market, token);
  return await dataStore.getUint(key);
}

export async function getMarketTokenPrice(fixture) {
  const { reader, dataStore, ethUsdMarket } = fixture.contracts;

  return await reader.getMarketTokenPrice(
    dataStore.address,
    ethUsdMarket,
    {
      min: expandDecimals(5000, 4 + 8),
      max: expandDecimals(5000, 4 + 8),
    },
    {
      min: expandDecimals(1, 6 + 18),
      max: expandDecimals(1, 6 + 18),
    },
    {
      min: expandDecimals(5000, 4 + 8),
      max: expandDecimals(5000, 4 + 8),
    },
    true
  );
}

export function getMarketTokenAddress(
  indexToken,
  longToken,
  shortToken,
  marketFactoryAddress,
  roleStoreAddress,
  dataStoreAddress
) {
  const salt = hashData(["string", "address", "address", "address"], ["GMX_MARKET", indexToken, longToken, shortToken]);
  const byteCode = MarketTokenArtifact.bytecode;
  return calculateCreate2(marketFactoryAddress, salt, byteCode, {
    params: [roleStoreAddress, dataStoreAddress],
    types: ["address", "address"],
  });
}
