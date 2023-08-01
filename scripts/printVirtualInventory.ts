import hre from "hardhat";
import { DEFAULT_MARKET_TYPE, getMarketTokenAddress } from "../utils/market";
import * as keys from "../utils/keys";

async function main() {
  const markets = await hre.gmx.getMarkets();
  const tokens = await hre.gmx.getTokens();
  const reader = await hre.ethers.getContract("Reader");
  const dataStore = await hre.ethers.getContract("DataStore");

  const marketFactory = await ethers.getContract("MarketFactory");
  const roleStore = await ethers.getContract("RoleStore");

  console.log("reading data from DataStore %s Reader %s", dataStore.address, reader.address);

  for (const market of markets) {
    const indexToken = tokens[market.tokens.indexToken] || { address: ethers.constants.AddressZero };
    const longToken = tokens[market.tokens.longToken];
    const shortToken = tokens[market.tokens.shortToken];

    const marketTokenAddress = await getMarketTokenAddress(
      indexToken.address,
      longToken.address,
      shortToken.address,
      DEFAULT_MARKET_TYPE,
      marketFactory.address,
      roleStore.address,
      dataStore.address
    );

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
