import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { OrderType, createOrder, getOrderKeys, getOrderCount } from "../../utils/order";

describe("Guardian.CancelOrder", () => {
  const { provider } = ethers;

  let fixture;
  let user0, user1;
  let dataStore, ethUsdMarket, wnt, exchangeRouter;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, wnt, exchangeRouter } = fixture.contracts);
  });

  it("Users can't cancel long limit increase orders they don't own", async () => {
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

    // User0 tries to cancel the order user1 just created
    await expect(exchangeRouter.connect(user0).cancelOrder(orderKeys[0]))
      .to.be.revertedWithCustomError(exchangeRouter, "Unauthorized")
      .withArgs(user0.address, "account for cancelOrder");

    // Check that the order haven't been cancelled
    expect(await getOrderCount(dataStore)).eq(1);
  });

  it("Users can't cancel short limit increase orders they don't own", async () => {
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

    // User0 tries to cancel the order user1 just created
    await expect(exchangeRouter.connect(user0).cancelOrder(orderKeys[0]))
      .to.be.revertedWithCustomError(exchangeRouter, "Unauthorized")
      .withArgs(user0.address, "account for cancelOrder");

    // Check that the order haven't been cancelled
    expect(await getOrderCount(dataStore)).eq(1);
  });

  it("Users can't cancel long limit decrease orders they don't own", async () => {
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

    // User0 tries to cancel the order user1 just created
    await expect(exchangeRouter.connect(user0).cancelOrder(orderKeys[0]))
      .to.be.revertedWithCustomError(exchangeRouter, "Unauthorized")
      .withArgs(user0.address, "account for cancelOrder");

    // Check that the order haven't been cancelled
    expect(await getOrderCount(dataStore)).eq(1);
  });

  it("Users can't cancel short limit decrease orders they don't own", async () => {
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

    // User0 tries to cancel the order user1 just created
    await expect(exchangeRouter.connect(user0).cancelOrder(orderKeys[0]))
      .to.be.revertedWithCustomError(exchangeRouter, "Unauthorized")
      .withArgs(user0.address, "account for cancelOrder");

    // Check that the order haven't been cancelled
    expect(await getOrderCount(dataStore)).eq(1);
  });

  it("Users can't cancel long stop loss decrease orders they don't own", async () => {
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

    // User0 tries to cancel the order user1 just created
    await expect(exchangeRouter.connect(user0).cancelOrder(orderKeys[0]))
      .to.be.revertedWithCustomError(exchangeRouter, "Unauthorized")
      .withArgs(user0.address, "account for cancelOrder");

    // Check that the order haven't been cancelled
    expect(await getOrderCount(dataStore)).eq(1);
  });

  it("Users can't cancel short stop loss decrease orders they don't own", async () => {
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

    // User0 tries to cancel the order user1 just created
    await expect(exchangeRouter.connect(user0).cancelOrder(orderKeys[0]))
      .to.be.revertedWithCustomError(exchangeRouter, "Unauthorized")
      .withArgs(user0.address, "account for cancelOrder");

    // Check that the order haven't been cancelled
    expect(await getOrderCount(dataStore)).eq(1);
  });

  it("Cancel long limit increase order", async () => {
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
      executionFee: expandDecimals(1, 16),
      isLong: true,
    });

    // Check that the order has been created
    expect(await getOrderCount(dataStore)).eq(1);

    const orderKeys = await getOrderKeys(dataStore, 0, 1);
    const balanceBefore = await provider.getBalance(user1.address);

    // User1 cancelled the order
    await exchangeRouter.connect(user1).cancelOrder(orderKeys[0]);

    // Get the balance of user1 after the cancellations
    const balance = await provider.getBalance(user1.address);

    // Check that some of the execution fee was returned
    expect(balance.sub(balanceBefore)).to.gt(0);

    // Check that the order have been cancelled
    expect(await getOrderCount(dataStore)).eq(0);

    // Check that user got the wnt they sent back
    expect(await wnt.balanceOf(user1.address)).eq(expandDecimals(1, 18));
  });

  it("Cancel short limit increase order", async () => {
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
      executionFee: expandDecimals(1, 16),
      isLong: false,
    });

    // Check that the order has been created
    expect(await getOrderCount(dataStore)).eq(1);

    const orderKeys = await getOrderKeys(dataStore, 0, 1);
    const balanceBefore = await provider.getBalance(user1.address);

    // User1 cancelled the order
    await exchangeRouter.connect(user1).cancelOrder(orderKeys[0]);

    // Get the balance of user1 after the cancellations
    const balance = await provider.getBalance(user1.address);

    // Check that some of the execution fee was returned
    expect(balance.sub(balanceBefore)).to.gt(0);

    // Check that the order have been cancelled
    expect(await getOrderCount(dataStore)).eq(0);

    // Check that user got the wnt they sent back
    expect(await wnt.balanceOf(user1.address)).eq(expandDecimals(1, 18));
  });

  it("Cancel long limit decrease order", async () => {
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
      executionFee: expandDecimals(1, 16),
      isLong: true,
    });

    // Check that the order has been created
    expect(await getOrderCount(dataStore)).eq(1);

    const orderKeys = await getOrderKeys(dataStore, 0, 1);
    const balanceBefore = await provider.getBalance(user1.address);

    // User1 cancelled the order
    await exchangeRouter.connect(user1).cancelOrder(orderKeys[0]);

    // Get the balance of user1 after the cancellations
    const balance = await provider.getBalance(user1.address);

    // Check that some of the execution fee was returned
    expect(balance.sub(balanceBefore)).to.gt(0);

    // Check that the order have been cancelled
    expect(await getOrderCount(dataStore)).eq(0);
  });

  it("Cancel short limit decrease order", async () => {
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
      executionFee: expandDecimals(1, 16),
      isLong: false,
    });

    // Check that the order has been created
    expect(await getOrderCount(dataStore)).eq(1);

    const orderKeys = await getOrderKeys(dataStore, 0, 1);
    const balanceBefore = await provider.getBalance(user1.address);

    // User1 cancelled the order
    await exchangeRouter.connect(user1).cancelOrder(orderKeys[0]);

    // Get the balance of user1 after the cancellations
    const balance = await provider.getBalance(user1.address);

    // Check that some of the execution fee was returned
    expect(balance.sub(balanceBefore)).to.gt(0);

    // Check that the order have been cancelled
    expect(await getOrderCount(dataStore)).eq(0);
  });

  it("Cancel long stop loss decrease order", async () => {
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
      executionFee: expandDecimals(1, 16),
      isLong: true,
    });

    // Check that the order has been created
    expect(await getOrderCount(dataStore)).eq(1);

    const orderKeys = await getOrderKeys(dataStore, 0, 1);
    const balanceBefore = await provider.getBalance(user1.address);

    // User1 cancelled the order
    await exchangeRouter.connect(user1).cancelOrder(orderKeys[0]);

    // Get the balance of user1 after the cancellations
    const balance = await provider.getBalance(user1.address);

    // Check that some of the execution fee was returned
    expect(balance.sub(balanceBefore)).to.gt(0);

    // Check that the order have been cancelled
    expect(await getOrderCount(dataStore)).eq(0);
  });

  it("Cancel short stop loss decrease order", async () => {
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
      executionFee: expandDecimals(1, 16),
      isLong: false,
    });

    // Check that the order has been created
    expect(await getOrderCount(dataStore)).eq(1);

    const orderKeys = await getOrderKeys(dataStore, 0, 1);
    const balanceBefore = await provider.getBalance(user1.address);

    // User1 cancelled the order
    await exchangeRouter.connect(user1).cancelOrder(orderKeys[0]);

    // Get the balance of user1 after the cancellations
    const balance = await provider.getBalance(user1.address);

    // Check that some of the execution fee was returned
    expect(balance.sub(balanceBefore)).to.gt(0);

    // Check that the order have been cancelled
    expect(await getOrderCount(dataStore)).eq(0);
  });
});
