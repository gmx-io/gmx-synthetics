import hre from "hardhat";
import * as keys from "../utils/keys";

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const oracle = await hre.ethers.getContract("Oracle");

  const { gmx, deployments } = hre;
  for (const [symbol, tokenConfig] of Object.entries(await gmx.getTokens())) {
    let address = tokenConfig.address;
    if (!address) {
      const { address: _address } = await deployments.get(symbol);
      address = _address;
    }

    const oracleProviderKey = keys.oracleProviderForTokenKey(oracle.address, address);
    const oracleProvider = await dataStore.getAddress(oracleProviderKey);
    const oracleTimestampAdjustmentKey = keys.oracleTimestampAdjustmentKey(oracleProvider, address);
    const oracleTimestampAdjustment = await dataStore.getUint(oracleTimestampAdjustmentKey);
    const buybackMaxPriceImpactFactor = await dataStore.getUint(keys.buybackMaxPriceImpactFactorKey(address));
    const priceFeed = await dataStore.getAddress(keys.priceFeedKey(address));
    const dataStreamId = await dataStore.getBytes32(keys.dataStreamIdKey(address));

    console.log(`${symbol} ${address}`);
    console.log(`    decimals: ${tokenConfig.decimals}`);
    console.log(`    synthetic: ${tokenConfig.synthetic}`);
    console.log(`    oracleProvider: ${oracleProvider}`);
    console.log(`    oracleTimestampAdjustment: ${oracleTimestampAdjustment}`);
    console.log(`    buybackMaxPriceImpactFactor: ${buybackMaxPriceImpactFactor}`);
    console.log(`    priceFeed: ${priceFeed}`);
    console.log(`    dataStreamId: ${dataStreamId}`);
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
