import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TOKEN_ORACLE_TYPES } from "../utils/oracle";
import { decimalToFloat } from "../utils/math";
import { BigNumberish } from "ethers";

type OracleRealPriceFeed = {
  address: string;
  decimals: number;
  heartbeatDuration: number;
  stablePrice?: number;
  deploy?: never;
  initPrice?: never;
};

type OracleTestPriceFeed = {
  address?: never;
  decimals: number;
  heartbeatDuration: number;
  stablePrice?: number;
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

    arbitrum: {
      signers: ["0x0F711379095f2F0a6fdD1e8Fccd6eBA0833c1F1f"],
      maxOraclePriceAge: 5 * 60,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      minOracleBlockConfirmations: 255,
      minOracleSigners: 1,

      // price feeds https://docs.chain.link/data-feeds/price-feeds/addresses/?network=arbitrum#Arbitrum%20Mainnet
      tokens: {
        BTC: {
          priceFeed: {
            address: "0x6ce185860a4963106506C203335A2910413708e9",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
          },
        },
        "WBTC.e": {
          priceFeed: {
            // use the BTC price feed since the oracle would report the BTC price as well
            address: "0x6ce185860a4963106506C203335A2910413708e9",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
          },
        },
        WETH: {
          priceFeed: {
            address: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
          },
        },
        DOGE: {
          priceFeed: {
            address: "0x9A7FB1b3950837a8D9b40517626E11D4127C098C",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
          },
        },
        SOL: {
          priceFeed: {
            address: "0x24ceA4b8ce57cdA5058b924B9B9987992450590c",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
          },
        },
        UNI: {
          priceFeed: {
            address: "0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
          },
        },
        LINK: {
          priceFeed: {
            address: "0x86E53CF1B870786351Da77A57575e79CB55812CB",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
          },
        },
        ARB: {
          priceFeed: {
            address: "0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
          },
        },
        USDC: {
          priceFeed: {
            address: "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
            stablePrice: decimalToFloat(1),
          },
        },
        "USDC.e": {
          priceFeed: {
            address: "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
            stablePrice: decimalToFloat(1),
          },
        },
        USDT: {
          priceFeed: {
            address: "0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
            stablePrice: decimalToFloat(1),
          },
        },
        DAI: {
          priceFeed: {
            address: "0xc5C8E77B397E531B8EC06BFb0048328B30E9eCfB",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
            stablePrice: decimalToFloat(1),
          },
        },
      },
    },

    avalanche: {
      signers: ["0x7f2CA7713AACD279f7753F804163189E4831c1EE"],
      maxOraclePriceAge: 5 * 60,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      minOracleBlockConfirmations: 255,
      minOracleSigners: 1,

      // price feeds https://docs.chain.link/data-feeds/price-feeds/addresses/?network=avalanche#Avalanche%20Mainnet
      tokens: {
        "BTC.b": {
          priceFeed: {
            address: "0x2779D32d5166BAaa2B2b658333bA7e6Ec0C65743",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
          },
        },
        "WETH.e": {
          priceFeed: {
            address: "0x976B3D034E162d8bD72D6b9C989d545b839003b0",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
          },
        },
        WAVAX: {
          priceFeed: {
            address: "0x0A77230d17318075983913bC2145DB16C7366156",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
          },
        },
        USDC: {
          priceFeed: {
            address: "0xF096872672F44d6EBA71458D74fe67F9a77a23B9",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
            stablePrice: decimalToFloat(1),
          },
        },
        "USDC.e": {
          priceFeed: {
            address: "0xF096872672F44d6EBA71458D74fe67F9a77a23B9",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
            stablePrice: decimalToFloat(1),
          },
        },
        USDT: {
          priceFeed: {
            address: "0xEBE676ee90Fe1112671f19b6B7459bC678B67e8a",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
            stablePrice: decimalToFloat(1),
          },
        },
        "USDT.e": {
          priceFeed: {
            address: "0xEBE676ee90Fe1112671f19b6B7459bC678B67e8a",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
            stablePrice: decimalToFloat(1),
          },
        },
        "DAI.e": {
          priceFeed: {
            address: "0x51D7180edA2260cc4F6e4EebB82FEF5c3c2B8300",
            decimals: 8,
            heartbeatDuration: (24 + 1) * 60 * 60,
            stablePrice: decimalToFloat(1),
          },
        },
      },
    },

    arbitrumGoerli: {
      signers: ["0xFb11f15f206bdA02c224EDC744b0E50E46137046", "0x23247a1A80D01b9482E9d734d2EB780a3b5c8E6c"],
      maxOraclePriceAge: 5 * 60,
      maxRefPriceDeviationFactor: decimalToFloat(5, 1), // 50%
      minOracleBlockConfirmations: 255,
      minOracleSigners: 1,

      // price feeds https://docs.chain.link/data-feeds/price-feeds/addresses/?network=arbitrum#Arbitrum%20Goerli
      tokens: {
        USDC: {
          priceFeed: {
            address: "0x1692Bdd32F31b831caAc1b0c9fAF68613682813b",
            decimals: 8,
            heartbeatDuration: 3 * 24 * 60 * 60,
          },
        },
        USDT: {
          priceFeed: {
            address: "0x0a023a3423D9b27A0BE48c768CCF2dD7877fEf5E",
            decimals: 8,
            heartbeatDuration: 3 * 24 * 60 * 60,
          },
        },
        DAI: {
          priceFeed: {
            address: "0x103b53E977DA6E4Fa92f76369c8b7e20E7fb7fe1",
            decimals: 8,
            heartbeatDuration: 3 * 24 * 60 * 60,
          },
        },
      },
    },

    avalancheFuji: {
      signers: ["0xFb11f15f206bdA02c224EDC744b0E50E46137046", "0x23247a1A80D01b9482E9d734d2EB780a3b5c8E6c"],
      maxOraclePriceAge: 5 * 60,
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
            heartbeatDuration: 3 * 24 * 60 * 60,
          },
        },
        USDT: {
          priceFeed: {
            // this is USDT price feed, there is no USDC feed on Avalanche Fuji
            address: "0x7898AcCC83587C3C55116c5230C17a6Cd9C71bad",
            decimals: 8,
            heartbeatDuration: 3 * 24 * 60 * 60,
          },
        },
        DAI: {
          priceFeed: {
            // this is USDT price feed, there is no USDC feed on Avalanche Fuji
            address: "0x7898AcCC83587C3C55116c5230C17a6Cd9C71bad",
            decimals: 8,
            heartbeatDuration: 3 * 24 * 60 * 60,
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
