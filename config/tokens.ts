import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getSyntheticTokenAddress } from "../utils/token";

// synthetic token without corresponding token
// address will be generated in runtime in hardhat.config.ts
// should not be deployed
// should not be wrappedNative
type SyntheticTokenConfig = {
  address?: never;
  decimals: number;
  synthetic: true;
  wrappedNative?: never;
  deploy?: never;
  transferGasLimit?: never;
};

type RealTokenConfig = {
  address: string;
  decimals: number;
  transferGasLimit: number;
  synthetic?: never;
  wrappedNative?: true;
  deploy?: never;
};

// test token to deploy in local and test networks
// automatically deployed in localhost and hardhat networks
// `deploy` should be set to `true` to deploy on live networks
export type TestTokenConfig = {
  address?: never;
  decimals: number;
  transferGasLimit: number;
  deploy: true;
  wrappedNative?: boolean;
  synthetic?: never;
};

export type TokenConfig = SyntheticTokenConfig | RealTokenConfig | TestTokenConfig;
export type TokensConfig = { [tokenSymbol: string]: TokenConfig };

const config: {
  [network: string]: TokensConfig;
} = {
  arbitrum: {
    BTC: {
      synthetic: true,
      decimals: 8,
    },
    "WBTC.e": {
      address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      decimals: 8,
      transferGasLimit: 200 * 1000,
    },
    WETH: {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      decimals: 18,
      wrappedNative: true,
      transferGasLimit: 200 * 1000,
    },
    XRP: {
      synthetic: true,
      decimals: 6,
    },
    DOGE: {
      synthetic: true,
      decimals: 8,
    },
    SOL: {
      address: "0x2bcC6D6CdBbDC0a4071e48bb3B969b06B3330c07",
      decimals: 9,
      transferGasLimit: 200 * 1000,
    },
    LTC: {
      synthetic: true,
      decimals: 8,
    },
    UNI: {
      address: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0",
      decimals: 18,
      transferGasLimit: 200 * 1000,
    },
    LINK: {
      address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
      decimals: 18,
      transferGasLimit: 200 * 1000,
    },
    ARB: {
      address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
      decimals: 18,
      transferGasLimit: 200 * 1000,
    },
    USDC: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      decimals: 6,
      transferGasLimit: 200 * 1000,
    },
    "USDC.e": {
      address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      decimals: 6,
      transferGasLimit: 200 * 1000,
    },
    USDT: {
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      decimals: 6,
      transferGasLimit: 200 * 1000,
    },
    DAI: {
      address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      decimals: 18,
      transferGasLimit: 200 * 1000,
    },
  },
  avalanche: {
    "BTC.b": {
      address: "0x152b9d0FdC40C096757F570A51E494bd4b943E50",
      decimals: 8,
      transferGasLimit: 200 * 1000,
    },
    "WETH.e": {
      address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
      decimals: 18,
      transferGasLimit: 200 * 1000,
    },
    XRP: {
      synthetic: true,
      decimals: 6,
    },
    DOGE: {
      synthetic: true,
      decimals: 8,
    },
    SOL: {
      address: "0xFE6B19286885a4F7F55AdAD09C3Cd1f906D2478F",
      decimals: 9,
      transferGasLimit: 200 * 1000,
    },
    LTC: {
      synthetic: true,
      decimals: 8,
    },
    WAVAX: {
      address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
      decimals: 18,
      wrappedNative: true,
      transferGasLimit: 200 * 1000,
    },
    USDC: {
      address: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      decimals: 6,
      transferGasLimit: 200 * 1000,
    },
    "USDC.e": {
      address: "0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664",
      decimals: 6,
      transferGasLimit: 200 * 1000,
    },
    USDT: {
      address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
      decimals: 6,
      transferGasLimit: 200 * 1000,
    },
    "USDT.e": {
      address: "0xc7198437980c041c805A1EDcbA50c1Ce5db95118",
      decimals: 6,
      transferGasLimit: 200 * 1000,
    },
    "DAI.e": {
      address: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70",
      decimals: 18,
      transferGasLimit: 200 * 1000,
    },
  },
  arbitrumGoerli: {
    WETH: {
      address: "0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3",
      decimals: 18,
      wrappedNative: true,
      transferGasLimit: 200 * 1000,
    },
    WBTC: {
      decimals: 8,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    USDC: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    SOL: {
      synthetic: true,
      decimals: 18,
    },
    USDT: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    DAI: {
      decimals: 18,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    TEST: {
      synthetic: true,
      decimals: 18,
    },
    BNB: {
      decimals: 18,
      synthetic: true,
    },
    DOGE: {
      decimals: 8,
      synthetic: true,
    },
    LINK: {
      decimals: 18,
      synthetic: true,
    },
    ADA: {
      decimals: 18,
      synthetic: true,
    },
    DOT: {
      decimals: 18,
      synthetic: true,
    },
    MATIC: {
      decimals: 18,
      synthetic: true,
    },
    UNI: {
      decimals: 18,
      synthetic: true,
    },
    TRX: {
      decimals: 18,
      synthetic: true,
    },
  },
  avalancheFuji: {
    WAVAX: {
      address: "0x1D308089a2D1Ced3f1Ce36B1FcaF815b07217be3",
      wrappedNative: true,
      decimals: 18,
      transferGasLimit: 200 * 1000,
    },
    TEST: {
      synthetic: true,
      decimals: 18,
    },
    WBTC: {
      decimals: 8,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    SOL: {
      synthetic: true,
      decimals: 18,
    },
    USDC: {
      address: "0x3eBDeaA0DB3FfDe96E7a0DBBAFEC961FC50F725F",
      decimals: 6,
      transferGasLimit: 200 * 1000,
    },
    USDT: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    DAI: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    WETH: {
      address: "0x82F0b3695Ed2324e55bbD9A9554cB4192EC3a514",
      decimals: 18,
      transferGasLimit: 200 * 1000,
    },
    BNB: {
      decimals: 18,
      synthetic: true,
    },
    DOGE: {
      decimals: 8,
      synthetic: true,
    },
    LINK: {
      decimals: 18,
      synthetic: true,
    },
    ADA: {
      decimals: 18,
      synthetic: true,
    },
    DOT: {
      decimals: 18,
      synthetic: true,
    },
    MATIC: {
      decimals: 18,
      synthetic: true,
    },
    UNI: {
      decimals: 18,
      synthetic: true,
    },
    TRX: {
      decimals: 18,
      synthetic: true,
    },
  },
  // token addresses are retrieved in runtime for hardhat and localhost networks
  hardhat: {
    WETH: {
      wrappedNative: true,
      decimals: 18,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    WBTC: {
      decimals: 8,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    USDC: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    USDT: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    SOL: {
      synthetic: true,
      decimals: 18,
    },
  },
  localhost: {
    WETH: {
      wrappedNative: true,
      decimals: 18,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    WBTC: {
      decimals: 8,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    USDC: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    USDT: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      deploy: true,
    },
    SOL: {
      synthetic: true,
      decimals: 18,
    },
  },
};

export default async function (hre: HardhatRuntimeEnvironment): Promise<TokensConfig> {
  const tokens = config[hre.network.name];

  for (const [tokenSymbol, token] of Object.entries(tokens as TokensConfig)) {
    if (token.synthetic) {
      (token as any).address = getSyntheticTokenAddress(hre.network.config.chainId, tokenSymbol);
    }
    if (token.address) {
      (token as any).address = ethers.utils.getAddress(token.address);
    }
    if (!hre.network.live) {
      (token as any).deploy = true;
    }
  }

  return tokens;
}
