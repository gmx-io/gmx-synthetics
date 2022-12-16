import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, expandFloatDecimals } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder, executeLiquidation } from "../../utils/order";
import { grantRole } from "../../utils/role";

describe("Exchange.LiquidationOrder", () => {
  let fixture;
  let wallet, user0;
  let roleStore, orderStore, positionStore, ethUsdMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0 } = fixture.accounts);
    ({ roleStore, orderStore, positionStore, ethUsdMarket, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });
  });

  it("executeLiquidation", async () => {
    expect(await positionStore.getAccountPositionCount(user0.address)).eq(0);

    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: expandFloatDecimals(200 * 1000),
        acceptablePrice: expandDecimals(5001, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    expect(await positionStore.getAccountPositionCount(user0.address)).eq(1);
    expect(await orderStore.getOrderCount()).eq(0);

    await grantRole(roleStore, wallet.address, "LIQUIDATION_KEEPER");

    await expect(
      executeLiquidation(fixture, {
        account: user0.address,
        market: ethUsdMarket,
        collateralToken: wnt,
        isLong: true,
        minPrices: [expandDecimals(4200, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(4200, 4), expandDecimals(1, 6)],
        gasUsageLabel: "liquidationHandler.executeLiquidation",
      })
    ).to.be.revertedWith("DecreasePositionUtils: Invalid Liquidation");

    expect(await positionStore.getAccountPositionCount(user0.address)).eq(1);
    expect(await orderStore.getOrderCount()).eq(0);

    await executeLiquidation(fixture, {
      account: user0.address,
      market: ethUsdMarket,
      collateralToken: wnt,
      isLong: true,
      minPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
      gasUsageLabel: "liquidationHandler.executeLiquidation",
    });

    expect(await positionStore.getAccountPositionCount(user0.address)).eq(0);
    expect(await orderStore.getOrderCount()).eq(0);
  });
});
