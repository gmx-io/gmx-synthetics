import { HardhatRuntimeEnvironment } from "hardhat/types";

import { hashData } from "../utils/hash";

// https://docs.chain.link/data-feeds/price-feeds/addresses?network=avalanche

// synthetic token without corresponding token
// address will be generated in runtime in hardhat.config.ts
// should not be deployed
// should not be wrapped
type SyntheticTokenConfig = {
  address?: never;
  decimals: number;
  synthetic: true;
  wrapped?: never;
  deploy?: never;
};

type RealTokenConfig = {
  address: string;
  decimals: number;
  synthetic?: never;
  wrapped?: true;
  deploy?: never;
};

// test token to deploy in local and test networks
// automatically deployed in localhost and hardhat networks
// `deploy` should be set to `true` to deploy on live networks
export type TestTokenConfig = {
  address?: never;
  decimals: number;
  deploy?: true;
  wrapped?: boolean;
  synthetic?: never;
};

export type TokenConfig = SyntheticTokenConfig | RealTokenConfig | TestTokenConfig;
export type TokensConfig = { [tokenSymbol: string]: TokenConfig };

function getSyntheticTokenAddress(tokenSymbol: string) {
  return "0x" + hashData(["string"], [tokenSymbol]).substring(26);
}

const config: {
  [network: string]: TokensConfig;
} = {
  arbitrum: {
    WETH: {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      decimals: 18,
      wrapped: true,
    },
    WBTC: {
      address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      decimals: 8,
    },
    USDC: {
      address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      decimals: 6,
    },
  },
  avalanche: {
    WAVAX: {
      address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
      decimals: 18,
    },
  },
  avalancheFuji: {
    WAVAX: {
      address: "0x1D308089a2D1Ced3f1Ce36B1FcaF815b07217be3",
      wrapped: true,
      decimals: 18,
    },
    SOL: {
      synthetic: true,
      decimals: 18,
    },
    USDT: {
      decimals: 6,
      deploy: true,
    },
    WETH: {
      decimals: 18,
      deploy: true,
    },
  },
  // token addresses are retrieved in runtime for hardhat and localhost networks
  hardhat: {
    WETH: {
      wrapped: true,
      decimals: 18,
    },
    WBTC: {
      decimals: 8,
    },
    USDC: {
      decimals: 6,
    },
  },
  localhost: {
    WETH: {
      wrapped: true,
      decimals: 18,
    },
    WBTC: {
      decimals: 8,
    },
    USDC: {
      decimals: 6,
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
      token.address = getSyntheticTokenAddress(tokenSymbol);
    }
    if (!hre.network.live) {
      token.deploy = true;
    }
  }

  return tokens;
}
