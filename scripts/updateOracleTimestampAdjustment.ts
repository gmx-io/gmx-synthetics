import hre from "hardhat";

import * as keys from "../utils/keys";

import { setUintIfDifferent } from "../utils/dataStore";

async function main() {
  if (hre.network.name !== "avalancheFuji" && hre.network.name !== "arbitrumSepolia") {
    throw new Error("Unsupported network");
  }

  const tokens = await hre.gmx.getTokens();

  const gmOracleProvider = await hre.ethers.getContract("GmOracleProvider");
  const chainlinkDataStreamProvider = await hre.ethers.getContract("ChainlinkDataStreamProvider");
  const chainlinkPriceFeedProvider = await hre.ethers.getContract("ChainlinkPriceFeedProvider");

  if (hre.network.name === "avalancheFuji") {
    await setUintIfDifferent(
      keys.oracleTimestampAdjustmentKey(gmOracleProvider.address, tokens.WETH.address),
      1,
      "gm oracle"
    );
    await setUintIfDifferent(
      keys.oracleTimestampAdjustmentKey(chainlinkDataStreamProvider.address, tokens.WETH.address),
      2,
      "chainlink data stream provider"
    );
    await setUintIfDifferent(
      keys.oracleTimestampAdjustmentKey(chainlinkPriceFeedProvider.address, tokens.WETH.address),
      3,
      "chainlink price feed provider"
    );
    await setUintIfDifferent(
      keys.oracleTimestampAdjustmentKey(chainlinkDataStreamProvider.address, tokens.LINK.address),
      10,
      "chainlink data stream provider"
    );
  } else {
    await setUintIfDifferent(
      keys.oracleTimestampAdjustmentKey(chainlinkDataStreamProvider.address, tokens.WETH.address),
      1,
      "chainlink data stream provider"
    );
    await setUintIfDifferent(
      keys.oracleTimestampAdjustmentKey(chainlinkPriceFeedProvider.address, tokens.WETH.address),
      2,
      "chainlink price feed provider"
    );

    await setUintIfDifferent(
      keys.oracleTimestampAdjustmentKey(chainlinkDataStreamProvider.address, tokens.BTC.address),
      3,
      "chainlink data stream provider"
    );
    await setUintIfDifferent(
      keys.oracleTimestampAdjustmentKey(chainlinkPriceFeedProvider.address, tokens.BTC.address),
      4,
      "chainlink price feed provider"
    );

    await setUintIfDifferent(
      keys.oracleTimestampAdjustmentKey(chainlinkDataStreamProvider.address, tokens["USDC.SG"].address),
      5,
      "chainlink data stream provider"
    );
    await setUintIfDifferent(
      keys.oracleTimestampAdjustmentKey(chainlinkPriceFeedProvider.address, tokens["USDC.SG"].address),
      6,
      "chainlink price feed provider"
    );
  }

  console.log("done");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
