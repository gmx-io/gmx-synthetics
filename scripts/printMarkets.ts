import hre from "hardhat";

async function main() {
  const tokens = await hre.gmx.getTokens();
  const addressToSymbol: { [address: string]: string } = {};
  for (const [tokenSymbol, tokenConfig] of Object.entries(tokens)) {
    let address = tokenConfig.address;
    if (!address) {
      address = (await hre.ethers.getContract(tokenSymbol)).address;
    }
    addressToSymbol[address] = tokenSymbol;
  }

  const reader = await hre.ethers.getContract("Reader");
  const marketStore = await hre.ethers.getContract("MarketStore");
  const markets = await reader.getMarkets(marketStore.address, 0, 1000);
  for (const market of markets) {
    const indexTokenSymbol = addressToSymbol[market.indexToken];
    const longTokenSymbol = addressToSymbol[market.longToken];
    const shortTokenSymbol = addressToSymbol[market.shortToken];
    console.log(
      "%s indexToken: %s longToken: %s shortToken: %s",
      market.marketToken,
      indexTokenSymbol.padEnd(5),
      longTokenSymbol.padEnd(5),
      shortTokenSymbol.padEnd(5)
    );
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
