import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, getOrderCount, getOrderKeys, createOrder, executeOrder, handleOrder } from "../../utils/order";
import { getPositionCount, getAccountPositionCount } from "../../utils/position";
import { getExecuteParams } from "../../utils/exchange";
import * as keys from "../../utils/keys";

describe("Exchange.MarketIncreaseOrder", () => {
  const { provider } = ethers;

  let fixture;
  let user0, user1;
  let reader, dataStore, increaseOrderUtils, ethUsdMarket, btcUsdMarket, wnt, wbtc, usdc;
  let executionFee;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ reader, dataStore, increaseOrderUtils, ethUsdMarket, btcUsdMarket, wnt, wbtc, usdc } = fixture.contracts);
    ({ executionFee } = fixture.props);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1000 * 1000, 6),
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: btcUsdMarket,
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(50 * 1000, 6),
      },
      execute: getExecuteParams(fixture, { tokens: [wbtc, usdc] }),
    });
  });

  it("createOrder", async () => {
    expect(await getOrderCount(dataStore)).eq(0);
    const params = {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [ethUsdMarket.marketToken],
      orderType: OrderType.MarketIncrease,
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(5001, 12),
      executionFee,
      minOutputAmount: expandDecimals(50000, 6),
      isLong: true,
      shouldUnwrapNativeToken: false,
      gasUsageLabel: "createOrder",
    };

    await createOrder(fixture, params);

    expect(await getOrderCount(dataStore)).eq(1);

    const block = await provider.getBlock();

    const orderKeys = await getOrderKeys(dataStore, 0, 1);
    const order = await reader.getOrder(dataStore.address, orderKeys[0]);

    expect(order.addresses.account).eq(user0.address);
    expect(order.addresses.market).eq(ethUsdMarket.marketToken);
    expect(order.addresses.initialCollateralToken).eq(wnt.address);
    expect(order.addresses.swapPath).eql([ethUsdMarket.marketToken]);
    expect(order.numbers.orderType).eq(OrderType.MarketIncrease);
    expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(200 * 1000));
    expect(order.numbers.initialCollateralDeltaAmount).eq(expandDecimals(10, 18));
    expect(order.numbers.acceptablePrice).eq(expandDecimals(5001, 12));
    expect(order.numbers.executionFee).eq(expandDecimals(1, 15));
    expect(order.numbers.minOutputAmount).eq(expandDecimals(50000, 6));
    expect(order.numbers.updatedAtBlock).eq(block.number);
    expect(order.flags.isLong).eq(true);
    expect(order.flags.shouldUnwrapNativeToken).eq(false);
  });

  it("executeOrder validations", async () => {
    const params = {
      account: user0,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(1000),
      acceptablePrice: expandDecimals(5001, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: 0,
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: {
        ...params,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(5000, 6),
        swapPath: [btcUsdMarket.marketToken],
      },
      execute: {
        ...getExecuteParams(fixture, { tokens: [wnt, wbtc, usdc] }),
        expectedCancellationReason: "InvalidCollateralToken",
      },
    });

    await expect(
      handleOrder(fixture, {
        create: {
          ...params,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(5000, 6),
        },
        execute: {
          oracleBlockNumberOffset: -1,
        },
      })
    ).to.be.revertedWithCustomError(increaseOrderUtils, "OracleBlockNumberNotWithinRange");

    await expect(
      handleOrder(fixture, {
        create: {
          ...params,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(5000, 6),
        },
        execute: {
          oracleBlockNumberOffset: 5,
        },
      })
    ).to.be.revertedWithCustomError(increaseOrderUtils, "OracleBlockNumberNotWithinRange");
  });

  it("executeOrder", async () => {
    expect(await getOrderCount(dataStore)).eq(0);

    const params = {
      account: user0,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(5001, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await createOrder(fixture, params);

    expect(await getOrderCount(dataStore)).eq(1);
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getPositionCount(dataStore)).eq(0);

    await executeOrder(fixture, {
      gasUsageLabel: "executeOrder",
    });

    expect(await getOrderCount(dataStore)).eq(0);
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    expect(await getPositionCount(dataStore)).eq(1);

    params.account = user1;

    await handleOrder(fixture, {
      create: params,
      execute: {
        gasUsageLabel: "executeOrder",
      },
    });

    expect(await getAccountPositionCount(dataStore, user1.address)).eq(1);
    expect(await getPositionCount(dataStore)).eq(2);
  });

  it("validates collateral amount", async () => {
    await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken), decimalToFloat(5, 4)); // 0.05%

    const params = {
      account: user0,
      market: ethUsdMarket,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: expandDecimals(1000, 6),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(20 * 1000),
      acceptablePrice: expandDecimals(4990, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.MarketIncrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, { create: params });

    await handleOrder(fixture, {
      create: { ...params, initialCollateralDeltaAmount: 0, account: user1 },
      execute: {
        expectedCancellationReason: "InsufficientCollateralAmount",
      },
    });

    await handleOrder(fixture, {
      create: { ...params, initialCollateralDeltaAmount: expandDecimals(1000, 6), account: user0 },
      execute: {
        tokens: [wnt.address, usdc.address],
        precisions: [8, 18],
        minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        expectedCancellationReason: "LiquidatablePosition",
      },
    });

    await handleOrder(fixture, {
      create: { ...params, initialCollateralDeltaAmount: expandDecimals(2000, 6), account: user0 },
      execute: {
        tokens: [wnt.address, usdc.address],
        precisions: [8, 18],
        minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
      },
    });

    it("validates reserve", async () => {
      const params = {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(100 * 1000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(300 * 1000),
        acceptablePrice: expandDecimals(4990, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: expandDecimals(50000, 6),
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      };

      await handleOrder(fixture, { create: params });

      await handleOrder(fixture, {
        create: params,
        execute: {
          expectedCancellationReason: "InsufficientReserve",
        },
      });
    });

    it("validates open interest", async () => {
      await dataStore.setUint(keys.maxOpenInterestKey(ethUsdMarket.marketToken, false), decimalToFloat(200 * 1000));

      const params = {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(100 * 1000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(150 * 1000),
        acceptablePrice: expandDecimals(4990, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: expandDecimals(50000, 6),
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      };

      await handleOrder(fixture, { create: params });

      await handleOrder(fixture, {
        create: params,
        execute: {
          expectedCancellationReason: "MaxOpenInterestExceeded",
        },
      });
    });
  });
});
