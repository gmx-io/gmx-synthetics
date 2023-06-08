import { expandDecimals } from "./math";

export const prices = {};

prices.wnt = {
  contractName: "wnt",
  precision: 8,
  minPrice: expandDecimals(5000, 4),
  maxPrice: expandDecimals(5000, 4),
};

prices.wnt.withSpread = {
  contractName: "wnt",
  precision: 8,
  minPrice: expandDecimals(4990, 4),
  maxPrice: expandDecimals(5010, 4),
};

prices.wnt.increased = {
  contractName: "wnt",
  precision: 8,
  minPrice: expandDecimals(5020, 4),
  maxPrice: expandDecimals(5020, 4),
};

prices.wnt.increased.withSpread = {
  contractName: "wnt",
  precision: 8,
  minPrice: expandDecimals(5010, 4),
  maxPrice: expandDecimals(5030, 4),
};

prices.wnt.decreased = {
  contractName: "wnt",
  precision: 8,
  minPrice: expandDecimals(4980, 4),
  maxPrice: expandDecimals(4980, 4),
};

prices.wnt.decreased.withSpread = {
  contractName: "wnt",
  precision: 8,
  minPrice: expandDecimals(4970, 4),
  maxPrice: expandDecimals(4990, 4),
};

prices.usdc = {
  contractName: "usdc",
  precision: 18,
  minPrice: expandDecimals(1, 6),
  maxPrice: expandDecimals(1, 6),
};

prices.wbtc = {
  contractName: "wbtc",
  precision: 20,
  minPrice: expandDecimals(50000, 2),
  maxPrice: expandDecimals(50000, 2),
};

prices.ethUsdMarket = {};
