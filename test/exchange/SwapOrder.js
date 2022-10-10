const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const { deployFixture } = require("../../utils/fixture");
const { expandDecimals, expandFloatDecimals } = require("../../utils/math");
const { handleDeposit } = require("../../utils/deposit");
const { OrderType, handleOrder } = require("../../utils/order");

describe("Exchange.SwapOrder", () => {
  let fixture;
  let user0;
  let orderStore, positionStore, ethUsdMarket, weth, usdc;

  beforeEach(async () => {
    fixture = await loadFixture(deployFixture);
    ({ user0 } = fixture.accounts);
    ({ orderStore, positionStore, ethUsdMarket, weth, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        token: usdc,
        amount: expandDecimals(50000, 6),
      },
    });
  });

  it("executeOrder", async () => {
    expect(await positionStore.getAccountPositionCount(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    await handleOrder(fixture, {
      create: {
        initialCollateralToken: weth,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        acceptablePriceImpactUsd: expandFloatDecimals(-10),
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
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
    expect(await usdc.balanceOf(user0.address)).eq("50000000000");
  });
});
