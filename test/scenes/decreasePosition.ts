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

decreasePosition.long = async (fixture) => {
  const params = decreasePosition.getOrderParams.long();

  await handleOrder(fixture, {
    create: params,
  });
};

decreasePosition.short = async (fixture) => {
  const params = decreasePosition.getOrderParams.short();

  await handleOrder(fixture, {
    create: params,
  });
};

decreasePosition.long.positivePnl = async (fixture) => {
  const params = decreasePosition.getOrderParams.long();

  await handleOrder(fixture, {
    create: params,
    execute: getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased] }),
  });
};

decreasePosition.long.negativePnl = async (fixture) => {
  const params = decreasePosition.getOrderParams.long();

  await handleOrder(fixture, {
    create: params,
    execute: getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.decreased] }),
  });
};

decreasePosition.short.positivePnl = async (fixture) => {
  const params = decreasePosition.getOrderParams.short();

  await handleOrder(fixture, {
    create: params,
    execute: getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.decreased] }),
  });
};

decreasePosition.short.negativePnl = async (fixture) => {
  const params = decreasePosition.getOrderParams.short();

  await handleOrder(fixture, {
    create: params,
    execute: getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased] }),
  });
};
