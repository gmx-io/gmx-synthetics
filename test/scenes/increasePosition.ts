import { expandDecimals, decimalToFloat } from "../../utils/math";
import { OrderType, handleOrder } from "../../utils/order";
import { prices } from "../../utils/prices";
import { getExecuteParams } from "../../utils/exchange";

export const increasePosition = {};

increasePosition.getOrderParams = (fixture) => {
  const { user0 } = fixture.accounts;
  const { ethUsdMarket, usdc } = fixture.contracts;

  return {
    account: user0,
    market: ethUsdMarket,
    initialCollateralToken: usdc,
    initialCollateralDeltaAmount: expandDecimals(50_000, 6),
    swapPath: [],
    sizeDeltaUsd: decimalToFloat(200_000),
    acceptablePrice: expandDecimals(5200, 12),
    executionFee: expandDecimals(1, 15),
    minOutputAmount: 0,
    orderType: OrderType.MarketIncrease,
    isLong: true,
    shouldUnwrapNativeToken: false,
  };
};

increasePosition.getOrderParams.long = (fixture) => {
  return increasePosition.getOrderParams(fixture);
};

increasePosition.getOrderParams.short = (fixture) => {
  const { wnt } = fixture.contracts;

  return {
    ...increasePosition.getOrderParams(fixture),
    initialCollateralToken: wnt,
    initialCollateralDeltaAmount: expandDecimals(10, 18),
    acceptablePrice: expandDecimals(4800, 12),
    isLong: false,
  };
};

increasePosition.long = async (fixture, overrides = {}) => {
  const params = increasePosition.getOrderParams.long(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: overrides.execute,
  });
};

increasePosition.short = async (fixture, overrides = {}) => {
  const params = increasePosition.getOrderParams.short(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: overrides.execute,
  });
};

increasePosition.long.withSpread = async (fixture, overrides = {}) => {
  const params = increasePosition.getOrderParams.long(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.withSpread] }), ...overrides.execute },
  });
};

increasePosition.short.withSpread = async (fixture, overrides = {}) => {
  const params = increasePosition.getOrderParams.short(fixture);

  await handleOrder(fixture, {
    create: { ...params, ...overrides.create },
    execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.withSpread] }), ...overrides.execute },
  });
};
