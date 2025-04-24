import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { percentageToFloat, expandDecimals, numberToBigNumber } from "../utils/math";

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
          createGlvMarketConfig("WETH", 14_400_000, 1.3309),
          createGlvMarketConfig("DOGE", 4_000_000, 1.6338),
          createGlvMarketConfig("LTC", 6_687_072, 1.286),
          createGlvMarketConfig("XRP", 10_368_000, 1.2033),
          createGlvMarketConfig("ATOM", 600_000, 0.98972),
          createGlvMarketConfig("NEAR", 3_000_000, 0.97498),
          createGlvMarketConfig("SHIB", 1_200_000, 0.97582),
          createGlvMarketConfig("EIGEN", 1_500_000, 1.0323),
          createGlvMarketConfig("UNI", 900_000, 0.88782),
          createGlvMarketConfig("POL", 1_000_000, 0.87785),
          createGlvMarketConfig("SUI", 10_368_000, 0.98039),
          createGlvMarketConfig("SEI", 1_000_000, 0.89197),
          createGlvMarketConfig("APT", 864_000, 0.88056),
          createGlvMarketConfig("TIA", 2_400_000, 0.90836),
          createGlvMarketConfig("TON", 1_200_000, 0.87009),
          createGlvMarketConfig("TRX", 720_000, 0.85756),
          createGlvMarketConfig("BONK", 500_000, 0.81609),
          createGlvMarketConfig("WLD", 1_036_800, 0.80116),
          createGlvMarketConfig("RENDER", 3_654_000, 0.8016),
          createGlvMarketConfig("TRUMP", 4_600_000, 0.84268),
          createGlvMarketConfig("MELANIA", 3_095_866, 0.78007),
          createGlvMarketConfig("ENA", 1_791_000, 0.78236),
          createGlvMarketConfig("LDO", 720_000, 0.80089),
          createGlvMarketConfig("BERA", 6_449_725, 0.76405),
          createGlvMarketConfig("ONDO", 1_036_800, 0.87433),
          createGlvMarketConfig("FET", 500_000, 0.82503),
          createGlvMarketConfig("AIXBT", 432_000, 0.88856),
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
          createGlvMarketConfig("BTC", 22_000_000, 2.2846),
          createGlvMarketConfig("ORDI", 600_000, 1.3308),
          createGlvMarketConfig("STX", 800_000, 1.3731),
          createGlvMarketConfig("SATS", 400_000, 1.437),
          createGlvMarketConfig("TAO", 1_296_000, 1.1769),
          createGlvMarketConfig("BOME", 500_000, 1.0357),
          createGlvMarketConfig("MEME", 500_000, 1.0819),
          createGlvMarketConfig("FLOKI", 500_000, 1.0275),
          createGlvMarketConfig("MEW", 500_000, 0.9896),
          createGlvMarketConfig("ADA", 1_728_000, 0.89793),
          createGlvMarketConfig("XLM", 1_000_000, 0.99788),
          createGlvMarketConfig("BCH", 500_000, 0.9884),
          createGlvMarketConfig("DOT", 1_080_000, 0.98504),
          createGlvMarketConfig("ICP", 750_000, 1.0033),
          createGlvMarketConfig("FIL", 600_000, 0.98659),
          createGlvMarketConfig("INJ", 500_000, 1.0172),
          createGlvMarketConfig("DYDX", 300_000, 0.9837),
          createGlvMarketConfig("FARTCOIN", 4_300_000, 1.1257),
          createGlvMarketConfig("AI16Z", 1_492_000, 0.99831),
          createGlvMarketConfig("VIRTUAL", 720_000, 0.99346),
          createGlvMarketConfig("PENGU", 720_000, 0.97501),
          createGlvMarketConfig("S", 1_244_160, 1.1142),
          createGlvMarketConfig("CAKE", 500_000, 1.0369),
          createGlvMarketConfig("HYPE", 1_036_800, 2.3468),
          createGlvMarketConfig("JUP", 500_000, 0.98966),
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
          createGlvMarketConfig("WAVAX", 7_800_000, 2.145),
          createGlvMarketConfig("XRP", 2_311_044, 1.5695),
          createGlvMarketConfig("DOGE", 414_000, 2.2393),
          createGlvMarketConfig("LTC", 150_000, 2.9631),
          createGlvMarketConfig("TRUMP", 250_000, 0.98854),
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
