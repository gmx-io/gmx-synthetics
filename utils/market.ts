import { calculateCreate2 } from "eth-create2-calculator";
import { expandDecimals } from "./math";
import { hashData } from "./hash";

import MarketTokenArtifact from "../artifacts/contracts/market/MarketToken.sol/MarketToken.json";

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
