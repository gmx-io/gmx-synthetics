import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { OrderType, createOrder, getOrderKeys } from "../../utils/order";

describe("Guardian.UpdateOrder", () => {
  let fixture;
  let user0, user1;
  let reader, dataStore, ethUsdMarket, wnt, exchangeRouter;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1 } = fixture.accounts);
    ({ reader, dataStore, ethUsdMarket, wnt, exchangeRouter } = fixture.contracts);
  });

  it("Users can't update long limit increase orders they don't own", async () => {
    // User1 creates a limit increase order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(4800, 12),
      triggerPrice: expandDecimals(4700, 12),
      orderType: OrderType.LimitIncrease,
      isLong: true,
    });

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    // User0 tries to update the order user1 just created
    await expect(
      exchangeRouter
        .connect(user0)
        .updateOrder(
          orderKeys[0],
          decimalToFloat(10_000),
          expandDecimals(5200, 12),
          expandDecimals(5200, 12),
          expandDecimals(52000, 6)
        )
    )
      .to.be.revertedWithCustomError(exchangeRouter, "Unauthorized")
      .withArgs(user0.address, "account for updateOrder");

    const order = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order haven't changed
    expect(order.numbers.acceptablePrice).eq(expandDecimals(4800, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(4700, 12));
  });

  it("Users can't update short limit increase orders they don't own", async () => {
    // User1 creates a limit increase order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(4800, 12),
      triggerPrice: expandDecimals(4700, 12),
      orderType: OrderType.LimitIncrease,
      isLong: false,
    });

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    // User0 tries to update the order user1 just created
    await expect(
      exchangeRouter
        .connect(user0)
        .updateOrder(
          orderKeys[0],
          decimalToFloat(10_000),
          expandDecimals(5200, 12),
          expandDecimals(5200, 12),
          expandDecimals(52000, 6)
        )
    )
      .to.be.revertedWithCustomError(exchangeRouter, "Unauthorized")
      .withArgs(user0.address, "account for updateOrder");

    const order = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order haven't changed
    expect(order.numbers.acceptablePrice).eq(expandDecimals(4800, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(4700, 12));
  });

  it("Users can't update long limit decrease orders they don't own", async () => {
    // User1 creates a limit decrease order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(4800, 12),
      triggerPrice: expandDecimals(4700, 12),
      orderType: OrderType.LimitDecrease,
      isLong: true,
    });

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    // User0 tries to update the order user1 just created
    await expect(
      exchangeRouter
        .connect(user0)
        .updateOrder(
          orderKeys[0],
          decimalToFloat(10_000),
          expandDecimals(5200, 12),
          expandDecimals(5200, 12),
          expandDecimals(52000, 6)
        )
    )
      .to.be.revertedWithCustomError(exchangeRouter, "Unauthorized")
      .withArgs(user0.address, "account for updateOrder");

    const order = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order haven't changed
    expect(order.numbers.acceptablePrice).eq(expandDecimals(4800, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(4700, 12));
  });

  it("Users can't update short limit decrease orders they don't own", async () => {
    // User1 creates a limit decrease order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(4800, 12),
      triggerPrice: expandDecimals(4700, 12),
      orderType: OrderType.LimitDecrease,
      isLong: false,
    });

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    // User0 tries to update the order user1 just created
    await expect(
      exchangeRouter
        .connect(user0)
        .updateOrder(
          orderKeys[0],
          decimalToFloat(10_000),
          expandDecimals(5200, 12),
          expandDecimals(5200, 12),
          expandDecimals(52000, 6)
        )
    )
      .to.be.revertedWithCustomError(exchangeRouter, "Unauthorized")
      .withArgs(user0.address, "account for updateOrder");

    const order = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order haven't changed
    expect(order.numbers.acceptablePrice).eq(expandDecimals(4800, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(4700, 12));
  });

  it("Users can't update long stop loss decrease orders they don't own", async () => {
    // User1 creates a stop loss decrease order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(4800, 12),
      triggerPrice: expandDecimals(4700, 12),
      orderType: OrderType.StopLossDecrease,
      isLong: true,
    });

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    // User0 tries to update the order user1 just created
    await expect(
      exchangeRouter
        .connect(user0)
        .updateOrder(
          orderKeys[0],
          decimalToFloat(10_000),
          expandDecimals(5200, 12),
          expandDecimals(5200, 12),
          expandDecimals(52000, 6)
        )
    )
      .to.be.revertedWithCustomError(exchangeRouter, "Unauthorized")
      .withArgs(user0.address, "account for updateOrder");

    const order = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order haven't changed
    expect(order.numbers.acceptablePrice).eq(expandDecimals(4800, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(4700, 12));
  });

  it("Users can't update short stop loss decrease orders they don't own", async () => {
    // User1 creates a stop loss decrease order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(4800, 12),
      triggerPrice: expandDecimals(4700, 12),
      orderType: OrderType.StopLossDecrease,
      isLong: false,
    });

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    // User0 tries to update the order user1 just created
    await expect(
      exchangeRouter
        .connect(user0)
        .updateOrder(
          orderKeys[0],
          decimalToFloat(10_000),
          expandDecimals(5200, 12),
          expandDecimals(5200, 12),
          expandDecimals(52000, 6)
        )
    )
      .to.be.revertedWithCustomError(exchangeRouter, "Unauthorized")
      .withArgs(user0.address, "account for updateOrder");

    const order = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order haven't changed
    expect(order.numbers.acceptablePrice).eq(expandDecimals(4800, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(4700, 12));
  });

  it("Update long limit increase orders", async () => {
    // User1 creates a limit increase order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(4800, 12),
      triggerPrice: expandDecimals(4700, 12),
      orderType: OrderType.LimitIncrease,
      isLong: true,
    });

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    // User1 update the order to be filled at a different price points
    await exchangeRouter.connect(user1).updateOrder(
      orderKeys[0],
      decimalToFloat(10_000), // sizeDeltaUsd
      expandDecimals(5200, 12), // acceptablePrice
      expandDecimals(5200, 12), // triggerPrice
      expandDecimals(52000, 6) // minOutputAmount
    );

    const order = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order is updated
    expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(10_000));
    expect(order.numbers.acceptablePrice).eq(expandDecimals(5200, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(5200, 12));
    expect(order.numbers.minOutputAmount).eq(expandDecimals(52000, 6));
  });

  it("Update short limit increase orders", async () => {
    // User1 creates a limit increase order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(4800, 12),
      triggerPrice: expandDecimals(4700, 12),
      orderType: OrderType.LimitIncrease,
      isLong: true,
    });

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    // User1 update the order to be filled at a different price points
    await exchangeRouter.connect(user1).updateOrder(
      orderKeys[0],
      decimalToFloat(10_000), // sizeDeltaUsd
      expandDecimals(5200, 12), // acceptablePrice
      expandDecimals(5200, 12), // triggerPrice
      expandDecimals(52000, 6) // minOutputAmount
    );

    const order = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order is updated
    expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(10_000));
    expect(order.numbers.acceptablePrice).eq(expandDecimals(5200, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(5200, 12));
    expect(order.numbers.minOutputAmount).eq(expandDecimals(52000, 6));
  });

  it("Update long limit decrease orders", async () => {
    // User1 creates a limit decrease order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(4800, 12),
      triggerPrice: expandDecimals(4700, 12),
      orderType: OrderType.LimitDecrease,
      isLong: true,
    });

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    // User1 update the order to be filled at a different price points
    await exchangeRouter.connect(user1).updateOrder(
      orderKeys[0],
      decimalToFloat(10_000), // sizeDeltaUsd
      expandDecimals(5200, 12), // acceptablePrice
      expandDecimals(5200, 12), // triggerPrice
      expandDecimals(52000, 6) // minOutputAmount
    );

    const order = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order is updated
    expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(10_000));
    expect(order.numbers.acceptablePrice).eq(expandDecimals(5200, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(5200, 12));
    expect(order.numbers.minOutputAmount).eq(expandDecimals(52000, 6));
  });

  it("Update short limit decrease orders", async () => {
    // User1 creates a limit decrease order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(4800, 12),
      triggerPrice: expandDecimals(4700, 12),
      orderType: OrderType.LimitDecrease,
      isLong: true,
    });

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    // User1 update the order to be filled at a different price points
    await exchangeRouter.connect(user1).updateOrder(
      orderKeys[0],
      decimalToFloat(10_000), // sizeDeltaUsd
      expandDecimals(5200, 12), // acceptablePrice
      expandDecimals(5200, 12), // triggerPrice
      expandDecimals(52000, 6) // minOutputAmount
    );

    const order = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order is updated
    expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(10_000));
    expect(order.numbers.acceptablePrice).eq(expandDecimals(5200, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(5200, 12));
    expect(order.numbers.minOutputAmount).eq(expandDecimals(52000, 6));
  });

  it("Update long stop loss decrease orders", async () => {
    // User1 creates a stop loss decrease order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(4800, 12),
      triggerPrice: expandDecimals(4700, 12),
      orderType: OrderType.StopLossDecrease,
      isLong: true,
    });

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    // User1 update the order to be filled at a different price points
    await exchangeRouter.connect(user1).updateOrder(
      orderKeys[0],
      decimalToFloat(10_000), // sizeDeltaUsd
      expandDecimals(5200, 12), // acceptablePrice
      expandDecimals(5200, 12), // triggerPrice
      expandDecimals(52000, 6) // minOutputAmount
    );

    const order = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order is updated
    expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(10_000));
    expect(order.numbers.acceptablePrice).eq(expandDecimals(5200, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(5200, 12));
    expect(order.numbers.minOutputAmount).eq(expandDecimals(52000, 6));
  });

  it("Update short stop loss decrease orders", async () => {
    // User1 creates a stop loss decrease order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(4800, 12),
      triggerPrice: expandDecimals(4700, 12),
      orderType: OrderType.StopLossDecrease,
      isLong: true,
    });

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    // User1 update the order to be filled at a different price points
    await exchangeRouter.connect(user1).updateOrder(
      orderKeys[0],
      decimalToFloat(10_000), // sizeDeltaUsd
      expandDecimals(5200, 12), // acceptablePrice
      expandDecimals(5200, 12), // triggerPrice
      expandDecimals(52000, 6) // minOutputAmount
    );

    const order = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order is updated
    expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(10_000));
    expect(order.numbers.acceptablePrice).eq(expandDecimals(5200, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(5200, 12));
    expect(order.numbers.minOutputAmount).eq(expandDecimals(52000, 6));
  });
});
