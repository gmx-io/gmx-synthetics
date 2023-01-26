import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TOKEN_ORACLE_TYPES } from "../utils/oracle";

type OracleRealPriceFeed = {
  address: string;
  decimals: number;
  deploy?: never;
  initPrice?: never;
};

type OracleTestPriceFeed = {
  address?: never;
  decimals: number;
  deploy: true;
  initPrice: string;
};

type OraclePriceFeed = OracleRealPriceFeed | OracleTestPriceFeed;

export type OracleConfig = {
  signers: string[];
  minOracleSigners: number;
  minOracleBlockConfirmations: number;
  maxOraclePriceAge: number;
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
      minOracleBlockConfirmations: 100,
      maxOraclePriceAge: 60 * 60 * 24,
    },

    hardhat: {
      signers: testSigners,
      minOracleSigners: 0,
      minOracleBlockConfirmations: 100,
      maxOraclePriceAge: 60 * 60,
      tokens: {
        USDC: {
          priceFeed: {
            decimals: 8,
            deploy: true,
            initPrice: "100000000",
          },
        },
      },
    },

    avalancheFuji: {
      signers: ["0xFb11f15f206bdA02c224EDC744b0E50E46137046", "0x23247a1A80D01b9482E9d734d2EB780a3b5c8E6c"],
      maxOraclePriceAge: 60 * 60,
      minOracleBlockConfirmations: 100,
      minOracleSigners: 1,

      // price feeds https://docs.chain.link/data-feeds/price-feeds/addresses?network=avalanche#Avalanche%20Testnet
      tokens: {
        USDC: {
          priceFeed: {
            // this is USDT price feed, there is no USDC feed on Avalanche Fuji
            address: "0x7898AcCC83587C3C55116c5230C17a6Cd9C71bad",
            decimals: 8,
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
