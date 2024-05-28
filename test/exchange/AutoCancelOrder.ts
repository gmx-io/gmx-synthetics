import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { getEventData } from "../../utils/event";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import {
  OrderType,
  getOrderCount,
  getAccountOrderCount,
  getOrderKeys,
  createOrder,
  handleOrder,
} from "../../utils/order";
import { getAccountPositionCount } from "../../utils/position";

describe("Exchange.AutoCancelOrder", () => {
  let fixture;
  let user0;
  let dataStore, ethUsdMarket, wnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, wnt } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });
  });

  it("auto cancels orders on position close", async () => {
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);

    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5001, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    expect(await getOrderCount(dataStore)).eq(0);

    await createOrder(fixture, {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: 0,
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(4800, 12),
      orderType: OrderType.StopLossDecrease,
      isLong: true,
      autoCancel: true,
    });

    expect(await getOrderCount(dataStore)).eq(1);
    expect(await getAccountOrderCount(dataStore, user0.address)).eq(1);

    const { key: orderKey } = await createOrder(fixture, {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: 0,
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(4800, 12),
      orderType: OrderType.StopLossDecrease,
      isLong: true,
      autoCancel: false,
    });

    expect(await getOrderCount(dataStore)).eq(2);
    expect(await getAccountOrderCount(dataStore, user0.address)).eq(2);

    await createOrder(fixture, {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: 0,
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(4800, 12),
      orderType: OrderType.StopLossDecrease,
      isLong: true,
      autoCancel: true,
    });

    expect(await getOrderCount(dataStore)).eq(3);
    expect(await getAccountOrderCount(dataStore, user0.address)).eq(3);

    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(150 * 1000),
        acceptablePrice: expandDecimals(4800, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
        gasUsageLabel: "orderHandler.createOrder",
      },
      execute: {
        gasUsageLabel: "orderHandler.executeOrder",
        afterExecution: ({ logs }) => {
          const orderExecutedEvent = getEventData(logs, "OrderExecuted");
          expect(orderExecutedEvent.secondaryOrderType).eq(0);
        },
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    expect(await getOrderCount(dataStore)).eq(3);
    expect(await getAccountOrderCount(dataStore, user0.address)).eq(3);

    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(50 * 1000),
        acceptablePrice: expandDecimals(4800, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
        gasUsageLabel: "orderHandler.createOrder",
      },
      execute: {
        gasUsageLabel: "orderHandler.executeOrder",
        afterExecution: ({ logs }) => {
          const orderExecutedEvent = getEventData(logs, "OrderExecuted");
          expect(orderExecutedEvent.secondaryOrderType).eq(0);
        },
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getOrderCount(dataStore)).eq(1);
    expect(await getAccountOrderCount(dataStore, user0.address)).eq(1);
    expect(await getOrderKeys(dataStore, 0, 10)).eql([orderKey]);
  });
});
