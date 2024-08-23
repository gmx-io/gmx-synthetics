import { BigNumberish } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { percentageToFloat, expandDecimals } from "../utils/math";

type GlvConfig = {
  longToken: string;
  shortToken: string;
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
        symbol: "GLV",
        longToken: "WETH",
        shortToken: "USDC",
        shiftMaxPriceImpactFactor: percentageToFloat("2%"),
        shiftMinInterval: 300, // 5 minutes
        minTokensForFirstGlvDeposit: expandDecimals(2, 18),
        markets: [
          // https://testnet.snowtrace.io/tx/0xfbd56d504b30ab188c4805d3db4c326a466168f4d40d9e4293fa5d2ee46db283?chainid=43113
          {
            indexToken: "WETH",
            glvMaxMarketTokenBalanceAmount: expandDecimals(10_000, 18),
            glvMaxMarketTokenBalanceUsd: expandDecimals(10_000, 30),
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
