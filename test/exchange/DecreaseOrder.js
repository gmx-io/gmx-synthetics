const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const { deployFixture } = require("../../utils/fixture");
const { expandDecimals, expandFloatDecimals } = require("../../utils/math");
const { handleDeposit } = require("../../utils/deposit");
const { OrderType, handleOrder } = require("../../utils/order");

describe("Exchange.DecreaseOrder", () => {
  let fixture;
  let user0;
  let orderStore, positionStore, ethUsdMarket, weth, usdc;

  beforeEach(async () => {
    fixture = await loadFixture(deployFixture);
    ({ user0 } = fixture.accounts);
    ({ orderStore, positionStore, ethUsdMarket, weth, usdc } = fixture.contracts);

    await handleDeposit(fixture);
  });

  it("executeOrder", async () => {
    expect(await positionStore.getAccountPositionCount(user0.address)).eq(0);

    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: weth,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: expandFloatDecimals(200 * 1000),
        acceptablePriceImpactUsd: expandDecimals(-5, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: {
        tokens: [weth.address, usdc.address],
        prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    expect(await positionStore.getAccountPositionCount(user0.address)).eq(1);
    expect(await orderStore.getOrderCount()).eq(0);

    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: weth,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: expandFloatDecimals(200 * 1000),
        acceptablePriceImpactUsd: expandDecimals(-5, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
        gasUsageLabel: "orderHandler.createOrder",
      },
      execute: {
        tokens: [weth.address, usdc.address],
        prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        gasUsageLabel: "orderHandler.executeOrder",
      },
    });

    expect(await positionStore.getAccountPositionCount(user0.address)).eq(0);
    expect(await orderStore.getOrderCount()).eq(0);
  });
});
