import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { errorsContract } from "../../utils/error";

describe("Exchange.StopLossDecrease", () => {
  let fixture;
  let user0;
  let ethUsdMarket, wnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ ethUsdMarket, wnt } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(500 * 1000, 6),
      },
    });
  });

  it("executeOrder long", async () => {
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

    const params = {
      account: user0,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(1000),
      triggerPrice: expandDecimals(4998, 12),
      acceptablePrice: expandDecimals(4995, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: 0,
      orderType: OrderType.StopLossDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await expect(
      handleOrder(fixture, {
        create: {
          ...params,
        },
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidOrderPrices");

    await handleOrder(fixture, {
      create: {
        ...params,
        triggerPrice: expandDecimals(5002, 12),
      },
    });
  });

  it("executeOrder short", async () => {
    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(4998, 12),
        orderType: OrderType.MarketIncrease,
        isLong: false,
      },
    });

    const params = {
      account: user0,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(1000),
      triggerPrice: expandDecimals(5002, 12),
      acceptablePrice: expandDecimals(5005, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: 0,
      orderType: OrderType.StopLossDecrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await expect(
      handleOrder(fixture, {
        create: {
          ...params,
        },
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidOrderPrices");

    await handleOrder(fixture, {
      create: {
        ...params,
        triggerPrice: expandDecimals(4998, 12),
      },
    });
  });
});
