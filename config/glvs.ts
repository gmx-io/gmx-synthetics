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
    isMarketDisabled: false,
  };
}

export default async function ({ network }: HardhatRuntimeEnvironment) {
  const arbitrum_ethUsdcDefaultCap = 6_000_000; // 20% of 30M
  const arbitrum_btcUsdcDefaultCap = 4_000_000; // 20% of 20M
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
          createGlvMarketConfig("WETH", 35_000_000, 1.98),
          createGlvMarketConfig("XRP", 10_000_000, 1.94),
          createGlvMarketConfig("SUI", 7_500_000, 1.52),
          createGlvMarketConfig("DOGE", 7_500_000, 2.54),
          createGlvMarketConfig("LTC", 7_500_000, 2.13),
          createGlvMarketConfig("BERA", arbitrum_ethUsdcDefaultCap, 1.22),
          createGlvMarketConfig("TRUMP", arbitrum_ethUsdcDefaultCap, 1.41),
          createGlvMarketConfig("RENDER", arbitrum_ethUsdcDefaultCap, 1.24),
          createGlvMarketConfig("MELANIA", arbitrum_ethUsdcDefaultCap, 1.21),
          createGlvMarketConfig("ATOM", arbitrum_ethUsdcDefaultCap, 1.69),
          createGlvMarketConfig("NEAR", arbitrum_ethUsdcDefaultCap, 1.6),
          createGlvMarketConfig("SHIB", arbitrum_ethUsdcDefaultCap, 1.51),
          createGlvMarketConfig("EIGEN", arbitrum_ethUsdcDefaultCap, 1.75),
          createGlvMarketConfig("UNI", arbitrum_ethUsdcDefaultCap, 1.28),
          createGlvMarketConfig("POL", arbitrum_ethUsdcDefaultCap, 1.36),
          createGlvMarketConfig("SEI", arbitrum_ethUsdcDefaultCap, 1.33),
          createGlvMarketConfig("APT", arbitrum_ethUsdcDefaultCap, 1.36),
          createGlvMarketConfig("TIA", arbitrum_ethUsdcDefaultCap, 1.36),
          createGlvMarketConfig("TON", arbitrum_ethUsdcDefaultCap, 1.47),
          createGlvMarketConfig("TRX", arbitrum_ethUsdcDefaultCap, 1.34),
          createGlvMarketConfig("BONK", arbitrum_ethUsdcDefaultCap, 1.56),
          createGlvMarketConfig("WLD", arbitrum_ethUsdcDefaultCap, 1.23),
          createGlvMarketConfig("ENA", arbitrum_ethUsdcDefaultCap, 1.15),
          createGlvMarketConfig("LDO", arbitrum_ethUsdcDefaultCap, 1.25),
          createGlvMarketConfig("ONDO", arbitrum_ethUsdcDefaultCap, 1.32),
          createGlvMarketConfig("FET", arbitrum_ethUsdcDefaultCap, 1.35),
          createGlvMarketConfig("AIXBT", arbitrum_ethUsdcDefaultCap, 1.45),
          createGlvMarketConfig("MKR", arbitrum_ethUsdcDefaultCap, 1.51),
          createGlvMarketConfig("DOLO", arbitrum_ethUsdcDefaultCap, 1.25),
          createGlvMarketConfig("ZRO", arbitrum_ethUsdcDefaultCap, 1.54),
          createGlvMarketConfig("CRV", arbitrum_ethUsdcDefaultCap, 1.23),
          createGlvMarketConfig("MNT", arbitrum_ethUsdcDefaultCap, 1.02),
          createGlvMarketConfig("SPX6900", arbitrum_ethUsdcDefaultCap, 1.02),
          createGlvMarketConfig("CVX", arbitrum_ethUsdcDefaultCap, 1),
          createGlvMarketConfig("OKB", arbitrum_ethUsdcDefaultCap, 1),
          createGlvMarketConfig("PEPE", arbitrum_ethUsdcDefaultCap, 1),
          createGlvMarketConfig("AAVE", arbitrum_ethUsdcDefaultCap, 1),
          createGlvMarketConfig("AERO", arbitrum_ethUsdcDefaultCap, 1),
          createGlvMarketConfig("BRETT", arbitrum_ethUsdcDefaultCap, 1),
          createGlvMarketConfig("WLFI", arbitrum_ethUsdcDefaultCap, 1),
          createGlvMarketConfig("WELL", arbitrum_ethUsdcDefaultCap, 1),
          createGlvMarketConfig("VVV", arbitrum_ethUsdcDefaultCap, 1),
          createGlvMarketConfig("MORPHO", arbitrum_ethUsdcDefaultCap, 1),
          createGlvMarketConfig("LINK", arbitrum_ethUsdcDefaultCap, 1),
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
          createGlvMarketConfig("BTC", 30_000_000, 2.7),
          createGlvMarketConfig("FARTCOIN", 4_300_000, 1.4),
          createGlvMarketConfig("ORDI", arbitrum_btcUsdcDefaultCap, 1.47),
          createGlvMarketConfig("STX", arbitrum_btcUsdcDefaultCap, 1.55),
          createGlvMarketConfig("SATS", arbitrum_btcUsdcDefaultCap, 1.61),
          createGlvMarketConfig("TAO", arbitrum_btcUsdcDefaultCap, 1.42),
          createGlvMarketConfig("BOME", arbitrum_btcUsdcDefaultCap, 1.3),
          createGlvMarketConfig("MEME", arbitrum_btcUsdcDefaultCap, 1.22),
          createGlvMarketConfig("FLOKI", arbitrum_btcUsdcDefaultCap, 1.13),
          createGlvMarketConfig("MEW", arbitrum_btcUsdcDefaultCap, 1.18),
          createGlvMarketConfig("ADA", arbitrum_btcUsdcDefaultCap, 1.07),
          createGlvMarketConfig("XLM", arbitrum_btcUsdcDefaultCap, 1.07),
          createGlvMarketConfig("BCH", arbitrum_btcUsdcDefaultCap, 1.11),
          createGlvMarketConfig("DOT", arbitrum_btcUsdcDefaultCap, 1.15),
          createGlvMarketConfig("ICP", arbitrum_btcUsdcDefaultCap, 1.15),
          createGlvMarketConfig("FIL", arbitrum_btcUsdcDefaultCap, 1.12),
          createGlvMarketConfig("INJ", arbitrum_btcUsdcDefaultCap, 1.19),
          createGlvMarketConfig("DYDX", arbitrum_btcUsdcDefaultCap, 1.1),
          createGlvMarketConfig("AI16Z", arbitrum_btcUsdcDefaultCap, 1.26),
          createGlvMarketConfig("VIRTUAL", arbitrum_btcUsdcDefaultCap, 1.1),
          createGlvMarketConfig("PENGU", arbitrum_btcUsdcDefaultCap, 1.04),
          createGlvMarketConfig("S", arbitrum_btcUsdcDefaultCap, 1.27),
          createGlvMarketConfig("CAKE", arbitrum_btcUsdcDefaultCap, 1.14),
          createGlvMarketConfig("HYPE", arbitrum_btcUsdcDefaultCap, 2.63),
          createGlvMarketConfig("JUP", arbitrum_btcUsdcDefaultCap, 1.1),
          createGlvMarketConfig("OM", arbitrum_btcUsdcDefaultCap, 1.21),
          createGlvMarketConfig("MOODENG", arbitrum_btcUsdcDefaultCap, 1),
          createGlvMarketConfig("XMR", arbitrum_btcUsdcDefaultCap, 1.06),
          createGlvMarketConfig("PI", arbitrum_btcUsdcDefaultCap, 1.07),
          createGlvMarketConfig("PUMP", arbitrum_btcUsdcDefaultCap, 1.05),
          createGlvMarketConfig("ALGO", arbitrum_btcUsdcDefaultCap, 1),
          createGlvMarketConfig("HBAR", arbitrum_btcUsdcDefaultCap, 1),
          createGlvMarketConfig("CRO", arbitrum_btcUsdcDefaultCap, 1),
          createGlvMarketConfig("KAS", arbitrum_btcUsdcDefaultCap, 1),
          createGlvMarketConfig("WIF", arbitrum_btcUsdcDefaultCap, 1),
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
          createGlvMarketConfig("WAVAX", 1_800_000, 2.37),
          createGlvMarketConfig("XRP", 800_000, 1.63),
          createGlvMarketConfig("DOGE", avalanche_avaxUsdcDefaultCap, 2.69),
          createGlvMarketConfig("LTC", avalanche_avaxUsdcDefaultCap, 3.25),
          createGlvMarketConfig("TRUMP", avalanche_avaxUsdcDefaultCap, 1.06),
          createGlvMarketConfig("MELANIA", avalanche_avaxUsdcDefaultCap, 1.03),
          createGlvMarketConfig("PUMP", avalanche_avaxUsdcDefaultCap, 1),
          createGlvMarketConfig("WLFI", avalanche_avaxUsdcDefaultCap, 1),
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
