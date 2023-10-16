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
    log(
      "virtualMarketId %s, %s markets:",
      virtualMarketId,
      markets.length,
      markets
        .map((m) => {
          const { indexToken, shortToken, longToken } = m.tokens;
          return `${indexToken}:${longToken}:${shortToken}`;
        })
        .join(", ")
    );

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

    log("poolAmountLongTokenTotal %s", poolAmountLongTokenTotal);
    log("poolAmountShortTokenTotal %s", poolAmountShortTokenTotal);

    await setUintIfDifferent(
      keys.virtualInventoryForSwapsKey(virtualMarketId, true),
      poolAmountLongTokenTotal,
      `virtualInventoryForSwapsKey ${virtualMarketId} long`
    );
    await setUintIfDifferent(
      keys.virtualInventoryForSwapsKey(virtualMarketId, false),
      poolAmountShortTokenTotal,
      `virtualInventoryForSwapsKey ${virtualMarketId} short`
    );
  }

  return false;

  return true;
};

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  return !["arbitrumGoerli"].includes(network.name);
};
func.id = "fixVirtualInventoryForSwaps2";
func.tags = ["FixVirtualInventoryForSwaps2"];

export default func;
