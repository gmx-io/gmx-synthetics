import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { percentageToFloat, expandDecimals, decimalToFloat } from "../utils/math";

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

export default async function ({ network }: HardhatRuntimeEnvironment) {
  const config: GlvConfig = {
    arbitrum: [
      {
        name: "GMX Liquidity Vault [WETH-USDC]",
        symbol: "GLV [WETH-USDC]",
        address: "0x528A5bac7E746C9A509A1f4F6dF58A03d44279F9",
        longToken: "WETH",
        shortToken: "USDC",
        shiftMaxPriceImpactFactor: percentageToFloat("0.05%"),
        shiftMinInterval: 60 * 60, // 1 hour
        minTokensForFirstGlvDeposit: expandDecimals(1, 18),
        markets: [
          {
            indexToken: "WETH",
            glvMaxMarketTokenBalanceAmount: expandDecimals(14_000_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(20_000_000),
          },
          {
            indexToken: "DOGE",
            glvMaxMarketTokenBalanceAmount: expandDecimals(2_100_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(3_500_000),
          },
          {
            indexToken: "LTC",
            glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(750_000),
          },
          {
            indexToken: "XRP",
            glvMaxMarketTokenBalanceAmount: expandDecimals(670_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(1_000_000),
          },
          {
            indexToken: "ATOM",
            glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          },
          {
            indexToken: "NEAR",
            glvMaxMarketTokenBalanceAmount: expandDecimals(1_500_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(1_500_000),
          },
          {
            indexToken: "SHIB",
            glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(575_000),
          },
          {
            indexToken: "EIGEN",
            glvMaxMarketTokenBalanceAmount: expandDecimals(546_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(600_000),
          },
          {
            indexToken: "UNI",
            glvMaxMarketTokenBalanceAmount: expandDecimals(550_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(900_000),
          },
          {
            indexToken: "AAVE",
            glvMaxMarketTokenBalanceAmount: expandDecimals(1_000_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(1_025_000),
          },
          {
            indexToken: "PEPE",
            glvMaxMarketTokenBalanceAmount: expandDecimals(935_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(1_000_000),
          },
          {
            indexToken: "POL",
            glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          },
          {
            indexToken: "SUI",
            glvMaxMarketTokenBalanceAmount: expandDecimals(1_214_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(1_250_000),
          },
          {
            indexToken: "SEI",
            glvMaxMarketTokenBalanceAmount: expandDecimals(577_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(600_000),
          },
          {
            indexToken: "APT",
            glvMaxMarketTokenBalanceAmount: expandDecimals(350_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(350_000),
          },
          {
            indexToken: "TIA",
            glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          },
          {
            indexToken: "TON",
            glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          },
          {
            indexToken: "TRX",
            glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          },
        ],
      },
      {
        name: "GMX Liquidity Vault [WBTC-USDC]",
        symbol: "GLV [WBTC-USDC]",
        address: "0xdF03EEd325b82bC1d4Db8b49c30ecc9E05104b96",
        longToken: "WBTC.e",
        shortToken: "USDC",
        shiftMaxPriceImpactFactor: percentageToFloat("0.05%"),
        shiftMinInterval: 60 * 60, // 1 hour
        minTokensForFirstGlvDeposit: expandDecimals(1, 18),
        markets: [
          {
            indexToken: "BTC",
            glvMaxMarketTokenBalanceAmount: expandDecimals(13_000_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(22_000_000),
          },
          {
            indexToken: "ORDI",
            glvMaxMarketTokenBalanceAmount: expandDecimals(600_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(600_000),
          },
          {
            indexToken: "STX",
            glvMaxMarketTokenBalanceAmount: expandDecimals(800_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(800_000),
          },
          {
            indexToken: "SATS",
            glvMaxMarketTokenBalanceAmount: expandDecimals(400_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(400_000),
          },
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
        shiftMaxPriceImpactFactor: percentageToFloat("0.05%"),
        shiftMinInterval: 60 * 60, // 1 hour
        minTokensForFirstGlvDeposit: expandDecimals(1, 18),
        markets: [
          {
            indexToken: "WAVAX",
            glvMaxMarketTokenBalanceAmount: expandDecimals(3_385_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(6_500_000),
          },
          {
            indexToken: "XRP",
            glvMaxMarketTokenBalanceAmount: expandDecimals(74_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(150_000),
          },
          {
            indexToken: "DOGE",
            glvMaxMarketTokenBalanceAmount: expandDecimals(80_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(170_000),
          },
          {
            indexToken: "LTC",
            glvMaxMarketTokenBalanceAmount: expandDecimals(46_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(125_000),
          },
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
