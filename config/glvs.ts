import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { percentageToFloat, expandDecimals } from "../utils/math";

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
    arbitrum: [] as any,
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
