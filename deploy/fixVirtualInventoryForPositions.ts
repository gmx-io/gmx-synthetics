import { bigNumberify } from "../utils/math";
import * as keys from "../utils/keys";
import { TokenConfig } from "../config/tokens";

import { getOnchainMarkets } from "../utils/market";
import { setIntIfDifferent } from "../utils/dataStore";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ deployments, gmx }: HardhatRuntimeEnvironment) => {
  const tokens: Record<string, TokenConfig> = await gmx.getTokens();

  const { read, get, log } = deployments;

  const indexTokensByVirtualTokenId: Record<string, string[]> = {};
  for (const token of Object.values(tokens)) {
    if (token.virtualTokenId) {
      if (!indexTokensByVirtualTokenId[token.virtualTokenId]) {
        indexTokensByVirtualTokenId[token.virtualTokenId] = [];
      }
      indexTokensByVirtualTokenId[token.virtualTokenId].push(token.address!);
    }
  }

  const dataStore = await get("DataStore");
  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  const marketsByIndexToken: Record<string, any> = {};
  for (const market of Object.values(onchainMarketsByTokens)) {
    const indexToken = market.indexToken;
    if (!marketsByIndexToken[indexToken]) {
      marketsByIndexToken[indexToken] = [];
    }
    marketsByIndexToken[indexToken].push(market);
  }

  for (const [virtualTokenId, indexTokens] of Object.entries(indexTokensByVirtualTokenId)) {
    let virtualInventoryForPosition = bigNumberify(0);
    for (const indexToken of indexTokens) {
      const markets = marketsByIndexToken[indexToken];
      if (!markets) {
        continue;
      }
      for (const market of markets) {
        const [
          openInterest_Long_CollateralLong,
          openInterest_Long_CollateralShort,
          openInterest_Short_CollateralLong,
          openInterest_Short_CollateralShort,
        ] = await Promise.all([
          read("DataStore", "getUint", keys.openInterestKey(market.marketToken, market.longToken, true)),
          read("DataStore", "getUint", keys.openInterestKey(market.marketToken, market.shortToken, true)),
          read("DataStore", "getUint", keys.openInterestKey(market.marketToken, market.longToken, false)),
          read("DataStore", "getUint", keys.openInterestKey(market.marketToken, market.shortToken, false)),
        ]);

        log(
          "market %s\n\tlong OI, long collateral: %s\n\tlong OI, short collateral: %s\n\tshort OI, long collateral: %s\n\tshort OI, short collateral: %s\n\tnet: %s",
          market.marketToken,
          openInterest_Long_CollateralLong,
          openInterest_Long_CollateralShort,
          openInterest_Short_CollateralLong,
          openInterest_Short_CollateralShort,
          openInterest_Short_CollateralLong
            .add(openInterest_Short_CollateralShort)
            .sub(openInterest_Long_CollateralLong)
            .sub(openInterest_Long_CollateralShort)
        );

        virtualInventoryForPosition = virtualInventoryForPosition.sub(openInterest_Long_CollateralLong);
        virtualInventoryForPosition = virtualInventoryForPosition.sub(openInterest_Long_CollateralShort);
        virtualInventoryForPosition = virtualInventoryForPosition.add(openInterest_Short_CollateralLong);
        virtualInventoryForPosition = virtualInventoryForPosition.add(openInterest_Short_CollateralShort);
      }
    }

    const currentValue = await read("DataStore", "getInt", keys.virtualInventoryForPositionsKey(virtualTokenId));
    log(
      "virtualTokenId %s virtualInventoryForPosition: %s currentValue: %s",
      virtualTokenId,
      virtualInventoryForPosition,
      currentValue
    );

    await setIntIfDifferent(
      keys.virtualInventoryForPositionsKey(virtualTokenId),
      virtualInventoryForPosition,
      `virtual inventory for positions for virtual token ${virtualTokenId}`
    );
  }

  return true;
};

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  return network.name !== "avalancheFuji";
};
func.id = "fixVirtualInventoryForPositions";
func.tags = ["FixVirtualInventoryForPositions"];

export default func;
