import { expandDecimals } from "../../utils/math";
import { OrderType, handleOrder } from "../../utils/order";
import { prices } from "../../utils/prices";
import { getExecuteParams } from "../../utils/exchange";
import { increasePosition } from "./increasePosition";

export const decreasePosition = {};

decreasePosition.getOrderParams = (fixture) => {
  const { user0 } = fixture.accounts;
  const { ethUsdMarket } = fixture.contracts;

  const increasePositionParams = increasePosition.getOrderParams.long(fixture);

  return {
    account: user0,
    market: ethUsdMarket,
    initialCollateralToken: increasePositionParams.initialCollateralToken,
    initialCollateralDeltaAmount: increasePositionParams.initialCollateralDeltaAmount.div(10),
    swapPath: [],
    sizeDeltaUsd: increasePositionParams.sizeDeltaUsd.div(10),
    acceptablePrice: expandDecimals(4800, 12),
    executionFee: expandDecimals(1, 15),
    minOutputAmount: 0,
    orderType: OrderType.MarketDecrease,
    isLong: true,
    shouldUnwrapNativeToken: false,
  };
};

decreasePosition.getOrderParams.long = (fixture) => {
  return decreasePosition.getOrderParams(fixture);
};

decreasePosition.getOrderParams.short = (fixture) => {
  const increasePositionParams = increasePosition.getOrderParams.short(fixture);

  return {
    ...decreasePosition.getOrderParams(fixture),
    initialCollateralToken: increasePositionParams.initialCollateralToken,
    initialCollateralDeltaAmount: increasePositionParams.initialCollateralDeltaAmount.div(10),
    sizeDeltaUsd: increasePositionParams.sizeDeltaUsd.div(10),
    acceptablePrice: expandDecimals(5200, 12),
    isLong: false,
  };
};

decreasePosition.long = async (fixture, overrides = {}) => {
  const params = decreasePosition.getOrderParams.long(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: overrides.execute,
  });
};

decreasePosition.short = async (fixture, overrides = {}) => {
  const params = decreasePosition.getOrderParams.short(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: overrides.execute,
  });
};

decreasePosition.long.withSpread = async (fixture, overrides = {}) => {
  const params = decreasePosition.getOrderParams.long(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.withSpread] }), ...overrides.execute },
  });
};

decreasePosition.short.withSpread = async (fixture, overrides = {}) => {
  const params = decreasePosition.getOrderParams.short(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.withSpread] }), ...overrides.execute },
  });
};

decreasePosition.long.positivePnl = async (fixture, overrides = {}) => {
  const params = decreasePosition.getOrderParams.long(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased] }), ...overrides.execute },
  });
};

decreasePosition.long.negativePnl = async (fixture, overrides = {}) => {
  const params = decreasePosition.getOrderParams.long(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.decreased] }), ...overrides.execute },
  });
};

decreasePosition.short.positivePnl = async (fixture, overrides = {}) => {
  const params = decreasePosition.getOrderParams.short(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.decreased] }), ...overrides.execute },
  });
};

decreasePosition.short.negativePnl = async (fixture, overrides = {}) => {
  const params = decreasePosition.getOrderParams.short(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased] }), ...overrides.execute },
  });
};

decreasePosition.long.positivePnl.withSpread = async (fixture, overrides = {}) => {
  const params = decreasePosition.getOrderParams.long(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: {
      ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased.withSpread] }),
      ...overrides.execute,
    },
  });
};

decreasePosition.long.negativePnl.withSpread = async (fixture, overrides = {}) => {
  const params = decreasePosition.getOrderParams.long(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: {
      ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.decreased.withSpread] }),
      ...overrides.execute,
    },
  });
};

decreasePosition.short.positivePnl.withSpread = async (fixture, overrides = {}) => {
  const params = decreasePosition.getOrderParams.short(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: {
      ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.decreased.withSpread] }),
      ...overrides.execute,
    },
  });
};

decreasePosition.short.negativePnl.withSpread = async (fixture, overrides = {}) => {
  const params = decreasePosition.getOrderParams.short(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: {
      ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased.withSpread] }),
      ...overrides.execute,
    },
  });
};
