import hre from "hardhat";

async function main() {
  const marketStore = await hre.ethers.getContract("MarketStore");
  const marketCount = await marketStore.getMarketCount();
  console.log("market count: %s", marketCount.toString());
  const marketKeys = await marketStore.getMarketKeys(0, marketCount);
  for (const key of marketKeys) {
    const market = await marketStore.get(key);
    console.log("%s %s:%s:%s", key, market.indexToken, market.longToken, market.shortToken);
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
