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
  const arbitrum_ethUsdcDefaultCap = 3_000_000; // 20% of 15M
  const arbitrum_btcUsdcDefaultCap = 2_000_000; // 20% of 10M
  const avalanche_avaxUsdcDefaultCap = 320_000; // 20% of 1.6M

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
          createGlvMarketConfig("WETH", 15_000_000, 1.3309),
          createGlvMarketConfig("XRP", 10_000_000, 1.2033),
          createGlvMarketConfig("SUI", 7_500_000, 0.98039),
          createGlvMarketConfig("DOGE", 7_500_000, 1.6338),
          createGlvMarketConfig("LTC", 7_500_000, 1.286),
          createGlvMarketConfig("BERA", 6_500_000, 0.76405),
          createGlvMarketConfig("TRUMP", 4_600_000, 0.84268),
          createGlvMarketConfig("RENDER", 4_620_000, 0.81567),
          createGlvMarketConfig("MELANIA", arbitrum_ethUsdcDefaultCap, 0.78007),
          createGlvMarketConfig("ATOM", arbitrum_ethUsdcDefaultCap, 0.98972),
          createGlvMarketConfig("NEAR", arbitrum_ethUsdcDefaultCap, 0.97498),
          createGlvMarketConfig("SHIB", arbitrum_ethUsdcDefaultCap, 0.97582),
          createGlvMarketConfig("EIGEN", arbitrum_ethUsdcDefaultCap, 1.0323),
          createGlvMarketConfig("UNI", arbitrum_ethUsdcDefaultCap, 0.88782),
          createGlvMarketConfig("POL", arbitrum_ethUsdcDefaultCap, 0.87785),
          createGlvMarketConfig("SEI", arbitrum_ethUsdcDefaultCap, 0.89197),
          createGlvMarketConfig("APT", arbitrum_ethUsdcDefaultCap, 0.88056),
          createGlvMarketConfig("TIA", arbitrum_ethUsdcDefaultCap, 0.90836),
          createGlvMarketConfig("TON", arbitrum_ethUsdcDefaultCap, 0.87009),
          createGlvMarketConfig("TRX", arbitrum_ethUsdcDefaultCap, 0.85756),
          createGlvMarketConfig("BONK", arbitrum_ethUsdcDefaultCap, 0.81609),
          createGlvMarketConfig("WLD", arbitrum_ethUsdcDefaultCap, 0.80116),
          createGlvMarketConfig("ENA", arbitrum_ethUsdcDefaultCap, 0.78236),
          createGlvMarketConfig("LDO", arbitrum_ethUsdcDefaultCap, 0.80089),
          createGlvMarketConfig("ONDO", arbitrum_ethUsdcDefaultCap, 0.87433),
          createGlvMarketConfig("FET", arbitrum_ethUsdcDefaultCap, 0.82503),
          createGlvMarketConfig("AIXBT", arbitrum_ethUsdcDefaultCap, 0.88856),
          createGlvMarketConfig("MKR", arbitrum_ethUsdcDefaultCap, 0.97207),
          createGlvMarketConfig("DOLO", arbitrum_ethUsdcDefaultCap, 1.1223),
          createGlvMarketConfig("ZRO", arbitrum_ethUsdcDefaultCap, 1.0),
          createGlvMarketConfig("CRV", arbitrum_ethUsdcDefaultCap, 1.0),
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
          createGlvMarketConfig("BTC", 10_000_000, 2.2846),
          createGlvMarketConfig("FARTCOIN", 4_300_000, 1.1257),
          createGlvMarketConfig("ORDI", arbitrum_btcUsdcDefaultCap, 1.3308),
          createGlvMarketConfig("STX", arbitrum_btcUsdcDefaultCap, 1.3731),
          createGlvMarketConfig("SATS", arbitrum_btcUsdcDefaultCap, 1.437),
          createGlvMarketConfig("TAO", arbitrum_btcUsdcDefaultCap, 1.1769),
          createGlvMarketConfig("BOME", arbitrum_btcUsdcDefaultCap, 1.0357),
          createGlvMarketConfig("MEME", arbitrum_btcUsdcDefaultCap, 1.0819),
          createGlvMarketConfig("FLOKI", arbitrum_btcUsdcDefaultCap, 1.0275),
          createGlvMarketConfig("MEW", arbitrum_btcUsdcDefaultCap, 0.9896),
          createGlvMarketConfig("ADA", arbitrum_btcUsdcDefaultCap, 0.89793),
          createGlvMarketConfig("XLM", arbitrum_btcUsdcDefaultCap, 0.99788),
          createGlvMarketConfig("BCH", arbitrum_btcUsdcDefaultCap, 0.9884),
          createGlvMarketConfig("DOT", arbitrum_btcUsdcDefaultCap, 0.98504),
          createGlvMarketConfig("ICP", arbitrum_btcUsdcDefaultCap, 1.0033),
          createGlvMarketConfig("FIL", arbitrum_btcUsdcDefaultCap, 0.98659),
          createGlvMarketConfig("INJ", arbitrum_btcUsdcDefaultCap, 1.0172),
          createGlvMarketConfig("DYDX", arbitrum_btcUsdcDefaultCap, 0.9837),
          createGlvMarketConfig("AI16Z", arbitrum_btcUsdcDefaultCap, 0.99831),
          createGlvMarketConfig("VIRTUAL", arbitrum_btcUsdcDefaultCap, 0.99346),
          createGlvMarketConfig("PENGU", arbitrum_btcUsdcDefaultCap, 0.97501),
          createGlvMarketConfig("S", arbitrum_btcUsdcDefaultCap, 1.1142),
          createGlvMarketConfig("CAKE", arbitrum_btcUsdcDefaultCap, 1.0369),
          createGlvMarketConfig("HYPE", arbitrum_btcUsdcDefaultCap, 2.3468),
          createGlvMarketConfig("JUP", arbitrum_btcUsdcDefaultCap, 0.98966),
          createGlvMarketConfig("OM", arbitrum_btcUsdcDefaultCap, 1.0372),
          createGlvMarketConfig("MOODENG", arbitrum_btcUsdcDefaultCap, 1),
          createGlvMarketConfig("XMR", arbitrum_btcUsdcDefaultCap, 1),
          createGlvMarketConfig("PI", arbitrum_btcUsdcDefaultCap, 1),
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
          createGlvMarketConfig("WAVAX", 1_800_000, 2.145),
          createGlvMarketConfig("XRP", 800_000, 1.5695),
          createGlvMarketConfig("DOGE", avalanche_avaxUsdcDefaultCap, 2.2393),
          createGlvMarketConfig("LTC", avalanche_avaxUsdcDefaultCap, 2.9631),
          createGlvMarketConfig("TRUMP", avalanche_avaxUsdcDefaultCap, 0.98854),
          createGlvMarketConfig("MELANIA", avalanche_avaxUsdcDefaultCap, 0.95133),
        ],
      },
    ],
    botanix: [],
    arbitrumSepolia: [
      {
        name: "GMX Liquidity Vault [WETH-USDC.SG]",
        symbol: "GLV [WETH-USDC.SG]",
        address: "0xAb3567e55c205c62B141967145F37b7695a9F854",
        longToken: "WETH",
        shortToken: "USDC.SG",
        shiftMaxPriceImpactFactor: percentageToFloat("0.025%"),
        shiftMinInterval: 300, // 5 minutes
        minTokensForFirstGlvDeposit: expandDecimals(1, 18),
        markets: [
          createGlvMarketConfig("WETH", 15_000_000, 1),
          createGlvMarketConfig("CRV", arbitrum_ethUsdcDefaultCap, 1.0),
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
            isMarketDisabled: true,
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
