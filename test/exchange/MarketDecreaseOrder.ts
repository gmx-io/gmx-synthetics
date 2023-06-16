import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { getEventData } from "../../utils/event";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import {
  OrderType,
  DecreasePositionSwapType,
  getOrderCount,
  getOrderKeys,
  createOrder,
  handleOrder,
} from "../../utils/order";
import { getAccountPositionCount } from "../../utils/position";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { usingResult } from "../../utils/use";

describe("Exchange.MarketDecreaseOrder", () => {
  const { provider } = ethers;
  let fixture;
  let user0;
  let dataStore, reader, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc;

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
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };
  };

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ dataStore, reader, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });
  });

  it("createOrder", async () => {
    await createOrder(fixture, {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(5, 18),
      swapPath: [ethUsdMarket.marketToken],
      orderType: OrderType.MarketDecrease,
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(5001, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: expandDecimals(50000, 6),
      isLong: true,
      gasUsageLabel: "orderHandler.createOrder",
    });

    const orderKeys = await getOrderKeys(dataStore, 0, 1);
    const order = await reader.getOrder(dataStore.address, orderKeys[0]);

    expect(order.addresses.account).eq(user0.address);
    expect(order.addresses.market).eq(ethUsdMarket.marketToken);
    expect(order.addresses.initialCollateralToken).eq(wnt.address);
    expect(order.addresses.swapPath).eql([ethUsdMarket.marketToken]);
    expect(order.numbers.orderType).eq(OrderType.MarketDecrease);
    expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(200 * 1000));
    expect(order.numbers.initialCollateralDeltaAmount).eq(expandDecimals(5, 18));
    expect(order.numbers.acceptablePrice).eq(expandDecimals(5001, 12));
    expect(order.numbers.executionFee).eq(expandDecimals(1, 15));
    expect(order.numbers.minOutputAmount).eq(expandDecimals(50000, 6));
    expect(order.flags.isLong).eq(true);
    expect(order.flags.shouldUnwrapNativeToken).eq(false);
  });

  it("executeOrder validations 0", async () => {
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
      createOrder(fixture, {
        ...params,
        market: ethUsdSpotOnlyMarket,
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "InvalidPositionMarket")
      .withArgs(ethUsdSpotOnlyMarket.marketToken);

    await handleOrder(fixture, {
      create: {
        ...params,
        isLong: false,
      },
      execute: {
        expectedCancellationReason: "EmptyPosition",
      },
    });

    const block1 = await provider.getBlock();
    const block0 = await provider.getBlock(block1.number - 1);

    await expect(
      handleOrder(fixture, {
        create: {
          ...params,
        },
        execute: {
          tokens: [wnt.address, usdc.address],
          minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
          maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
          precisions: [8, 18],
          oracleBlocks: [block0, block1],
        },
      })
    ).to.be.revertedWithCustomError(errorsContract, "OracleBlockNumberNotWithinRange");

    await handleOrder(fixture, {
      create: {
        ...params,
        sizeDeltaUsd: decimalToFloat(1000 * 1000),
      },
      execute: {
        expectedCancellationReason: "InvalidDecreaseOrderSize",
      },
    });

    // if we want to have a min collateral factor of 0.1 when open interest is 200,000
    // then minCollateralFactorForOpenInterestMultiplier * 200,000 = 0.1
    // minCollateralFactorForOpenInterestMultiplier: 0.1 / 200,000 = 5e-7
    await dataStore.setUint(
      keys.minCollateralFactorForOpenInterestMultiplierKey(ethUsdMarket.marketToken, true),
      decimalToFloat(5, 7)
    );

    await handleOrder(fixture, {
      create: {
        ...params,
        sizeDeltaUsd: 0,
        initialCollateralDeltaAmount: "9910000000000000000", // 9.91 ETH
      },
      execute: {
        expectedCancellationReason: "UnableToWithdrawCollateral",
      },
    });

    await usingResult(
      handleOrder(fixture, {
        create: {
          ...params,
          initialCollateralDeltaAmount: "9910000000000000000", // 9.91 ETH
        },
      }),
      (result) => {
        const event = getEventData(result.executeResult.logs, "OrderCollateralDeltaAmountAutoUpdated");
        expect(event.collateralDeltaAmount).eq("9910000000000000000");
        expect(event.nextCollateralDeltaAmount).eq("0");
      }
    );

    await dataStore.setUint(keys.MIN_POSITION_SIZE_USD, decimalToFloat(50 * 1000));

    await usingResult(
      handleOrder(fixture, {
        create: {
          ...params,
          sizeDeltaUsd: decimalToFloat(190 * 1000),
        },
      }),
      (result) => {
        const event = getEventData(result.executeResult.logs, "OrderSizeDeltaAutoUpdated");
        expect(event.sizeDeltaUsd).eq(decimalToFloat(190 * 1000));
        expect(event.nextSizeDeltaUsd).eq(decimalToFloat(199 * 1000));
      }
    );
  });

  it("executeOrder validations 1", async () => {
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

    expect(await wnt.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    // request a swap using decreasePositionSwapType even though the pnlToken and
    // collateralToken are the same, the order should still execute and return
    // the correct output amounts
    await handleOrder(fixture, {
      create: {
        ...params,
        decreasePositionSwapType: DecreasePositionSwapType.SwapPnlTokenToCollateralToken,
      },
    });

    expect(await wnt.balanceOf(user0.address)).eq(expandDecimals(1, 18));
    expect(await usdc.balanceOf(user0.address)).eq(0);
  });

  it("executeOrder", async () => {
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

    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(4800, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
        gasUsageLabel: "orderHandler.createOrder",
      },
      execute: {
        gasUsageLabel: "orderHandler.executeOrder",
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getOrderCount(dataStore)).eq(0);
  });

  it("executeOrder with price impact", async () => {
    // set price impact to 0.1% for every $100,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 100,000 => 1 * (10 ** -8)
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 8));
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);

    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5050, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    expect(await getOrderCount(dataStore)).eq(0);

    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
        gasUsageLabel: "orderHandler.createOrder",
      },
      execute: {
        gasUsageLabel: "orderHandler.executeOrder",
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getOrderCount(dataStore)).eq(0);
  });
});
