import { TokensConfig } from "./tokens";
import { MarketConfig } from "./markets";
import { OracleConfig } from "./oracle";
import getGeneral from "./general";
import { RolesConfig } from "./roles";

// extend hardhat config with custom gmx property
declare module "hardhat/types/runtime" {
  interface HardhatRuntimeEnvironment {
    gmx: {
      getTokens: () => Promise<TokensConfig>;
      getMarkets: () => Promise<MarketConfig[]>;
      getOracle: () => Promise<OracleConfig>;
      getGeneral: () => ReturnType<typeof getGeneral>;
      getRoles: () => Promise<RolesConfig>;
    };
  }
}
