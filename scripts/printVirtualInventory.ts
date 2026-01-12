import hre from "hardhat";
import { getOnchainMarkets, getMarketKey } from "../utils/market";
import * as keys from "../utils/keys";

async function main() {
  const markets = await hre.gmx.getMarkets();
  const tokens = await hre.gmx.getTokens();
  const dataStore = await hre.ethers.getContract("DataStore");
  const { read } = hre.deployments;

  console.log("reading data from DataStore %s", dataStore.address);

  // Fetch all on-chain markets once (uses actual deployed addresses, not CREATE2 calculation)
  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  for (const market of markets) {
    const indexToken = tokens[market.tokens.indexToken] || { address: hre.ethers.constants.AddressZero };
    const longToken = tokens[market.tokens.longToken];
    const shortToken = tokens[market.tokens.shortToken];

    // Look up actual on-chain market address
    const marketKey = getMarketKey(indexToken.address, longToken.address, shortToken.address);
    const onchainMarket = onchainMarketsByTokens[marketKey];

    if (!onchainMarket) {
      console.log(
        `[SKIP] ${market.tokens.indexToken || "SWAP-ONLY"} [${market.tokens.longToken}-${
          market.tokens.shortToken
        }] - not deployed`
      );
      continue;
    }

    const marketTokenAddress = onchainMarket.marketToken;
    console.log("marketTokenAddress", marketTokenAddress);

    const marketName = market.tokens.indexToken ? `${market.tokens.indexToken}/USD` : "SWAP-ONLY";
    console.log(`${marketName} [${market.tokens.longToken}-${market.tokens.shortToken}]`);

    if (market.virtualMarketId) {
      const virtualMarketIdInDataStore = await dataStore.getBytes32(keys.virtualMarketIdKey(marketTokenAddress));

      if (virtualMarketIdInDataStore !== market.virtualMarketId) {
        throw new Error("virtualMarketIdInDataStore !== market.virtualMarketId");
      }

      const virtualSwapInventoryForLongs = await dataStore.getUint(
        keys.virtualInventoryForSwapsKey(market.virtualMarketId, true)
      );

      const virtualSwapInventoryForShorts = await dataStore.getUint(
        keys.virtualInventoryForSwapsKey(market.virtualMarketId, false)
      );

      const swapInventoryForLongs = ethers.utils.formatUnits(virtualSwapInventoryForLongs, longToken.decimals);
      const swapInventoryForShorts = ethers.utils.formatUnits(virtualSwapInventoryForShorts, shortToken.decimals);
      console.log(`   virtualSwapInventoryForLongs: ${swapInventoryForLongs} ${market.tokens.longToken}`);

      console.log(`   virtualSwapInventoryForShorts: ${swapInventoryForShorts} ${market.tokens.shortToken}`);

      // const estimatedPrice = parseFloat(swapInventoryForShorts) / parseFloat(swapInventoryForLongs);
      // console.log(`   estimatedPrice: ${estimatedPrice.toFixed(4)}`);
    }

    if (market.virtualTokenIdForIndexToken) {
      const virtualTokenIdInDataStore = await dataStore.getBytes32(keys.virtualTokenIdKey(indexToken.address));
      if (virtualTokenIdInDataStore !== market.virtualTokenIdForIndexToken) {
        throw new Error("virtualTokenIdInDataStore !== market.virtualTokenIdForIndexToken");
      }

      const virtualPositionInventory = await dataStore.getInt(
        keys.virtualInventoryForPositionsKey(market.virtualTokenIdForIndexToken)
      );

      console.log(`   virtualPositionInventory: ${ethers.utils.formatUnits(virtualPositionInventory, 30)} USD`);
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
