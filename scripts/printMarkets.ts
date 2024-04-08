import hre from "hardhat";
import * as keys from "../utils/keys";

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
  const dataStore = await hre.ethers.getContract("DataStore");
  console.log("reading data from DataStore %s Reader %s", dataStore.address, reader.address);
  const markets = [...(await reader.getMarkets(dataStore.address, 0, 100))];
  const isDisabled = await Promise.all(
    markets.map((market) => dataStore.getBool(keys.isMarketDisabledKey(market.marketToken)))
  );

  markets.sort((a, b) => a.indexToken.localeCompare(b.indexToken));
  for (const [i, market] of markets.entries()) {
    const indexTokenSymbol = addressToSymbol[market.indexToken];
    const longTokenSymbol = addressToSymbol[market.longToken];
    const shortTokenSymbol = addressToSymbol[market.shortToken];
    console.log(
      "%s index: %s long: %s short: %s is disabled: %s",
      market.marketToken,
      indexTokenSymbol?.padEnd(5) || "(swap only)",
      longTokenSymbol?.padEnd(5),
      shortTokenSymbol?.padEnd(5),
      isDisabled[i]
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
