import { MarketConfig } from "../config/markets";
import { bigNumberify } from "../utils/math";
import * as keys from "../utils/keys";

import { getMarketKey, getMarketTokenAddresses, getOnchainMarkets } from "../utils/market";
import { setUintIfDifferent } from "../utils/dataStore";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ deployments, gmx }: HardhatRuntimeEnvironment) => {
  const allMarkets: MarketConfig[] = await gmx.getMarkets();
  const tokens = await gmx.getTokens();

  const { read, get, log } = deployments;

  const marketsByVirtualMarketId: Record<string, MarketConfig[]> = {};
  for (const market of allMarkets) {
    if (market.virtualMarketId) {
      if (!marketsByVirtualMarketId[market.virtualMarketId]) {
        marketsByVirtualMarketId[market.virtualMarketId] = [];
      }
      marketsByVirtualMarketId[market.virtualMarketId].push(market);
    }
  }

  const dataStore = await get("DataStore");
  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  for (const [virtualMarketId, markets] of Object.entries(marketsByVirtualMarketId)) {
    let poolAmountLongTokenTotal = bigNumberify(0);
    let poolAmountShortTokenTotal = bigNumberify(0);
    let longToken: string;
    let shortToken: string;
    log("virtualMarketId %s, markets %s", virtualMarketId, markets.length);

    for (const marketConfig of markets) {
      let indexToken: string;
      [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
      const marketKey = getMarketKey(indexToken, longToken, shortToken);
      const onchainMarket = onchainMarketsByTokens[marketKey];

      const poolAmountLongToken = await read(
        "DataStore",
        "getUint",
        keys.poolAmountKey(onchainMarket.marketToken, onchainMarket.longToken)
      );
      poolAmountLongTokenTotal = poolAmountLongTokenTotal.add(poolAmountLongToken);
      const poolAmountShortToken = await read(
        "DataStore",
        "getUint",
        keys.poolAmountKey(onchainMarket.marketToken, onchainMarket.shortToken)
      );
      poolAmountShortTokenTotal = poolAmountShortTokenTotal.add(poolAmountShortToken);
    }

    log("poolAmountLongTokenTotal %s", poolAmountLongTokenTotal.toString());
    log("poolAmountShortTokenTotal %s", poolAmountShortTokenTotal.toString());

    await setUintIfDifferent(
      keys.virtualInventoryForSwapsKey(virtualMarketId, longToken!),
      poolAmountLongTokenTotal,
      `virtualInventoryForSwapsKey ${virtualMarketId} ${longToken!}`
    );
    await setUintIfDifferent(
      keys.virtualInventoryForSwapsKey(virtualMarketId, shortToken!),
      poolAmountShortTokenTotal,
      `virtualInventoryForSwapsKey ${virtualMarketId} ${shortToken!}`
    );
  }

  return true;
};

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  return network.name !== "avalancheFuji";
};
func.id = "fixVirtualInventoryForSwaps";
func.tags = ["FixVirtualInventoryForSwaps"];

export default func;
