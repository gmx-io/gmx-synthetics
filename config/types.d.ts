import { TokensConfig } from "./tokens";
import { MarketConfig } from "./markets";
import { OracleConfig } from "./oracle";

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
