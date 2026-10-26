import type { BigNumberish } from "ethers";
import { TokensConfig } from "./tokens";
import { MarketConfig, MarketHours } from "./markets";
import { OracleConfig } from "./oracle";
import getGeneral from "./general";
import { RolesConfig } from "./roles";
import { VaultV1Config } from "./vaultV1";
import { GlvConfig } from "./glvs";
import { BuybackConfig } from "./buyback";
import { LayerZeroEndpointConfig } from "./layerZero";
import { FeeDistributorConfig } from "./feeDistributor";
import { IncentiveConfig } from "./incentive";

export type OracleProvider = "mockOracle" | "chainlinkDataStream" | "chainlinkPriceFeed";

export type DonationConfigValues = {
  fundingAccount: string;
  isEnabled: boolean;
  maxDonationFactor: BigNumberish;
  donationPeriodDuration: BigNumberish;
  maxDonationAmountPerPeriod: BigNumberish;
};

// extend hardhat config with custom gmx property
declare module "hardhat/types/runtime" {
  interface HardhatRuntimeEnvironment {
    gmx: {
      getTokens: () => Promise<TokensConfig>;
      getMarkets: (marketHours?: MarketHours) => Promise<MarketConfig[]>;
      getOracle: () => Promise<OracleConfig>;
      getGeneral: () => ReturnType<typeof getGeneral>;
      getRoles: () => Promise<RolesConfig>;
      getGlvs: () => Promise<GlvConfig>;
      getVaultV1: () => Promise<VaultV1Config>;
      getBuyback: () => Promise<BuybackConfig>;
      getLayerZeroEndpoint: () => Promise<LayerZeroEndpointConfig>;
      getFeeDistributor: () => Promise<FeeDistributorConfig>;
      getIncentive: () => Promise<IncentiveConfig>;
      isExistingMainnetDeployment: boolean;
    };
    deployTags: string;
  }
}
