import { expandDecimals } from "./math";

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
