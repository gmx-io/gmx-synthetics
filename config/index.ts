import tokensConfig, { TokensConfig } from "./tokens";
import marketsConfig, { MarketConfig } from "./markets";
import oracleConfig, { OracleConfig } from "./oracle";
import { hashData } from "../utils/hash";

function getSyntheticTokenAddress(tokenSymbol: string) {
  return "0x" + hashData(["string"], [tokenSymbol]).substring(26);
}

// extend hardhat config with custom gmx property
declare module "hardhat/types/runtime" {
  interface HardhatRuntimeEnvironment {
    gmx: {
      tokens: TokensConfig;
      markets?: MarketConfig[];
      oracle?: OracleConfig;
    };
  }
}

extendEnvironment((hre) => {
  // extend hre context with gmx domain data

  const networkName = hre.network.name;
  const tokens = tokensConfig[networkName] || {};
  for (const [tokenSymbol, token] of Object.entries(tokens as TokensConfig)) {
    if (token.synthetic) {
      token.address = getSyntheticTokenAddress(tokenSymbol);
    }
    if (!hre.network.live) {
      token.deploy = true;
    }
  }

  const oracle: OracleConfig = oracleConfig[networkName];
  if (oracle) {
    for (const tokenSymbol of Object.keys(oracle.priceFeeds)) {
      if (!tokens[tokenSymbol]) {
        throw new Error(`Missing token for ${tokenSymbol}`);
      }
    }
  }

  const markets = marketsConfig[networkName];
  if (markets) {
    for (const market of markets) {
      for (const tokenSymbol of market.tokens) {
        if (!tokens[tokenSymbol]) {
          throw new Error(`Market ${market.tokens.join(":")} uses token that does not exist: ${tokenSymbol}`);
        }
      }
    }
  }

  hre.gmx = {
    tokens,
    markets,
    oracle,
  };
});
