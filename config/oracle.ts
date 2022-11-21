import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TOKEN_ORACLE_TYPES } from "../utils/oracle";

type OracleRealPriceFeed = {
  address: string;
  decimals: number;
  deploy?: never;
};

type OracleTestPriceFeed = {
  address?: never;
  decimals: number;
  deploy: true;
};

type OraclePriceFeed = OracleRealPriceFeed | OracleTestPriceFeed;

export type OracleConfig = {
  signers: string[];
  tokens?: {
    [tokenSymbol: string]: {
      priceFeed?: OraclePriceFeed;
      oracleType?: string;
    };
  };
};

export default async function (hre: HardhatRuntimeEnvironment): Promise<OracleConfig> {
  const tokens = hre.gmx.tokens;
  const network = hre.network;

  let testSigners: string[];
  if (!network.live) {
    testSigners = (await hre.ethers.getSigners()).slice(10).map((signer) => signer.address);
  }

  const config: { [network: string]: OracleConfig } = {
    localhost: {
      signers: testSigners,
    },
    hardhat: {
      signers: testSigners,
      tokens: {
        USDC: {
          priceFeed: {
            decimals: 8,
            deploy: true,
          },
        },
      },
    },
    avalancheFuji: {
      signers: ["0xFb11f15f206bdA02c224EDC744b0E50E46137046", "0x23247a1A80D01b9482E9d734d2EB780a3b5c8E6c"],
      tokens: {
        USDT: {
          priceFeed: {
            address: "0x7898AcCC83587C3C55116c5230C17a6Cd9C71bad",
            decimals: 8, // price feed decimals
          },
        },
        USDC: {
          priceFeed: {
            decimals: 8,
            deploy: true,
          },
          oracleType: "foo",
        },
      },
    },
  };

  const oracle: OracleConfig = config[hre.network.name];
  if (oracle) {
    // validate there are corresponding tokens for price feeds
    for (const tokenSymbol of Object.keys(oracle.tokens)) {
      if (!tokens[tokenSymbol]) {
        throw new Error(`Missing token for ${tokenSymbol}`);
      }

      if (oracle.tokens[tokenSymbol].oracleType === undefined) {
        oracle.tokens[tokenSymbol].oracleType = TOKEN_ORACLE_TYPES.DEFAULT;
      }
    }
  }

  return oracle;
}
