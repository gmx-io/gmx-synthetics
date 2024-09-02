import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { percentageToFloat, expandDecimals, decimalToFloat } from "../utils/math";

type GlvConfig = {
  longToken: string;
  shortToken: string;
  // address is required for updateGlvConfig script
  address?: string;
  type: string;
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
        symbol: "GLV",
        longToken: "WETH",
        shortToken: "USDC",
        shiftMaxPriceImpactFactor: percentageToFloat("0.1%"),
        shiftMinInterval: 60 * 60, // 1 hour
        minTokensForFirstGlvDeposit: expandDecimals(1, 18),
        markets: [
          {
            indexToken: "WETH",
            glvMaxMarketTokenBalanceAmount: expandDecimals(7_000_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(10_000_000),
          },
          {
            indexToken: "DOGE",
            glvMaxMarketTokenBalanceAmount: expandDecimals(1_300_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(2_000_000),
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
            glvMaxMarketTokenBalanceAmount: expandDecimals(1_000_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(1_000_000),
          },
          {
            indexToken: "SHIB",
            glvMaxMarketTokenBalanceAmount: expandDecimals(500_000, 18),
            glvMaxMarketTokenBalanceUsd: decimalToFloat(500_000),
          },
        ],
      },
    ],
    avalanche: [] as any,
    avalancheFuji: [
      {
        name: "GMX Liquidity Vault [WETH-USDC]",
        address: "0xc519a5b8e5e93D3ec85D62231C1681c44952689d",
        symbol: "GLV",
        longToken: "WETH",
        shortToken: "USDC",
        shiftMaxPriceImpactFactor: percentageToFloat("2%"),
        shiftMinInterval: 300, // 5 minutes
        minTokensForFirstGlvDeposit: expandDecimals(2, 18),
        markets: [
          {
            indexToken: "WETH",
            glvMaxMarketTokenBalanceAmount: expandDecimals(10_000, 18),
            glvMaxMarketTokenBalanceUsd: expandDecimals(10_000, 30),
          },
          {
            indexToken: "DOT",
            glvMaxMarketTokenBalanceAmount: expandDecimals(5_000, 18),
            glvMaxMarketTokenBalanceUsd: expandDecimals(5_000, 30),
          },
          {
            indexToken: "TEST",
            glvMaxMarketTokenBalanceAmount: expandDecimals(5_000, 18),
            glvMaxMarketTokenBalanceUsd: expandDecimals(5_000, 30),
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
