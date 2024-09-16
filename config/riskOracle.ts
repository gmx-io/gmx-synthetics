import { HardhatRuntimeEnvironment } from "hardhat/types";

export type RiskOracleConfig = {
  riskOracle?: string;
  markets?: {
    [marketAddress: string]: {
      syncConfigMarketDisabled?: boolean;
      parameters?: {
        [parameter: string]: boolean;
      };
    };
  };
  parameters?: {
    [parameter: string]: boolean;
  };
};

export default async function (hre: HardhatRuntimeEnvironment): Promise<RiskOracleConfig> {
  const config: { [network: string]: RiskOracleConfig } = {
    localhost: {
      markets: {
        "0x1Da892c7AE651Fe4264D61f2110f8B0DEFA4AAE4": {
          // Address for hardhat deployment WETH/USDC pool
          parameters: {
            maxLongTokenPoolAmount: true,
          },
        },
        "0xfe757C5BA67A02d98522BB8048b0037EFA193A98": {
          // Address for hardhat deployment WETH/USDT pool
          syncConfigMarketDisabled: true,
        },
      },
      parameters: {
        maxOpenInterestForLongs: true,
      },
    },
    hardhat: {},
    arbitrum: {
      riskOracle: "0x0efb5a96Ed1B33308a73355C56Aa1Bc1aa7E4A8E",
    },
    avalanche: {
      riskOracle: "0x0efb5a96Ed1B33308a73355C56Aa1Bc1aa7E4A8E",
    },
    avalancheFuji: {
      riskOracle: "0xE05354F4187820bF0832bF1f5fAd6a0F592b8fB6",
      markets: {
        "0xD996ff47A1F763E1e55415BC4437c59292D1F415": {
          // Address for current Avalanche Fuji deployment AVAX/USDC pool
          parameters: {
            maxLongTokenPoolAmount: true,
          },
        },
        "0xbf338a6C595f06B7Cfff2FA8c958d49201466374": {
          // Address for current Avalanche Fuji deployment ETH/USDC pool
          syncConfigMarketDisabled: true,
        },
      },
      parameters: {
        maxOpenInterestForLongs: true,
      },
    },
    arbitrumSepolia: {
      riskOracle: "0x48b67764dBB6B8fc2A0c3987ed3819e543212Bc3",
    },
  };

  const riskOracleConfig: RiskOracleConfig = config[hre.network.name];

  if (riskOracleConfig.markets) {
    for (const [marketAddress, marketConfig] of Object.entries(riskOracleConfig.markets)) {
      if ("syncConfigMarketDisabled" in marketConfig) {
        if (typeof marketConfig.syncConfigMarketDisabled !== "boolean") {
          throw new Error(`syncConfigMarketDisabled for market ${marketAddress} must be a boolean.`);
        }
      }

      if (marketConfig.parameters) {
        for (const [parameterKey, parameterValue] of Object.entries(marketConfig.parameters)) {
          if (typeof parameterValue !== "boolean") {
            throw new Error(`Parameter ${parameterKey} for market ${marketAddress} must be a boolean.`);
          }
        }
      }
    }
  }

  if (riskOracleConfig.parameters) {
    for (const [parameterKey, parameterValue] of Object.entries(riskOracleConfig.parameters)) {
      if (typeof parameterValue !== "boolean") {
        throw new Error(`parameter ${parameterKey} must be a boolean.`);
      }
    }
  }

  return riskOracleConfig;
}
