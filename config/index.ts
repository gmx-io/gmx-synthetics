import _ from "lodash";

import { extendEnvironment } from "hardhat/config";

import tokensConfig, { TokensConfig } from "./tokens";
import marketsConfig, { MarketConfig } from "./markets";
import oracleConfig, { OracleConfig } from "./oracle";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// extend hardhat config with custom gmx property
declare module "hardhat/types/runtime" {
  interface HardhatRuntimeEnvironment {
    gmx: {
      getTokens: () => Promise<TokensConfig>;
      getMarkets: () => Promise<MarketConfig[]>;
      getOracle: () => Promise<OracleConfig>;
    };
  }
}

extendEnvironment(async (hre: HardhatRuntimeEnvironment) => {
  // extend hre context with gmx domain data

  hre.gmx = {
    getTokens: _.memoize(async () => tokensConfig(hre)),
    getOracle: _.memoize(async () => oracleConfig(hre)),
    getMarkets: _.memoize(async () => marketsConfig(hre)),
  };
});
