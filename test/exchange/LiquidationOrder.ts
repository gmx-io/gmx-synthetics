import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, getOrderCount, handleOrder } from "../../utils/order";
import { executeLiquidation } from "../../utils/liquidation";
import { grantRole } from "../../utils/role";
import { getAccountPositionCount } from "../../utils/position";

describe("Exchange.LiquidationOrder", () => {
  let fixture;
  let wallet, user0;
  let roleStore, dataStore, ethUsdMarket, decreasePositionUtils, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0 } = fixture.accounts);
    ({ roleStore, dataStore, ethUsdMarket, decreasePositionUtils, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });
  });

  it("executeLiquidation", async () => {
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
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    expect(await getOrderCount(dataStore)).eq(0);

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
    ).to.be.revertedWithCustomError(decreasePositionUtils, "PositionShouldNotBeLiquidated");

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    expect(await getOrderCount(dataStore)).eq(0);

    await executeLiquidation(fixture, {
      account: user0.address,
      market: ethUsdMarket,
      collateralToken: wnt,
      isLong: true,
      minPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
      gasUsageLabel: "liquidationHandler.executeLiquidation",
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getOrderCount(dataStore)).eq(0);
  });
});
