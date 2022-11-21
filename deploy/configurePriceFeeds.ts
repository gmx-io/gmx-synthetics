import { ethers } from "ethers";

import { expandDecimals } from "../utils/math";
import * as keys from "../utils/keys";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments, gmx }: HardhatRuntimeEnvironment) => {
  const { execute, read, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const { oracle: oracleConfig, tokens } = gmx;

  if (oracleConfig) {
    for (const [tokenSymbol, priceFeed] of Object.entries(oracleConfig.priceFeeds)) {
      const token = tokens[tokenSymbol];
      if (!token) {
        throw new Error(`Missing token for ${tokenSymbol}`);
      }
      const { address: priceFeedAddress, decimals } = priceFeed;

      const priceFeedKey = keys.priceFeedKey(token.address);
      const currentPriceFeedAddress = await read("DataStore", "getAddress", priceFeedKey);
      if (currentPriceFeedAddress !== ethers.utils.getAddress(priceFeedAddress)) {
        await execute("DataStore", { from: deployer, log: true }, "setAddress", priceFeedKey, priceFeedAddress);
      } else {
        log("Price feed for %s already set to %s", tokenSymbol, priceFeedAddress);
      }

      const priceFeedMultiplierKey = keys.priceFeedMultiplierKey(token.address);
      const priceFeedMultiplier = expandDecimals(1, 60 - decimals - token.decimals);
      const currentPriceFeedMultiplier = await read("DataStore", "getUint", priceFeedMultiplierKey);
      if (currentPriceFeedMultiplier !== priceFeedMultiplier) {
        await execute(
          "DataStore",
          { from: deployer, log: true },
          "setUint",
          priceFeedMultiplierKey,
          priceFeedMultiplier
        );
      } else {
        log("Price feed precision for %s already set to %s", tokenSymbol, priceFeedMultiplier);
      }
    }
  }
};

func.dependencies = ["Tokens", "PriceFeeds", "DataStore"];
func.tags = ["ConfigurePriceFeeds"];
export default func;
