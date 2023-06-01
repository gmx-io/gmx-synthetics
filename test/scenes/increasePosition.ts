import { expandDecimals, decimalToFloat } from "../../utils/math";
import { OrderType, handleOrder } from "../../utils/order";

export const increasePosition = {};

increasePosition.getOrderParams = (fixture) => {
  const { user0 } = fixture.accounts;
  const { ethUsdMarket, wnt } = fixture.contracts;

  return {
    account: user0,
    market: ethUsdMarket,
    initialCollateralToken: wnt,
    initialCollateralDeltaAmount: expandDecimals(10, 18),
    swapPath: [],
    sizeDeltaUsd: decimalToFloat(200 * 1000),
    acceptablePrice: expandDecimals(5020, 12),
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
  const { usdc } = fixture.contracts;

  return {
    ...increasePosition.getOrderParams(fixture),
    initialCollateralToken: usdc,
    initialCollateralDeltaAmount: expandDecimals(50_000, 6),
    acceptablePrice: expandDecimals(4980, 12),
  };
};

increasePosition.long = async (fixture) => {
  const params = increasePosition.getOrderParams.long();

  await handleOrder(fixture, {
    create: params,
  });
};

increasePosition.short = async (fixture) => {
  const params = increasePosition.getOrderParams.short();

  await handleOrder(fixture, {
    create: params,
  });
};
