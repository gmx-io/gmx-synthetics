import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getSyntheticTokenAddress } from "../utils/token";
import { OracleProvider } from "./oracle";

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
  dataStreamFeedId?: string;
  dataStreamFeedDecimals?: number;
  oracleProvider?: OracleProvider;
};

type RealTokenConfig = {
  address: string;
  decimals: number;
  transferGasLimit: number;
  synthetic?: never;
  wrappedNative?: true;
  deploy?: never;
  dataStreamFeedId?: string;
  dataStreamFeedDecimals?: number;
  oracleProvider?: OracleProvider;
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
  dataStreamFeedId?: string;
  oracleProvider?: OracleProvider;
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
      dataStreamFeedId: "0x00039d9e45394f473ab1f050a1b963e6b05351e52d71e507509ada0c95ed75b8",
      dataStreamFeedDecimals: 18,
    },
    "WBTC.e": {
      address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      decimals: 8,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x00039d9e45394f473ab1f050a1b963e6b05351e52d71e507509ada0c95ed75b8",
      dataStreamFeedDecimals: 18,
    },
    WETH: {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      decimals: 18,
      wrappedNative: true,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x000362205e10b3a147d02792eccee483dca6c7b44ecce7012cb8c6e0b68b3ae9",
      dataStreamFeedDecimals: 18,
    },
    BNB: {
      address: "0xa9004A5421372E1D83fB1f85b0fc986c912f91f3",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x000335fd3f3ffa06cfd9297b97367f77145d7a5f132e84c736cc471dd98621fe",
      dataStreamFeedDecimals: 18,
    },
    XRP: {
      synthetic: true,
      decimals: 6,
      dataStreamFeedId: "0x0003c16c6aed42294f5cb4741f6e59ba2d728f0eae2eb9e6d3f555808c59fc45",
      dataStreamFeedDecimals: 18,
    },
    DOGE: {
      synthetic: true,
      decimals: 8,
      dataStreamFeedId: "0x000356ca64d3b32135e17dc0dc721a645bf50d0303be8ceb2cdca0a50bab8fdc",
      dataStreamFeedDecimals: 18,
    },
    SOL: {
      address: "0x2bcC6D6CdBbDC0a4071e48bb3B969b06B3330c07",
      decimals: 9,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0003b778d3f6b2ac4991302b89cb313f99a42467d6c9c5f96f57c29c0d2bc24f",
      dataStreamFeedDecimals: 18,
    },
    LTC: {
      synthetic: true,
      decimals: 8,
      dataStreamFeedId: "0x00033a4f1021830ac0e7b7a03f70ed56fecb0ac2a10c8ea5328c240c847b71f3",
      dataStreamFeedDecimals: 18,
    },
    UNI: {
      address: "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x000367a3674cdd7cc83dbbd7d19f3768b9d1329586e82e32a1bf388fc5ffd0eb",
      dataStreamFeedDecimals: 18,
    },
    LINK: {
      address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x00036d7a1251e3f67d6658466b5e9e7fe8418af7feac9567ff322bff95cc2401",
      dataStreamFeedDecimals: 18,
    },
    ARB: {
      address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x00030ab7d02fbba9c6304f98824524407b1f494741174320cfd17a2c22eec1de",
      dataStreamFeedDecimals: 18,
    },
    ATOM: {
      synthetic: true,
      decimals: 6,
      dataStreamFeedId: "0x0003c93d9477344d0f2516c4605008399e6750d492a60ab85a9ecb2e441e87b3",
      dataStreamFeedDecimals: 18,
    },
    NEAR: {
      synthetic: true,
      decimals: 24,
      dataStreamFeedId: "0x00036e9386eda6b177c6f7e9d493e60ae9ebaeb732a271b880b4d6a131d6b3f5",
      dataStreamFeedDecimals: 18,
    },
    AAVE: {
      address: "0xba5ddd1f9d7f570dc94a51479a000e3bce967196",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0003481a2f7fe21c01d427f39035541d2b7a53db9c76234dc36082e6ad6db7f5",
      dataStreamFeedDecimals: 18,
    },
    AVAX: {
      address: "0x565609fAF65B92F7be02468acF86f8979423e514",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0003b1cb55b8a00a18111ff745b56d70f04c2d41e03fc7fd8d3d9b09f142aad9",
      dataStreamFeedDecimals: 18,
    },
    OP: {
      address: "0xaC800FD6159c2a2CB8fC31EF74621eB430287a5A",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0003ba5e477371c9cd5446281354a91e66c233dd50e26efe6abbfdc310b92dab",
      dataStreamFeedDecimals: 18,
    },
    GMX: {
      address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0003169a4ebb9178e5ec6281913d1a8a4f676f414c94b60a4cb2e432f9081c60",
      dataStreamFeedDecimals: 18,
    },
    USDC: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      decimals: 6,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x00038f83323b6b08116d1614cf33a9bd71ab5e0abf0c9f1b783a74a43e7bd992",
      dataStreamFeedDecimals: 18,
    },
    "USDC.e": {
      address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      decimals: 6,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x00038f83323b6b08116d1614cf33a9bd71ab5e0abf0c9f1b783a74a43e7bd992",
      dataStreamFeedDecimals: 18,
    },
    USDT: {
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      decimals: 6,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0003a910a43485e0685ff5d6d366541f5c21150f0634c5b14254392d1a1c06db",
      dataStreamFeedDecimals: 18,
    },
    DAI: {
      address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0003571a596aab1cafe1a883795dab90cd8cca48e25f53ab3665aa67d008f386",
      dataStreamFeedDecimals: 18,
    },
  },
  avalanche: {
    "BTC.b": {
      address: "0x152b9d0FdC40C096757F570A51E494bd4b943E50",
      decimals: 8,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x00039d9e45394f473ab1f050a1b963e6b05351e52d71e507509ada0c95ed75b8",
      dataStreamFeedDecimals: 18,
    },
    "WETH.e": {
      address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x000362205e10b3a147d02792eccee483dca6c7b44ecce7012cb8c6e0b68b3ae9",
      dataStreamFeedDecimals: 18,
    },
    XRP: {
      synthetic: true,
      decimals: 6,
      dataStreamFeedId: "0x0003c16c6aed42294f5cb4741f6e59ba2d728f0eae2eb9e6d3f555808c59fc45",
      dataStreamFeedDecimals: 18,
    },
    DOGE: {
      synthetic: true,
      decimals: 8,
      dataStreamFeedId: "0x000356ca64d3b32135e17dc0dc721a645bf50d0303be8ceb2cdca0a50bab8fdc",
      dataStreamFeedDecimals: 18,
    },
    SOL: {
      address: "0xFE6B19286885a4F7F55AdAD09C3Cd1f906D2478F",
      decimals: 9,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0003b778d3f6b2ac4991302b89cb313f99a42467d6c9c5f96f57c29c0d2bc24f",
      dataStreamFeedDecimals: 18,
    },
    LTC: {
      synthetic: true,
      decimals: 8,
      dataStreamFeedId: "0x00033a4f1021830ac0e7b7a03f70ed56fecb0ac2a10c8ea5328c240c847b71f3",
      dataStreamFeedDecimals: 18,
    },
    WAVAX: {
      address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
      decimals: 18,
      wrappedNative: true,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0003b1cb55b8a00a18111ff745b56d70f04c2d41e03fc7fd8d3d9b09f142aad9",
      dataStreamFeedDecimals: 18,
    },
    USDC: {
      address: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      decimals: 6,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x00038f83323b6b08116d1614cf33a9bd71ab5e0abf0c9f1b783a74a43e7bd992",
      dataStreamFeedDecimals: 18,
    },
    "USDC.e": {
      address: "0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664",
      decimals: 6,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x00038f83323b6b08116d1614cf33a9bd71ab5e0abf0c9f1b783a74a43e7bd992",
      dataStreamFeedDecimals: 18,
    },
    USDT: {
      address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
      decimals: 6,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0003a910a43485e0685ff5d6d366541f5c21150f0634c5b14254392d1a1c06db",
      dataStreamFeedDecimals: 18,
    },
    "USDT.e": {
      address: "0xc7198437980c041c805A1EDcbA50c1Ce5db95118",
      decimals: 6,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0003a910a43485e0685ff5d6d366541f5c21150f0634c5b14254392d1a1c06db",
      dataStreamFeedDecimals: 18,
    },
    "DAI.e": {
      address: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0003571a596aab1cafe1a883795dab90cd8cca48e25f53ab3665aa67d008f386",
      dataStreamFeedDecimals: 18,
    },
  },
  arbitrumSepolia: {
    WETH: {
      address: "0x980b62da83eff3d4576c647993b0c1d7faf17c73", // not verified
      decimals: 18,
      wrappedNative: true,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0001d678deabc04f0494b78138727170ff1cf1daf91fca6954de59e41fa0965c",
      dataStreamFeedDecimals: 18,
    },
    BTC: {
      address: "0xF79cE1Cf38A09D572b021B4C5548b75A14082F12",
      decimals: 8,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0001ef0379c835e64d03082e561403cc14b2779b525d93149b25df0ee3ef9456",
      dataStreamFeedDecimals: 18,
    },
    USDC: {
      address: "0x3321Fd36aEaB0d5CdfD26f4A3A93E2D2aAcCB99f",
      decimals: 6,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0001829d7d4c7c5badcd54d2126e621c51eabf32393ffab969e311b18ed80138",
      dataStreamFeedDecimals: 18,
    },
  },
  arbitrumGoerli: {
    WETH: {
      address: "0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3",
      decimals: 18,
      wrappedNative: true,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x4554482d5553442d415242495452554d2d544553544e45540000000000000000",
      dataStreamFeedDecimals: 18,
    },
    BTC: {
      synthetic: true,
      decimals: 8,
      dataStreamFeedId: "0x4254432d5553442d415242495452554d2d544553544e45540000000000000000",
      dataStreamFeedDecimals: 18,
    },
    WBTC: {
      decimals: 8,
      transferGasLimit: 200 * 1000,
      address: "0xCcF73F4Dcbbb573296BFA656b754Fe94BB957d62",
      dataStreamFeedId: "0x4254432d5553442d415242495452554d2d544553544e45540000000000000000",
      dataStreamFeedDecimals: 18,
    },
    USDC: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      address: "0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5",
      dataStreamFeedId: "0x555344432d5553442d415242495452554d2d544553544e455400000000000000",
      dataStreamFeedDecimals: 18,
    },
    SOL: {
      synthetic: true,
      decimals: 18,
    },
    USDT: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      address: "0xBFcBcdCbcc1b765843dCe4DF044B92FE68182a62",
      dataStreamFeedId: "0x12be1859ee43f46bab53750915f20855f54e891f88ddd524f26a72d6f4deed1d",
      dataStreamFeedDecimals: 18,
    },
    DAI: {
      decimals: 18,
      transferGasLimit: 200 * 1000,
      address: "0x7b7c6c49fA99b37270077FBFA398748c27046984",
      dataStreamFeedId: "0xbf1febc8c335cb236c1995c1007a928a3f7ae8307a1a20cb31334e6d316c62d1",
      dataStreamFeedDecimals: 18,
    },
    TEST: {
      synthetic: true,
      decimals: 18,
    },
    BNB: {
      decimals: 18,
      synthetic: true,
      dataStreamFeedId: "0x26c16f2054b7a1d77ae83a0429dace9f3000ba4dbf1690236e8f575742e98f66",
      dataStreamFeedDecimals: 18,
    },
    DOGE: {
      decimals: 8,
      synthetic: true,
      dataStreamFeedId: "0x4ce52cf28e49f4673198074968aeea280f13b5f897c687eb713bcfc1eeab89ba",
      dataStreamFeedDecimals: 18,
    },
    LINK: {
      decimals: 18,
      synthetic: true,
      dataStreamFeedId: "0x14e044f932bb959cc2aa8dc1ba110c09224e639aae00264c1ffc2a0830904a3c",
      dataStreamFeedDecimals: 18,
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
      dataStreamFeedId: "0x0003735a076086936550bd316b18e5e27fc4f280ee5b6530ce68f5aad404c796",
      dataStreamFeedDecimals: 18,
    },
    TEST: {
      synthetic: true,
      decimals: 18,
      oracleProvider: "gmOracle",
    },
    WBTC: {
      decimals: 8,
      address: "0x3Bd8e00c25B12E6E60fc8B6f1E1E2236102073Ca",
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439",
      dataStreamFeedDecimals: 18,
    },
    SOL: {
      synthetic: true,
      decimals: 18,
      dataStreamFeedId: "0x0003d338ea2ac3be9e026033b1aa601673c37bab5e13851c59966f9f820754d6",
      dataStreamFeedDecimals: 18,
    },
    USDC: {
      address: "0x3eBDeaA0DB3FfDe96E7a0DBBAFEC961FC50F725F",
      decimals: 6,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x0003dc85e8b01946bf9dfd8b0db860129181eb6105a8c8981d9f28e00b6f60d9",
      dataStreamFeedDecimals: 18,
    },
    USDT: {
      decimals: 6,
      address: "0x50df4892Bd13f01E4e1Cd077ff394A8fa1A3fD7c",
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x00032874077216155926e26c159c1c20a572921371d9de605fe9633e48d136f9",
      dataStreamFeedDecimals: 18,
    },
    DAI: {
      decimals: 6,
      transferGasLimit: 200 * 1000,
      address: "0x51290cb93bE5062A6497f16D9cd3376Adf54F920",
      dataStreamFeedId: "0x0003649272a19e143a7f4c2d98905b413e98dce81fb09287dcf4c513cba5cc72",
      dataStreamFeedDecimals: 18,
    },
    WETH: {
      address: "0x82F0b3695Ed2324e55bbD9A9554cB4192EC3a514",
      decimals: 18,
      transferGasLimit: 200 * 1000,
      dataStreamFeedId: "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782",
      dataStreamFeedDecimals: 18,
    },
    BNB: {
      decimals: 18,
      synthetic: true,
      dataStreamFeedId: "0x000387d7c042a9d5c97c15354b531bd01bf6d3a351e190f2394403cf2f79bde9",
      dataStreamFeedDecimals: 18,
    },
    DOGE: {
      decimals: 8,
      synthetic: true,
      dataStreamFeedId: "0x00032057c7f224d0266b4311a81cdc3e38145e36442713350d3300fb12e85c99",
      dataStreamFeedDecimals: 18,
    },
    LINK: {
      decimals: 18,
      synthetic: true,
      dataStreamFeedId: "0x00036fe43f87884450b4c7e093cd5ed99cac6640d8c2000e6afc02c8838d0265",
      dataStreamFeedDecimals: 18,
    },
    ADA: {
      decimals: 18,
      synthetic: true,
      oracleProvider: "gmOracle",
    },
    DOT: {
      decimals: 18,
      synthetic: true,
      oracleProvider: "gmOracle",
    },
    MATIC: {
      decimals: 18,
      synthetic: true,
      dataStreamFeedId: "0x0003fd6ff25e1a28ddd55c85882279987be478a66a75abdf05a468beb5b8b467",
      dataStreamFeedDecimals: 18,
      oracleProvider: "gmOracle",
    },
    UNI: {
      decimals: 18,
      synthetic: true,
      dataStreamFeedId: "0x00032b6edb94b883e95693b8fdae3deeedab2c48dd699cafa43a8d134d344813",
      dataStreamFeedDecimals: 18,
    },
    TRX: {
      decimals: 18,
      synthetic: true,
      oracleProvider: "gmOracle",
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
    (token as any).symbol = tokenSymbol;
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
