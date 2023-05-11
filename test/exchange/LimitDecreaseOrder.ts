import { expect } from "chai";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

import { getEventData } from "../../utils/event";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, createOrder, executeOrder, handleOrder } from "../../utils/order";
import { errorsContract } from "../../utils/error";
import { usingResult } from "../../utils/use";

describe("Exchange.LimitDecreaseOrder", () => {
  const { provider } = ethers;
  let fixture;
  let user0;
  let ethUsdMarket, wnt, usdc;

  const getParams = () => {
    return {
      account: user0,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(1000),
      acceptablePrice: expandDecimals(4995, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: 0,
      orderType: OrderType.LimitDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };
  };

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ ethUsdMarket, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(2000 * 1000, 6),
      },
    });
  });

  it("executeOrder validations", async () => {
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

    const params = getParams();

    await createOrder(fixture, params);

    await mine(5);

    const block0 = await provider.getBlock();

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

    await expect(
      executeOrder(fixture, {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
        oracleBlocks: [block0, block0],
      })
    ).to.be.revertedWithCustomError(errorsContract, "OracleBlockNumbersAreSmallerThanRequired");

    const block1 = await provider.getBlock();

    await executeOrder(fixture, {
      tokens: [wnt.address, usdc.address],
      minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      precisions: [8, 18],
      oracleBlocks: [block1, block1],
    });

    await usingResult(
      handleOrder(fixture, {
        create: {
          ...params,
          sizeDeltaUsd: decimalToFloat(1000 * 1000),
        },
        execute: {},
      }),
      (result) => {
        const event = getEventData(result.executeResult.logs, "OrderSizeDeltaAutoUpdated");
        expect(event.sizeDeltaUsd).eq(decimalToFloat(1000 * 1000));
        expect(event.nextSizeDeltaUsd).eq(decimalToFloat(399 * 1000));
      }
    );
  });

  it("validates execution price for longs", async () => {
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

    const params = getParams();

    await expect(
      handleOrder(fixture, {
        create: {
          ...params,
          triggerPrice: expandDecimals(5002, 12),
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

  it("validates execution price for shorts", async () => {
    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(4999, 12),
        orderType: OrderType.MarketIncrease,
        isLong: false,
      },
    });

    const params = { ...getParams(), isLong: false, acceptablePrice: expandDecimals(5005, 12) };

    await expect(
      handleOrder(fixture, {
        create: {
          ...params,
          triggerPrice: expandDecimals(4998, 12),
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
});
