import tokensConfig, { TokensConfig } from "./tokens";
import marketsConfig, { MarketConfig } from "./markets";
import oracleConfig, { OracleConfig } from "./oracle";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// extend hardhat config with custom gmx property
declare module "hardhat/types/runtime" {
  interface HardhatRuntimeEnvironment {
    gmx: {
      tokens?: TokensConfig;
      markets?: MarketConfig[];
      oracle?: OracleConfig;
    };
  }
}

extendEnvironment(async (hre: HardhatRuntimeEnvironment) => {
  // extend hre context with gmx domain data

  hre.gmx = {};

  hre.gmx.tokens = await tokensConfig(hre);
  hre.gmx.oracle = await oracleConfig(hre);
  hre.gmx.markets = await marketsConfig(hre);
});
