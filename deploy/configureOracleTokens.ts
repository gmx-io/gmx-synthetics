import { ethers } from "ethers";

import { expandDecimals } from "../utils/math";
import * as keys from "../utils/keys";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments, gmx }: HardhatRuntimeEnvironment) => {
  const { execute, read, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const { oracle: oracleConfig, tokens } = gmx;

  if (oracleConfig) {
    for (const tokenSymbol of Object.keys(oracleConfig.tokens)) {
      const token = tokens[tokenSymbol];
      if (!token) {
        throw new Error(`Missing token for ${tokenSymbol}`);
      }
      const { priceFeed, oracleType } = oracleConfig.tokens[tokenSymbol];

      const oracleTypeKey = keys.oracleTypeKey(token.address)
      const currentOracleType = await read("DataStore", "getData", oracleTypeKey);
      if (oracleType !== currentOracleType) {
        log("setting oracle type for %s to %s", tokenSymbol, oracleType);
        await execute("DataStore", { from: deployer, log: true }, "setData", oracleTypeKey, oracleType);
      } else {
        log("oracle type for %s is already set to %s", tokenSymbol, oracleType);
      }

      if (!priceFeed) {
        continue
      }
      const { address: priceFeedAddress, decimals } = priceFeed;

      const priceFeedKey = keys.priceFeedKey(token.address);
      const currentPriceFeedAddress = await read("DataStore", "getAddress", priceFeedKey);
      if (currentPriceFeedAddress !== ethers.utils.getAddress(priceFeedAddress)) {
        log("setting price feed for %s to %s", tokenSymbol, priceFeedAddress);
        await execute("DataStore", { from: deployer, log: true }, "setAddress", priceFeedKey, priceFeedAddress);
      } else {
        log("Price feed for %s already set to %s", tokenSymbol, priceFeedAddress);
      }

      const priceFeedMultiplierKey = keys.priceFeedMultiplierKey(token.address);
      const priceFeedMultiplier = expandDecimals(1, 60 - decimals - token.decimals);
      const currentPriceFeedMultiplier = await read("DataStore", "getUint", priceFeedMultiplierKey);
      if (currentPriceFeedMultiplier !== priceFeedMultiplier) {
        log("setting price feed multiplier for %s to %s", tokenSymbol, priceFeedMultiplier);
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
