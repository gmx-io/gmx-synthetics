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
import * as keys from "../../utils/keys";
import { errorsContract } from "../../utils/error";

describe("Exchange.AutoCancelOrder", () => {
  let fixture;
  let user0;
  let dataStore, exchangeRouter, reader, ethUsdMarket, wnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ dataStore, exchangeRouter, reader, ethUsdMarket, wnt } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });
  });

  it("MaxAutoCancelOrdersExceeded", async () => {
    await dataStore.setUint(keys.MAX_AUTO_CANCEL_ORDERS, 2);

    const _createOrder = () =>
      createOrder(fixture, {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(4800, 12),
        orderType: OrderType.StopLossDecrease,
        isLong: true,
        autoCancel: true,
      });

    await _createOrder();
    await _createOrder();

    let orderKeys = await getOrderKeys(dataStore, 0, 10);
    const order = await reader.getOrder(dataStore.address, orderKeys[0]);
    expect(orderKeys.length).eq(2);

    // there was a bug that caused order updates to fail with MaxAutoCancelOrdersExceeded
    // if amount of auto cancel orders was at max (not exceeded)
    await exchangeRouter
      .connect(user0)
      .updateOrder(
        orderKeys[0],
        order.numbers.sizeDeltaUsd,
        order.numbers.acceptablePrice,
        order.numbers.triggerPrice,
        order.numbers.minOutputAmount,
        order.numbers.validFromTime,
        order.flags.autoCancel
      );

    // expect revert
    await expect(_createOrder()).to.be.revertedWithCustomError(errorsContract, "MaxAutoCancelOrdersExceeded");
    expect(orderKeys.length).eq(2);

    await dataStore.setUint(keys.MAX_AUTO_CANCEL_ORDERS, 3);
    await _createOrder();
    orderKeys = await getOrderKeys(dataStore, 0, 10);
    expect(orderKeys.length).eq(3);
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
