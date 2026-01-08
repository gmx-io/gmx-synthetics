import hre from "hardhat";
import * as keys from "../utils/keys";
import { formatAmount } from "../utils/math";

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

  for (const [, market] of markets.entries()) {
    if (market.indexToken === hre.ethers.constants.AddressZero) {
      continue;
    }
    const indexTokenSymbol = addressToSymbol[market.indexToken];
    if (!indexTokenSymbol) {
      continue;
    }
    const longTokenSymbol = addressToSymbol[market.longToken];
    const shortTokenSymbol = addressToSymbol[market.shortToken];
    const [
      minFundingFactorPerSecondLong,
      minFundingFactorPerSecondShort,
      maxFundingFactorPerSecondLong,
      maxFundingFactorPerSecondShort,
    ] = await Promise.all([
      dataStore.getUint(keys.minFundingFactorPerSecondKey(market.marketToken, true)),
      dataStore.getUint(keys.minFundingFactorPerSecondKey(market.marketToken, false)),
      dataStore.getUint(keys.maxFundingFactorPerSecondKey(market.marketToken, true)),
      dataStore.getUint(keys.maxFundingFactorPerSecondKey(market.marketToken, false)),
    ]);
    console.log(
      "market: %s %s min funding rate (long/short) %s / %s max funding rate (long/short) %s / %s",
      market.marketToken,
      `(${indexTokenSymbol}/USD [${longTokenSymbol}/${shortTokenSymbol}])`.padEnd(25),
      formatAmount(minFundingFactorPerSecondLong.mul(86400).mul(365), 30, 2),
      formatAmount(minFundingFactorPerSecondShort.mul(86400).mul(365), 30, 2),
      formatAmount(maxFundingFactorPerSecondLong.mul(86400).mul(365), 30, 2),
      formatAmount(maxFundingFactorPerSecondShort.mul(86400).mul(365), 30, 2)
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
