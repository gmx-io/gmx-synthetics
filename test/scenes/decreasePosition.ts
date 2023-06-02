import { expandDecimals } from "../../utils/math";
import { OrderType, handleOrder } from "../../utils/order";
import { prices } from "../../utils/prices";
import { getExecuteParams } from "../../utils/exchange";
import { increasePosition } from "./increasePosition";

export const decreasePosition = {};

decreasePosition.getOrderParams = (fixture) => {
  const { user0 } = fixture.accounts;
  const { ethUsdMarket, wnt } = fixture.contracts;

  const increasePositionParams = increasePosition.getOrderParams.long();

  return {
    account: user0,
    market: ethUsdMarket,
    initialCollateralToken: wnt,
    initialCollateralDeltaAmount: increasePositionParams.initialCollateralDeltaAmount.div(10),
    swapPath: [],
    sizeDeltaUsd: increasePositionParams.sizeDeltaUsd.div(10),
    acceptablePrice: expandDecimals(4980, 12),
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
  const { usdc } = fixture.contracts;
  const increasePositionParams = increasePosition.getOrderParams.long();

  return {
    ...decreasePosition.getOrderParams(fixture),
    initialCollateralToken: usdc,
    initialCollateralDeltaAmount: increasePositionParams.initialCollateralDeltaAmount.div(10),
    sizeDeltaUsd: increasePositionParams.sizeDeltaUsd.div(10),
    acceptablePrice: expandDecimals(5020, 12),
  };
};

decreasePosition.long = async (fixture, overrides) => {
  const params = decreasePosition.getOrderParams.long();

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: overrides.execute,
  });
};

decreasePosition.short = async (fixture, overrides) => {
  const params = decreasePosition.getOrderParams.short();

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: overrides.execute,
  });
};

decreasePosition.long.withSpread = async (fixture, overrides) => {
  const params = decreasePosition.getOrderParams.long();

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.withSpread] }), ...overrides.execute },
  });
};

decreasePosition.short.withSpread = async (fixture, overrides) => {
  const params = decreasePosition.getOrderParams.short();

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.withSpread] }), ...overrides.execute },
  });
};

decreasePosition.long.positivePnl = async (fixture, overrides) => {
  const params = decreasePosition.getOrderParams.long();

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased] }), ...overrides.execute },
  });
};

decreasePosition.long.negativePnl = async (fixture, overrides) => {
  const params = decreasePosition.getOrderParams.long();

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.decreased] }), ...overrides.execute },
  });
};

decreasePosition.short.positivePnl = async (fixture, overrides) => {
  const params = decreasePosition.getOrderParams.short();

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.decreased] }), ...overrides.execute },
  });
};

decreasePosition.short.negativePnl = async (fixture, overrides) => {
  const params = decreasePosition.getOrderParams.short();

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased] }), ...overrides.execute },
  });
};

decreasePosition.long.positivePnl.withSpread = async (fixture, overrides) => {
  const params = decreasePosition.getOrderParams.long();

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: {
      ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased.withSpread] }),
      ...overrides.execute,
    },
  });
};

decreasePosition.long.negativePnl.withSpread = async (fixture, overrides) => {
  const params = decreasePosition.getOrderParams.long();

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: {
      ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.decreased.withSpread] }),
      ...overrides.execute,
    },
  });
};

decreasePosition.short.positivePnl.withSpread = async (fixture, overrides) => {
  const params = decreasePosition.getOrderParams.short();

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: {
      ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.decreased.withSpread] }),
      ...overrides.execute,
    },
  });
};

decreasePosition.short.negativePnl.withSpread = async (fixture, overrides) => {
  const params = decreasePosition.getOrderParams.short();

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: {
      ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased.withSpread] }),
      ...overrides.execute,
    },
  });
};
