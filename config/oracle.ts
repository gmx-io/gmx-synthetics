import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TOKEN_ORACLE_TYPES } from "../utils/oracle";
import { decimalToFloat } from "../utils/math";
import { BigNumberish } from "ethers";

type OracleRealPriceFeed = {
  address: string;
  decimals: number;
  heartbeatDuration: number;
  deploy?: never;
  initPrice?: never;
};

type OracleTestPriceFeed = {
  address?: never;
  decimals: number;
  heartbeatDuration: number;
  deploy: true;
  initPrice: string;
};

type OraclePriceFeed = OracleRealPriceFeed | OracleTestPriceFeed;

export type OracleConfig = {
  signers: string[];
  minOracleSigners: number;
  minOracleBlockConfirmations: number;
  maxOraclePriceAge: number;
  maxRefPriceDeviationFactor: BigNumberish;
  tokens?: {
    [tokenSymbol: string]: {
      priceFeed?: OraclePriceFeed;
      oracleType?: string;
    };
  };
};

export default async function (hre: HardhatRuntimeEnvironment): Promise<OracleConfig> {
  const network = hre.network;

  let testSigners: string[];
  if (!network.live) {
    testSigners = (await hre.ethers.getSigners()).slice(10).map((signer) => signer.address);
  }

  const config: { [network: string]: OracleConfig } = {
    localhost: {
      signers: testSigners,
      minOracleSigners: 0,
      minOracleBlockConfirmations: 255,
      maxOraclePriceAge: 60 * 60 * 24,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
    },

    hardhat: {
      signers: testSigners,
      minOracleSigners: 0,
      minOracleBlockConfirmations: 255,
      maxOraclePriceAge: 60 * 60,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      tokens: {
        USDC: {
          priceFeed: {
            decimals: 8,
            heartbeatDuration: 24 * 60 * 60,
            deploy: true,
            initPrice: "100000000",
          },
        },
        USDT: {
          priceFeed: {
            decimals: 8,
            heartbeatDuration: 24 * 60 * 60,
            deploy: true,
            initPrice: "100000000",
          },
        },
      },
    },

    arbitrumGoerli: {
      signers: ["0xFb11f15f206bdA02c224EDC744b0E50E46137046", "0x23247a1A80D01b9482E9d734d2EB780a3b5c8E6c"],
      maxOraclePriceAge: 60 * 60,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      minOracleBlockConfirmations: 255,
      minOracleSigners: 1,

      // price feeds https://docs.chain.link/data-feeds/price-feeds/addresses/?network=arbitrum#Arbitrum%20Goerli
      tokens: {
        USDC: {
          priceFeed: {
            address: "0x1692Bdd32F31b831caAc1b0c9fAF68613682813b",
            decimals: 8,
            heartbeatDuration: 24 * 60 * 60,
          },
        },
        USDT: {
          priceFeed: {
            address: "0x0a023a3423D9b27A0BE48c768CCF2dD7877fEf5E",
            decimals: 8,
            heartbeatDuration: 24 * 60 * 60,
          },
        },
        DAI: {
          priceFeed: {
            address: "0x103b53E977DA6E4Fa92f76369c8b7e20E7fb7fe1",
            decimals: 8,
            heartbeatDuration: 24 * 60 * 60,
          },
        },
      },
    },

    avalancheFuji: {
      signers: ["0xFb11f15f206bdA02c224EDC744b0E50E46137046", "0x23247a1A80D01b9482E9d734d2EB780a3b5c8E6c"],
      maxOraclePriceAge: 60 * 60,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      minOracleBlockConfirmations: 255,
      minOracleSigners: 1,

      // price feeds https://docs.chain.link/data-feeds/price-feeds/addresses?network=avalanche#Avalanche%20Testnet
      tokens: {
        // using the same price feed for all stablecoins since Chainlink has only USDT feed on Avalanche Fuji
        USDC: {
          priceFeed: {
            // this is USDT price feed, there is no USDC feed on Avalanche Fuji
            address: "0x7898AcCC83587C3C55116c5230C17a6Cd9C71bad",
            decimals: 8,
            heartbeatDuration: 24 * 60 * 60,
          },
        },
        USDT: {
          priceFeed: {
            // this is USDT price feed, there is no USDC feed on Avalanche Fuji
            address: "0x7898AcCC83587C3C55116c5230C17a6Cd9C71bad",
            decimals: 8,
            heartbeatDuration: 24 * 60 * 60,
          },
        },
        DAI: {
          priceFeed: {
            // this is USDT price feed, there is no USDC feed on Avalanche Fuji
            address: "0x7898AcCC83587C3C55116c5230C17a6Cd9C71bad",
            decimals: 8,
            heartbeatDuration: 24 * 60 * 60,
          },
        },
      },
    },
  };

  const oracleConfig: OracleConfig = config[hre.network.name];
  if (!oracleConfig.tokens) {
    oracleConfig.tokens = {};
  }

  const tokens = await hre.gmx.getTokens();

  // to make sure all tokens have an oracle type so oracle deployment/configuration script works correctly
  for (const tokenSymbol of Object.keys(tokens)) {
    if (oracleConfig.tokens[tokenSymbol] === undefined) {
      oracleConfig.tokens[tokenSymbol] = {};
    }
  }

  // validate there are corresponding tokens for price feeds
  for (const tokenSymbol of Object.keys(oracleConfig.tokens)) {
    if (!tokens[tokenSymbol]) {
      throw new Error(`Missing token for ${tokenSymbol}`);
    }

    if (oracleConfig.tokens[tokenSymbol].oracleType === undefined) {
      oracleConfig.tokens[tokenSymbol].oracleType = TOKEN_ORACLE_TYPES.DEFAULT;
    }
  }

  return oracleConfig;
}
