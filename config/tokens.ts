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
  realtimeFeedId?: string;
  realtimeFeedDecimals?: number;
};

type RealTokenConfig = {
  address: string;
  decimals: number;
  transferGasLimit: number;
  synthetic?: never;
  wrappedNative?: true;
  deploy?: never;
  realtimeFeedId?: string;
  realtimeFeedDecimals?: number;
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
  realtimeFeedId?: string;
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
      realtimeFeedId: "0x0f49a4533a64c7f53bfdf5e86d791620d93afdec00cfe1896548397b0f4ec81c",
      realtimeFeedDecimals: 8,
    },
    "WBTC.e": {
      address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      decimals: 8,
      transferGasLimit: 200 * 1000,
      realtimeFeedId: "0x0f49a4533a64c7f53bfdf5e86d791620d93afdec00cfe1896548397b0f4ec81c",
      realtimeFeedDecimals: 8,
    },
    WETH: {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      decimals: 18,
      wrappedNative: true,
      transferGasLimit: 200 * 1000,
      realtimeFeedId: "0x74aca63821bf7ead199e924d261d277cbec96d1026ab65267d655c51b4536914",
      realtimeFeedDecimals: 8,
    },
    XRP: {
      synthetic: true,
      decimals: 6,
      realtimeFeedId: "0x0001c2a85041d51394ea4772d8f5d1940b67d71c2efd2ef58607392b4e7ce829",
      realtimeFeedDecimals: 8,
    },
    DOGE: {
      synthetic: true,
      decimals: 8,
      realtimeFeedId: "0x5f82d154119f4251d83b2a58bf61c9483c84241053038a2883abf16ed4926433",
      realtimeFeedDecimals: 8,
    },
    SOL: {
      address: "0x2bcC6D6CdBbDC0a4071e48bb3B969b06B3330c07",
      decimals: 9,
      transferGasLimit: 200 * 1000,
      realtimeFeedId: "0x000110856f6b45c76060b8518245a06bc4a6cdbc1b450b112f02c00cf2bde7ca",
      realtimeFeedDecimals: 8,
    },
    LTC: {
      synthetic: true,
      decimals: 8,
      realtimeFeedId: "0x0001ba61bb3d44104e7636dd9f8e4baf5bc27edf7ee182db5843febe2bb9706c",
      realtimeFeedDecimals: 8,
    },
    UNI: {
      address: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      realtimeFeedId: "0x0001bb84346cbd081f57593a19a124d45b5a194ba86fea1c3e8eadbfbff9702f",
      realtimeFeedDecimals: 8,
    },
    LINK: {
      address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      realtimeFeedId: "0x64ee16b94fdd72d0b3769955445cc82d6804573c22f0f49b67cd02edd07461e7",
      realtimeFeedDecimals: 8,
    },
    ARB: {
      address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      realtimeFeedId: "0xb43dc495134fa357725f93539511c5a4febeadf56e7c29c96566c825094f0b20",
      realtimeFeedDecimals: 8,
    },
    USDC: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      decimals: 6,
      transferGasLimit: 200 * 1000,
      realtimeFeedId: "0x95241f154d34539741b19ce4bae815473fd1b2a90ac3b4b023a692f31edfe90e",
      realtimeFeedDecimals: 8,
    },
    "USDC.e": {
      address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      decimals: 6,
      transferGasLimit: 200 * 1000,
      realtimeFeedId: "0x95241f154d34539741b19ce4bae815473fd1b2a90ac3b4b023a692f31edfe90e",
      realtimeFeedDecimals: 8,
    },
    USDT: {
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      decimals: 6,
      transferGasLimit: 200 * 1000,
      realtimeFeedId: "0x297cc1e1ee5fc2f45dff1dd11a46694567904f4dbc596c7cc216d6c688605a1b",
      realtimeFeedDecimals: 8,
    },
    DAI: {
      address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      realtimeFeedId: "0x2cdd4aea8298f5d2e7f8505b91e3313e3aa04376a81f401b4a48c5aab78ee5cf",
      realtimeFeedDecimals: 8,
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
      realtimeFeedId: "0x4554482d5553442d415242495452554d2d544553544e45540000000000000000",
      realtimeFeedDecimals: 8,
    },
    WBTC: {
      decimals: 8,
      transferGasLimit: 200 * 1000,
      address: "0xCcF73F4Dcbbb573296BFA656b754Fe94BB957d62",
      realtimeFeedId: "0x4254432d5553442d415242495452554d2d544553544e45540000000000000000",
      realtimeFeedDecimals: 8,
    },
    USDC: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      address: "0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5",
      realtimeFeedId: "0x555344432d5553442d415242495452554d2d544553544e455400000000000000",
      realtimeFeedDecimals: 8,
    },
    SOL: {
      synthetic: true,
      decimals: 18,
    },
    USDT: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      address: "0xBFcBcdCbcc1b765843dCe4DF044B92FE68182a62",
      realtimeFeedId: "0x12be1859ee43f46bab53750915f20855f54e891f88ddd524f26a72d6f4deed1d",
      realtimeFeedDecimals: 8,
    },
    DAI: {
      decimals: 18,
      transferGasLimit: 200 * 1000,
      address: "0x7b7c6c49fA99b37270077FBFA398748c27046984",
      realtimeFeedId: "0xbf1febc8c335cb236c1995c1007a928a3f7ae8307a1a20cb31334e6d316c62d1",
      realtimeFeedDecimals: 8,
    },
    TEST: {
      synthetic: true,
      decimals: 18,
    },
    BNB: {
      decimals: 18,
      synthetic: true,
      realtimeFeedId: "0x26c16f2054b7a1d77ae83a0429dace9f3000ba4dbf1690236e8f575742e98f66",
      realtimeFeedDecimals: 8,
    },
    DOGE: {
      decimals: 8,
      synthetic: true,
      realtimeFeedId: "0x4ce52cf28e49f4673198074968aeea280f13b5f897c687eb713bcfc1eeab89ba",
      realtimeFeedDecimals: 8,
    },
    LINK: {
      decimals: 18,
      synthetic: true,
      realtimeFeedId: "0x14e044f932bb959cc2aa8dc1ba110c09224e639aae00264c1ffc2a0830904a3c",
      realtimeFeedDecimals: 8,
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
      address: "0x3Bd8e00c25B12E6E60fc8B6f1E1E2236102073Ca",
      transferGasLimit: 200 * 1000,
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
      address: "0x50df4892Bd13f01E4e1Cd077ff394A8fa1A3fD7c",
      transferGasLimit: 200 * 1000,
    },
    DAI: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      address: "0x51290cb93bE5062A6497f16D9cd3376Adf54F920",
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
