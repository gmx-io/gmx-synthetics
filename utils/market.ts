import { expandDecimals } from "./math";

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
