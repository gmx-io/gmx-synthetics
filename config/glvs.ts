import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { percentageToFloat, expandDecimals, decimalToFloat, numberToBigNumber } from "../utils/math";

type GlvConfig = {
  name: string;
  symbol: string;

  longToken: string;
  shortToken: string;

  // address is required for updateGlvConfig script
  address?: string;

  // not required, default value will be used if not specified
  transferGasLimit?: number;

  shiftMaxPriceImpactFactor: BigNumberish;
  shiftMinInterval: number;
  minTokensForFirstGlvDeposit: BigNumberish;
  markets: {
    indexToken: string;
    isMarketDisabled?: boolean;
    glvMaxMarketTokenBalanceAmount: BigNumberish;
    glvMaxMarketTokenBalanceUsd: BigNumberish;
  }[];
}[];

function createGlvMarketConfig(
  tokenSymbol: string,
  usdCap: number,
  tokenPrice: number
): GlvConfig[any]["markets"][number] {
  return {
    indexToken: tokenSymbol,
    glvMaxMarketTokenBalanceAmount: numberToBigNumber(usdCap / tokenPrice, 18),
    glvMaxMarketTokenBalanceUsd: numberToBigNumber(usdCap, 30),
  };
}

export default async function ({ network }: HardhatRuntimeEnvironment) {
  const config: GlvConfig = {
    arbitrum: [
      {
        name: "GMX Liquidity Vault [WETH-USDC]",
        symbol: "GLV [WETH-USDC]",
        address: "0x528A5bac7E746C9A509A1f4F6dF58A03d44279F9",
        longToken: "WETH",
        shortToken: "USDC",
        shiftMaxPriceImpactFactor: percentageToFloat("0.025%"),
        shiftMinInterval: 30 * 60, // 30 minutes
        minTokensForFirstGlvDeposit: expandDecimals(1, 18),
        markets: [
          // {
          //   indexToken: "WETH",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(11_708_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(14_400_000),
          // },
          createGlvMarketConfig("WETH", 14_400_000, 1.3309),
          // {
          //   indexToken: "DOGE",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(2_100_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(4_000_000),
          // },
          createGlvMarketConfig("DOGE", 4_000_000, 1.6338),
          // {
          //   indexToken: "LTC",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(5_149_447, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(6_687_072),
          // },
          createGlvMarketConfig("LTC", 6_687_072, 1.286),
          // {
          //   indexToken: "XRP",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(9_150_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(10_368_000),
          // },
          createGlvMarketConfig("XRP", 10_368_000, 1.2033),
          // {
          //   indexToken: "ATOM",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(642_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(600_000),
          // },
          createGlvMarketConfig("ATOM", 600_000, 0.98972),
          // {
          //   indexToken: "NEAR",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(2_600_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(3_000_000),
          // },
          createGlvMarketConfig("NEAR", 3_000_000, 0.97498),
          // {
          //   indexToken: "SHIB",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(870_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(1_200_000),
          // },
          createGlvMarketConfig("SHIB", 1_200_000, 0.97582),
          // {
          //   indexToken: "EIGEN",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(1_150_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(1_500_000),
          // },
          createGlvMarketConfig("EIGEN", 1_500_000, 1.0323),
          // {
          //   indexToken: "UNI",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(550_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(900_000),
          // },
          createGlvMarketConfig("UNI", 900_000, 0.88782),
          // {
          //   indexToken: "POL",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(910_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(1_000_000),
          // },
          createGlvMarketConfig("POL", 1_000_000, 0.87785),
          // {
          //   indexToken: "SUI",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(8_828_337, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(10_368_000),
          // },
          createGlvMarketConfig("SUI", 10_368_000, 0.98039),
          // {
          //   indexToken: "SEI",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(910_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(1_000_000),
          // },
          createGlvMarketConfig("SEI", 1_000_000, 0.89197),
          // {
          //   indexToken: "APT",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(822_857, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(864_000),
          // },
          createGlvMarketConfig("APT", 864_000, 0.88056),
          // {
          //   indexToken: "TIA",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(1_904_761, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(2_400_000),
          // },
          createGlvMarketConfig("TIA", 2_400_000, 0.90836),
          // {
          //   indexToken: "TON",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(1_314_578, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(1_200_000),
          // },
          createGlvMarketConfig("TON", 1_200_000, 0.87009),
          // {
          //   indexToken: "TRX",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(885_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(720_000),
          // },
          createGlvMarketConfig("TRX", 720_000, 0.85756),
          // {
          //   indexToken: "BONK",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          // },
          createGlvMarketConfig("BONK", 500_000, 0.81609),
          // {
          //   indexToken: "WLD",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(968_971, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(1_036_800),
          // },
          createGlvMarketConfig("WLD", 1_036_800, 0.80116),
          // {
          //   indexToken: "RENDER",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(4_488_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(3_654_000),
          // },
          createGlvMarketConfig("RENDER", 3_654_000, 0.8016),
          // {
          //   indexToken: "TRUMP",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(4_600_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(4_600_000),
          // },
          createGlvMarketConfig("TRUMP", 4_600_000, 0.84268),
          // {
          //   indexToken: "MELANIA",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(3_654_750, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(3_095_866),
          // },
          createGlvMarketConfig("MELANIA", 3_095_866, 0.78007),
          // {
          //   indexToken: "ENA",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(2_415_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(1_791_000),
          // },
          createGlvMarketConfig("ENA", 1_791_000, 0.78236),
          // {
          //   indexToken: "LDO",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(948_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(720_000),
          // },
          createGlvMarketConfig("LDO", 720_000, 0.80089),
          // {
          //   indexToken: "BERA",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(7_704_568, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(6_449_725),
          // },
          createGlvMarketConfig("BERA", 6_449_725, 0.76405),
          // {
          //   indexToken: "ONDO",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(1_107_432, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(1_036_800),
          // },
          createGlvMarketConfig("ONDO", 1_036_800, 0.87433),
          // {
          //   indexToken: "FET",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          // },
          createGlvMarketConfig("FET", 500_000, 0.82503),
          // {
          //   indexToken: "AIXBT",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(473_051, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(432_000),
          // },
          createGlvMarketConfig("AIXBT", 432_000, 0.88856),
          // {
          //   indexToken: "MKR",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          // },
          createGlvMarketConfig("MKR", 500_000, 0.97207),
        ],
      },
      {
        name: "GMX Liquidity Vault [WBTC-USDC]",
        symbol: "GLV [WBTC-USDC]",
        address: "0xdF03EEd325b82bC1d4Db8b49c30ecc9E05104b96",
        longToken: "WBTC.e",
        shortToken: "USDC",
        shiftMaxPriceImpactFactor: percentageToFloat("0.025%"),
        shiftMinInterval: 30 * 60, // 30 minutes
        minTokensForFirstGlvDeposit: expandDecimals(1, 18),
        markets: [
          // {
          //   indexToken: "BTC",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(13_000_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(22_000_000),
          // },
          createGlvMarketConfig("BTC", 22_000_000, 2.2846),
          // {
          //   indexToken: "ORDI",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(600_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(600_000),
          // },
          createGlvMarketConfig("ORDI", 600_000, 1.3308),
          // {
          //   indexToken: "STX",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(800_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(800_000),
          // },
          createGlvMarketConfig("STX", 800_000, 1.3731),
          // {
          //   indexToken: "SATS",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(400_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(400_000),
          // },
          createGlvMarketConfig("SATS", 400_000, 1.437),
          // {
          //   indexToken: "TAO",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(1_148_325, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(1_296_000),
          // },
          createGlvMarketConfig("TAO", 1_296_000, 1.1769),
          // {
          //   indexToken: "BOME",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          // },
          createGlvMarketConfig("BOME", 500_000, 1.0357),
          // {
          //   indexToken: "MEME",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          // },
          createGlvMarketConfig("MEME", 500_000, 1.0819),
          // {
          //   indexToken: "FLOKI",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          // },
          createGlvMarketConfig("FLOKI", 500_000, 1.0275),
          // {
          //   indexToken: "MEW",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          // },
          createGlvMarketConfig("MEW", 500_000, 0.9896),
          // {
          //   indexToken: "ADA",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(1_909_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(1_728_000),
          // },
          createGlvMarketConfig("ADA", 1_728_000, 0.89793),
          // {
          //   indexToken: "XLM",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(1_000_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(1_000_000),
          // },
          createGlvMarketConfig("XLM", 1_000_000, 0.99788),
          // {
          //   indexToken: "BCH",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          // },
          createGlvMarketConfig("BCH", 500_000, 0.9884),
          // {
          //   indexToken: "DOT",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(1_080_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(1_080_000),
          // },
          createGlvMarketConfig("DOT", 1_080_000, 0.98504),
          // {
          //   indexToken: "ICP",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(750_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(750_000),
          // },
          createGlvMarketConfig("ICP", 750_000, 1.0033),
          // {
          //   indexToken: "FIL",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(600_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(600_000),
          // },
          createGlvMarketConfig("FIL", 600_000, 0.98659),
          // {
          //   indexToken: "INJ",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          // },
          createGlvMarketConfig("INJ", 500_000, 1.0172),
          // {
          //   indexToken: "DYDX",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(300_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(300_000),
          // },
          createGlvMarketConfig("DYDX", 300_000, 0.9837),
          // {
          //   indexToken: "FARTCOIN",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(4_114_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(4_300_000),
          // },
          createGlvMarketConfig("FARTCOIN", 4_300_000, 1.1257),
          // {
          //   indexToken: "AI16Z",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(1_483_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(1_492_000),
          // },
          createGlvMarketConfig("AI16Z", 1_492_000, 0.99831),
          // {
          //   indexToken: "VIRTUAL",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(793_974, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(720_000),
          // },
          createGlvMarketConfig("VIRTUAL", 720_000, 0.99346),
          // {
          //   indexToken: "PENGU",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(733_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(720_000),
          // },
          createGlvMarketConfig("PENGU", 720_000, 0.97501),
          // {
          //   indexToken: "S",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(1_177_512, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(1_244_160),
          // },
          createGlvMarketConfig("S", 1_244_160, 1.1142),
          // {
          //   indexToken: "CAKE",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          // },
          createGlvMarketConfig("CAKE", 500_000, 1.0369),
          // {
          //   indexToken: "HYPE",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(444_234, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(1_036_800),
          // },
          createGlvMarketConfig("HYPE", 1_036_800, 2.3468),
          // {
          //   indexToken: "JUP",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          // },
          createGlvMarketConfig("JUP", 500_000, 0.98966),
          // {
          //   indexToken: "OM",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          // },
          createGlvMarketConfig("OM", 500_000, 1.0372),
        ],
      },
    ],
    avalanche: [
      {
        address: "0x901eE57f7118A7be56ac079cbCDa7F22663A3874",
        name: "GMX Liquidity Vault [WAVAX-USDC]",
        symbol: "GLV [WAVAX-USDC]",
        longToken: "WAVAX",
        shortToken: "USDC",
        shiftMaxPriceImpactFactor: percentageToFloat("0.1%"),
        shiftMinInterval: 60 * 60, // 1 hour
        minTokensForFirstGlvDeposit: expandDecimals(1, 18),
        markets: [
          // {
          //   indexToken: "WAVAX",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(2_888_888, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(7_800_000),
          // },
          createGlvMarketConfig("WAVAX", 7_800_000, 2.145),
          // {
          //   indexToken: "XRP",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(1_490_996, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(2_311_044),
          // },
          createGlvMarketConfig("XRP", 2_311_044, 1.5695),
          // {
          //   indexToken: "DOGE",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(157_432, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(414_000),
          // },
          createGlvMarketConfig("DOGE", 414_000, 2.2393),
          // {
          //   indexToken: "LTC",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(46_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(150_000),
          // },
          createGlvMarketConfig("LTC", 150_000, 2.9631),
          // {
          //   indexToken: "TRUMP",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(250_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(250_000),
          // },
          createGlvMarketConfig("TRUMP", 250_000, 0.98854),
          // {
          //   indexToken: "MELANIA",
          //   glvMaxMarketTokenBalanceAmount: expandDecimals(250_000, 18),
          //   glvMaxMarketTokenBalanceUsd: decimalToFloat(250_000),
          // },
          createGlvMarketConfig("MELANIA", 250_000, 0.95133),
        ],
      },
    ],
    avalancheFuji: [
      {
        name: "GMX Liquidity Vault [WETH-USDC]",
        address: "0xc519a5b8e5e93D3ec85D62231C1681c44952689d",
        symbol: "GLV",
        longToken: "WETH",
        shortToken: "USDC",
        transferGasLimit: 200_000,
        shiftMaxPriceImpactFactor: percentageToFloat("2%"),
        shiftMinInterval: 300, // 5 minutes
        minTokensForFirstGlvDeposit: expandDecimals(2, 18),
        markets: [
          {
            indexToken: "WETH",
            glvMaxMarketTokenBalanceAmount: expandDecimals(75_000, 18),
            glvMaxMarketTokenBalanceUsd: expandDecimals(100_000, 30),
          },
          {
            indexToken: "DOT",
            glvMaxMarketTokenBalanceAmount: expandDecimals(10_000, 18),
            glvMaxMarketTokenBalanceUsd: expandDecimals(10_000, 30),
          },
          {
            indexToken: "TEST",
            glvMaxMarketTokenBalanceAmount: expandDecimals(100_000, 18),
            glvMaxMarketTokenBalanceUsd: expandDecimals(50_000, 30),
          },
          {
            indexToken: "SOL",
            glvMaxMarketTokenBalanceAmount: expandDecimals(4_000, 18),
            glvMaxMarketTokenBalanceUsd: expandDecimals(5_000, 30),
          },
          {
            indexToken: "MATIC",
            glvMaxMarketTokenBalanceAmount: expandDecimals(1_000, 18),
            glvMaxMarketTokenBalanceUsd: expandDecimals(2_000, 30),
          },
        ],
      },
      {
        name: "GMX Liquidity Vault [WBTC-USDC]",
        address: "0xA5e6D641E88b4f17c2D39bf0E55769C63D6AaE46",
        symbol: "GLV [WBTC-USDC]",
        longToken: "WBTC",
        shortToken: "USDC",
        transferGasLimit: 200_000,
        shiftMaxPriceImpactFactor: percentageToFloat("2%"),
        shiftMinInterval: 300, // 5 minutes
        minTokensForFirstGlvDeposit: expandDecimals(2, 18),
        markets: [
          {
            indexToken: "WBTC",
            glvMaxMarketTokenBalanceAmount: expandDecimals(75_000, 18),
            glvMaxMarketTokenBalanceUsd: expandDecimals(100_000, 30),
          },
        ],
      },
    ],
  }[network.name]!;

  if (!config) {
    throw new Error(`Network config not defined for ${network.name}`);
  }

  return config;
}
