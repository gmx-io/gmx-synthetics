import hre from "hardhat";
import * as keys from "../utils/keys";

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");

  const { gmx, deployments } = hre;
  for (const [symbol, tokenConfig] of Object.entries(await gmx.getTokens())) {
    let address = tokenConfig.address;
    if (!address) {
      const { address: _address } = await deployments.get(symbol);
      address = _address;
    }

    const oracleProviderKey = keys.oracleProviderForTokenKey(address);
    const oracleProvider = await dataStore.getAddress(oracleProviderKey);
    const oracleTimestampAdjustmentKey = keys.oracleTimestampAdjustmentKey(oracleProvider, address);
    const oracleTimestampAdjustment = await dataStore.getUint(oracleTimestampAdjustmentKey);
    const buybackMaxPriceImpactFactor = await dataStore.getUint(keys.buybackMaxPriceImpactFactorKey(address));
    const priceFeed = await dataStore.getAddress(keys.priceFeedKey(address));

    console.log(
      "%s %s, decimals: %s%s, oracleProvider: %s, oracleTimestampAdjustment: %s, buybackMaxPriceImpactFactor: %s, priceFeed: %s",
      symbol.padEnd(5),
      address,
      String(tokenConfig.decimals).padEnd(2),
      tokenConfig.synthetic ? ", synthetic" : "",
      oracleProvider,
      oracleTimestampAdjustment,
      buybackMaxPriceImpactFactor,
      priceFeed
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
