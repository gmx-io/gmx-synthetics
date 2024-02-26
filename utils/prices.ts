import fetch from "node-fetch";
import hre from "hardhat";
import { expandDecimals, bigNumberify } from "./math";

export async function fetchTickerPrices() {
  const tickersUrl = getTickersUrl();
  const tokenPricesResponse = await fetch(tickersUrl);
  const tokenPrices = await tokenPricesResponse.json();
  const pricesByTokenAddress = {};

  for (const tokenPrice of tokenPrices) {
    pricesByTokenAddress[tokenPrice.tokenAddress.toLowerCase()] = {
      min: bigNumberify(tokenPrice.minPrice),
      max: bigNumberify(tokenPrice.maxPrice),
    };
  }

  return pricesByTokenAddress;
}

export function getTickersUrl() {
  if (hre.network.name === "arbitrum") {
    return "https://arbitrum-api.gmxinfra.io/prices/tickers";
  }

  if (hre.network.name === "avalanche") {
    return "https://avalanche-api.gmxinfra.io/prices/tickers";
  }

  throw new Error("Unsupported network");
}

export const prices = {};

prices.wnt = {
  contractName: "wnt",
  precision: 8,
  min: expandDecimals(5000, 4),
  max: expandDecimals(5000, 4),
};

prices.wnt.withSpread = {
  contractName: "wnt",
  precision: 8,
  min: expandDecimals(4990, 4),
  max: expandDecimals(5010, 4),
};

prices.wnt.increased = {
  contractName: "wnt",
  precision: 8,
  min: expandDecimals(5020, 4),
  max: expandDecimals(5020, 4),
};

prices.wnt.increased.byFiftyPercent = {
  contractName: "wnt",
  precision: 8,
  min: expandDecimals(7500, 4),
  max: expandDecimals(7500, 4),
};

prices.wnt.increased.withSpread = {
  contractName: "wnt",
  precision: 8,
  min: expandDecimals(5010, 4),
  max: expandDecimals(5030, 4),
};

prices.wnt.decreased = {
  contractName: "wnt",
  precision: 8,
  min: expandDecimals(4980, 4),
  max: expandDecimals(4980, 4),
};

prices.wnt.decreased.withSpread = {
  contractName: "wnt",
  precision: 8,
  min: expandDecimals(4970, 4),
  max: expandDecimals(4990, 4),
};

prices.usdc = {
  contractName: "usdc",
  precision: 18,
  min: expandDecimals(1, 6),
  max: expandDecimals(1, 6),
};

prices.usdt = {
  contractName: "usdt",
  precision: 18,
  min: expandDecimals(1, 6),
  max: expandDecimals(1, 6),
};

prices.wbtc = {
  contractName: "wbtc",
  precision: 20,
  min: expandDecimals(50000, 2),
  max: expandDecimals(50000, 2),
};

prices.sol = {
  contractName: "sol",
  precision: 16,
  min: expandDecimals(50, 5),
  max: expandDecimals(50, 5),
};

prices.ethUsdMarket = {
  indexTokenPrice: {
    min: expandDecimals(5000, 12),
    max: expandDecimals(5000, 12),
  },
  longTokenPrice: {
    min: expandDecimals(5000, 12),
    max: expandDecimals(5000, 12),
  },
  shortTokenPrice: {
    min: expandDecimals(1, 24),
    max: expandDecimals(1, 24),
  },
};

prices.ethUsdSingleTokenMarket = {
  indexTokenPrice: {
    min: expandDecimals(5000, 12),
    max: expandDecimals(5000, 12),
  },
  longTokenPrice: {
    min: expandDecimals(1, 24),
    max: expandDecimals(1, 24),
  },
  shortTokenPrice: {
    min: expandDecimals(1, 24),
    max: expandDecimals(1, 24),
  },
};

prices.ethUsdSingleTokenMarket.increased = {};

prices.ethUsdSingleTokenMarket.increased.byFiftyPercent = {
  indexTokenPrice: {
    min: expandDecimals(7500, 12),
    max: expandDecimals(7500, 12),
  },
  longTokenPrice: {
    min: expandDecimals(1, 24),
    max: expandDecimals(1, 24),
  },
  shortTokenPrice: {
    min: expandDecimals(1, 24),
    max: expandDecimals(1, 24),
  },
};

prices.ethUsdMarket.withSpread = {
  indexTokenPrice: {
    min: expandDecimals(4990, 12),
    max: expandDecimals(5010, 12),
  },
  longTokenPrice: {
    min: expandDecimals(4990, 12),
    max: expandDecimals(5010, 12),
  },
  shortTokenPrice: {
    min: expandDecimals(1, 24),
    max: expandDecimals(1, 24),
  },
};

prices.ethUsdMarket.increased = {
  indexTokenPrice: {
    min: expandDecimals(5020, 12),
    max: expandDecimals(5020, 12),
  },
  longTokenPrice: {
    min: expandDecimals(5020, 12),
    max: expandDecimals(5020, 12),
  },
  shortTokenPrice: {
    min: expandDecimals(1, 24),
    max: expandDecimals(1, 24),
  },
};

prices.ethUsdMarket.decreased = {
  indexTokenPrice: {
    min: expandDecimals(4980, 12),
    max: expandDecimals(4980, 12),
  },
  longTokenPrice: {
    min: expandDecimals(4980, 12),
    max: expandDecimals(4980, 12),
  },
  shortTokenPrice: {
    min: expandDecimals(1, 24),
    max: expandDecimals(1, 24),
  },
};
