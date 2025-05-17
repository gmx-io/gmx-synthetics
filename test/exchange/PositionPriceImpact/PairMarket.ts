import { expect } from "chai";

import { usingResult } from "../../../utils/use";
import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { handleDeposit } from "../../../utils/deposit";
import { OrderType, getOrderCount, handleOrder } from "../../../utils/order";
import {
  getPositionCount,
  getAccountPositionCount,
  getPositionKeys,
  getPositionKey,
  getPendingImpactAmountKey,
} from "../../../utils/position";
import { getEventData } from "../../../utils/event";
import * as keys from "../../../utils/keys";

describe("Exchange.PositionPriceImpact.PairMarket", () => {
  let fixture;
  let user0, user1, user2;
  let reader, dataStore, referralStorage, ethUsdMarket, wnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    ({ reader, dataStore, referralStorage, ethUsdMarket, wnt } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(2000 * 1000, 6),
      },
    });
  });

  it("price impact pair market", async () => {
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    expect(await getOrderCount(dataStore)).eq(0);

    const params = {
      account: user0,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(5050, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);

    // increase long position, negative price impact
    await handleOrder(fixture, {
      create: params,
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("5010020040080160"); // ~5010
          expect(positionIncreaseEvent.pendingPriceImpactUsd).eq("-399999999999999992588018713340000"); // -400
        },
      },
    });

    // increase long position was executed with price above oracle price
    // the impact pool amount should not increase, price impact is stored as pending
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);

    let positionKeys = await getPositionKeys(dataStore, 0, 10);
    let position0Long = await reader.getPosition(dataStore.address, positionKeys[0]);
    expect(position0Long.numbers.pendingImpactAmount).eq("-79999999999999999"); // -0.079999999999999999 ETH, 400 USD
    expect(position0Long.numbers.sizeInUsd).eq(decimalToFloat(200 * 1000));
    expect(position0Long.numbers.sizeInTokens).eq("40000000000000000000"); // 40.00 - size doesn't consider for the price impact

    await handleOrder(fixture, {
      create: { ...params, account: user1, acceptablePrice: expandDecimals(5020, 12) },
      execute: {
        expectedCancellationReason: "OrderNotFulfillableAtAcceptablePrice",
      },
    });

    // increase long position, negative price impact
    await handleOrder(fixture, {
      create: { ...params, account: user1, acceptablePrice: expandDecimals(5050, 12) },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("5030181086519114"); // ~5030
          expect(positionIncreaseEvent.pendingPriceImpactUsd).eq("-1199999999999999977764056140040000"); // -1200
        },
      },
    });

    // increase long position was executed with price above oracle price
    // the impact pool amount should not increase, price impact is stored as pending
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);

    expect(await getAccountPositionCount(dataStore, user1.address)).eq(1);
    expect(await getPositionCount(dataStore)).eq(2);

    positionKeys = await getPositionKeys(dataStore, 0, 10);
    const position1Long = await reader.getPosition(dataStore.address, positionKeys[1]);
    expect(position0Long.numbers.pendingImpactAmount.add(position1Long.numbers.pendingImpactAmount)).eq(
      "-319999999999999995"
    ); // -0.08 - 0.24 => -0.32 ETH, 1600 USD

    expect(position1Long.numbers.pendingImpactAmount).eq("-239999999999999996"); // -0.24 ETH, 1200 USD
    expect(position1Long.numbers.sizeInUsd).eq(decimalToFloat(200 * 1000));
    expect(position1Long.numbers.sizeInTokens).eq("40000000000000000000"); // 40.00 ETH

    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 4));

    await handleOrder(fixture, {
      create: { ...params, isLong: true, sizeDeltaUsd: decimalToFloat(500 * 1000) },
      execute: {
        gasUsageLabel: "executeOrder",
        expectedCancellationReason: "PriceImpactLargerThanOrderSize",
      },
    });

    await handleOrder(fixture, {
      create: { ...params, isLong: false, sizeDeltaUsd: decimalToFloat(500 * 1000) },
      execute: {
        gasUsageLabel: "executeOrder",
        expectedCancellationReason: "OrderNotFulfillableAtAcceptablePrice",
      },
    });

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);

    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));

    // increase short position, positive price impact
    await handleOrder(fixture, {
      create: {
        ...params,
        isLong: false,
        sizeDeltaUsd: decimalToFloat(10 * 1000),
        acceptablePrice: expandDecimals(5000, 12),
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("5019828321871391"); // 5019.82
          expect(positionIncreaseEvent.pendingPriceImpactUsd).eq("39500000000000000326409486835000"); // 39.5
        },
      },
    });

    // increase short position was executed with price above oracle price
    // the impact pool amount remains the same, the impact pending amount should increase, but it's capped at 0 by the impact pool amount
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);

    positionKeys = await getPositionKeys(dataStore, 0, 10);
    let position0Short = await reader.getPosition(dataStore.address, positionKeys[2]);
    expect(position0Short.numbers.pendingImpactAmount).eq("7900000000000000"); // 0.0079 ETH, 39.5 USD
    expect(
      position0Long.numbers.pendingImpactAmount
        .add(position1Long.numbers.pendingImpactAmount)
        .add(position0Short.numbers.pendingImpactAmount)
    ).eq("-312099999999999995"); // -0.08 - 0.24 + 0.0079 = -0.3121 ETH, 1600 USD

    // decrease short position, negative price impact
    await handleOrder(fixture, {
      create: {
        ...params,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        sizeDeltaUsd: decimalToFloat(10 * 1000),
        acceptablePrice: expandDecimals(5050, 12),
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionDecreaseEvent = getEventData(logs, "PositionDecrease");
          expect(positionDecreaseEvent.executionPrice).eq("5039500000000000"); // 5039.5
          expect(positionDecreaseEvent.basePnlUsd).eq(0);
          expect(positionDecreaseEvent.priceImpactUsd).eq("-79000000000000000652818973670000"); // -79
          expect(positionDecreaseEvent.proportionalPendingImpactUsd).eq("39500000000000000000000000000000"); // 39.5
        },
      },
    });

    // decrease short position was executed with price above oracle price
    // the impact pool amount should increase, the impact pending amount should decrease
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq("7900000000000001"); // 0.0079 ETH, 39.5 USD

    position0Short = await reader.getPosition(dataStore.address, positionKeys[2]);
    expect(
      position0Long.numbers.pendingImpactAmount
        .add(position1Long.numbers.pendingImpactAmount)
        .add(position0Short.numbers.pendingImpactAmount)
    ).eq("-319999999999999995"); // -0.32 + 0.0079 - 0.0079 = -0.32 ETH, 1600 USD

    expect(position0Long.numbers.pendingImpactAmount).eq("-79999999999999999"); // -0.08 ETH, 400 USD
    expect(position0Short.numbers.pendingImpactAmount).eq(0); // position decreased by 100%
    expect(position1Long.numbers.pendingImpactAmount).eq("-239999999999999996"); // -0.24 ETH, 1200 USD

    // increase short position, positive price impact
    await handleOrder(fixture, {
      create: {
        ...params,
        isLong: false,
        sizeDeltaUsd: decimalToFloat(500 * 1000),
        acceptablePrice: expandDecimals(5000, 12),
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("5007009813739234"); // ~5007
          expect(positionIncreaseEvent.pendingPriceImpactUsd).eq("699999999999999987029032748360000"); // 700
        },
      },
    });

    // increase short position was executed with price above oracle price
    // the impact pool amount remains the same, the impact pending amount should increase
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq("7900000000000001"); // 0.0079 ETH, 39.5 USD

    position0Short = await reader.getPosition(dataStore.address, positionKeys[2]);
    expect(
      position0Long.numbers.pendingImpactAmount
        .add(position1Long.numbers.pendingImpactAmount)
        .add(position0Short.numbers.pendingImpactAmount)
    ).eq("-179999999999999998"); // -0.08 - 0.24 + 0.14 = -0.18 ETH, 900 USD

    expect(position0Long.numbers.pendingImpactAmount).eq("-79999999999999999"); // -0.08 ETH, 400 USD
    expect(position0Short.numbers.pendingImpactAmount).eq("139999999999999997"); // 0.14 ETH, 700 USD
    expect(position1Long.numbers.pendingImpactAmount).eq("-239999999999999996"); // -0.24 ETH, 1200 USD

    // increase short position, negative price impact
    await handleOrder(fixture, {
      create: {
        ...params,
        isLong: false,
        sizeDeltaUsd: decimalToFloat(100 * 1000),
        acceptablePrice: expandDecimals(4900, 12),
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("4985044865403788"); // ~4985.04
          expect(positionIncreaseEvent.pendingPriceImpactUsd).eq("-299999999999999994441014035010000"); // -300
        },
      },
    });

    // increase short position was executed with price below oracle price
    // the impact pool amount remains the same, the impact pending amount should decrease
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq("7900000000000001"); // 0.0079 ETH, 39.5 USD

    position0Short = await reader.getPosition(dataStore.address, positionKeys[2]);
    expect(
      position0Long.numbers.pendingImpactAmount
        .add(position1Long.numbers.pendingImpactAmount)
        .add(position0Short.numbers.pendingImpactAmount)
    ).eq("-239999999999999997"); // -0.08 - 0.24 + 0.14 = -0.24 ETH, 1200 USD

    expect(position0Long.numbers.pendingImpactAmount).eq("-79999999999999999"); // -0.08 ETH, 400 USD
    expect(position0Short.numbers.pendingImpactAmount).eq("79999999999999998"); // 0.14 - 0.06 = 0.08 ETH, 400 USD
    expect(position1Long.numbers.pendingImpactAmount).eq("-239999999999999996"); // -0.24 ETH, 1200 USD

    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, true))).eq(
      decimalToFloat(400_000)
    );

    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, false))).eq(
      decimalToFloat(600_000)
    );

    // increase long position, positive price impact
    await handleOrder(fixture, {
      create: {
        ...params,
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5000, 12),
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("4995004995004995"); // ~4995
          expect(positionIncreaseEvent.pendingPriceImpactUsd).eq("199999999999999996294009356670000"); // 200
        },
      },
    });

    // increase long position was executed with price below oracle price
    // the impact pool amount remains the same, the impact pending amount should increase
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq("7900000000000001"); // 0.0079 ETH, 39.5 USD

    position0Long = await reader.getPosition(dataStore.address, positionKeys[0]);
    expect(
      position0Long.numbers.pendingImpactAmount
        .add(position1Long.numbers.pendingImpactAmount)
        .add(position0Short.numbers.pendingImpactAmount)
    ).eq("-199999999999999998"); // -0.04 - 0.24 + 0.08 = -0.2 ETH, 1000 USD

    expect(position0Long.numbers.pendingImpactAmount).eq("-40000000000000000"); // -0.04 ETH, 200 USD
    expect(position0Short.numbers.pendingImpactAmount).eq("79999999999999998"); // 0.08 ETH, 400 USD
    expect(position1Long.numbers.pendingImpactAmount).eq("-239999999999999996"); // -0.24 ETH, 1200 USD

    // increase long position, negative price impact
    await handleOrder(fixture, {
      create: {
        ...params,
        sizeDeltaUsd: decimalToFloat(100 * 1000),
        acceptablePrice: expandDecimals(5100, 12),
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("5005005005005005"); // ~5005
          expect(positionIncreaseEvent.pendingPriceImpactUsd).eq("-99999999999999998147004678330000"); // -100 usd
        },
      },
    });

    // increase long position was executed with price above oracle price
    // the impact pool amount remains the same, the impact pending amount should decrease
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq("7900000000000001"); // 0.0079 ETH, 39.5 USD

    position0Long = await reader.getPosition(dataStore.address, positionKeys[0]);
    expect(
      position0Long.numbers.pendingImpactAmount
        .add(position1Long.numbers.pendingImpactAmount)
        .add(position0Short.numbers.pendingImpactAmount)
    ).eq("-219999999999999998"); // -0.06 - 0.24 + 0.08 = -0.22 ETH, 1100 USD

    expect(position0Long.numbers.pendingImpactAmount).eq("-60000000000000000"); // -0.04 - 0.02 = -0.06 ETH, 300 USD
    expect(position0Short.numbers.pendingImpactAmount).eq("79999999999999998"); // 0.08 ETH, 400 USD
    expect(position1Long.numbers.pendingImpactAmount).eq("-239999999999999996"); // -0.24 ETH, 1200 USD

    // decrease long position, positive price impact
    await handleOrder(fixture, {
      create: {
        ...params,
        orderType: OrderType.MarketDecrease,
        sizeDeltaUsd: decimalToFloat(100 * 1000),
        acceptablePrice: expandDecimals(5000, 12),
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionDecreaseEvent = getEventData(logs, "PositionDecrease");
          expect(positionDecreaseEvent.executionPrice).eq("5002499999999999"); // ~5002
          expect(positionDecreaseEvent.priceImpactUsd).eq("49999999999999999073502339165000"); // ~50 usd
          expect(positionDecreaseEvent.proportionalPendingImpactUsd).eq("-60000000000000000000000000000000"); // -60 usd
          // totalImpactUsd = (50 - 60) / 5000 = -10 / 5000 = -0.002
        },
      },
    });

    // decrease long position was executed with price above oracle price
    // the impact pool amount should increase, the impact pending amount should increase
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq("9900000000000002"); // 0.0079 + 0.002 = 0.0099 ETH, 49.5 USD

    position0Long = await reader.getPosition(dataStore.address, positionKeys[0]);
    expect(
      position0Long.numbers.pendingImpactAmount
        .add(position1Long.numbers.pendingImpactAmount)
        .add(position0Short.numbers.pendingImpactAmount)
    ).eq("-207999999999999998"); // -0.048 - 0.24 + 0.08 = -0.208 ETH, 1040 USD

    expect(position0Long.numbers.pendingImpactAmount).eq("-48000000000000000"); // -0.06 + 0.012 = -0.048 ETH, 240 USD
    expect(position0Short.numbers.pendingImpactAmount).eq("79999999999999998"); // 0.08 ETH, 400 USD
    expect(position1Long.numbers.pendingImpactAmount).eq("-239999999999999996"); // -0.24 ETH, 1200 USD

    // decrease long position, negative price impact
    await handleOrder(fixture, {
      create: {
        ...params,
        orderType: OrderType.MarketDecrease,
        sizeDeltaUsd: decimalToFloat(100 * 1000),
        acceptablePrice: expandDecimals(4900, 12),
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionDecreaseEvent = getEventData(logs, "PositionDecrease");
          expect(positionDecreaseEvent.executionPrice).eq("4995000000000001"); // ~4995
          expect(positionDecreaseEvent.priceImpactUsd).eq("-99999999999999998147004678330000"); // -100
          expect(positionDecreaseEvent.proportionalPendingImpactUsd).eq("-60000000000000000000000000000000"); // -60 usd
          // totalImpactUsd = (-100 - 60) / 5000 = -160 / 5000 = -0.032
        },
      },
    });

    // decrease long position was executed with price below oracle price
    // the impact pool amount should increase, the impact pending amount should decrease
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq("41900000000000002"); // 0.0099 + 0.032 = 0.0419 ETH, 209.5 USD

    position0Long = await reader.getPosition(dataStore.address, positionKeys[0]);
    expect(
      position0Long.numbers.pendingImpactAmount
        .add(position1Long.numbers.pendingImpactAmount)
        .add(position0Short.numbers.pendingImpactAmount)
    ).eq("-195999999999999998"); // -0.036 - 0.24 + 0.08 = -0.196 ETH, 980 USD

    expect(position0Long.numbers.pendingImpactAmount).eq("-36000000000000000"); // -0.048 + 0.013 = -0.036 ETH, 180 USD
    expect(position0Short.numbers.pendingImpactAmount).eq("79999999999999998"); // 0.08 ETH, 400 USD
    expect(position1Long.numbers.pendingImpactAmount).eq("-239999999999999996"); // -0.24 ETH, 1200 USD

    // decrease short position, positive price impact
    await handleOrder(fixture, {
      create: {
        ...params,
        isLong: false,
        orderType: OrderType.MarketDecrease,
        sizeDeltaUsd: decimalToFloat(100 * 1000),
        acceptablePrice: expandDecimals(5000, 12),
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionDecreaseEvent = getEventData(logs, "PositionDecrease");
          expect(positionDecreaseEvent.executionPrice).eq("4997500000000001"); // ~4995
          expect(positionDecreaseEvent.priceImpactUsd).eq("49999999999999999073502339165000"); // 50
          expect(positionDecreaseEvent.proportionalPendingImpactUsd).eq("66666666666666665000000000000000"); // 66.67 usd
          // totalImpactUsd = (50 + 66.67) / 5000 = 116.67 / 5000 = -0.023334
        },
      },
    });

    // decrease short position was executed with price below oracle price
    // the impact pool amount should decrease, the impact pending amount should decrease
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq("18566666666666669"); // 0.0419 - 0.023334 = 0.018566 ETH, 92,83 USD

    position0Short = await reader.getPosition(dataStore.address, positionKeys[2]);
    expect(
      position0Long.numbers.pendingImpactAmount
        .add(position1Long.numbers.pendingImpactAmount)
        .add(position0Short.numbers.pendingImpactAmount)
    ).eq("-209333333333333331"); // -0.036 - 0.24 + 0.06667 = -0.20933 ETH, 1046.67 USD

    expect(position0Long.numbers.pendingImpactAmount).eq("-36000000000000000"); // -0.036 ETH, 180 USD
    expect(position0Short.numbers.pendingImpactAmount).eq("66666666666666665"); // 0.08 - 0.013334 = 0.06667 ETH, 333.33 USD

    expect(position1Long.numbers.pendingImpactAmount).eq("-239999999999999996"); // -0.24 ETH, 1200 USD
  });

  it("capped price impact", async () => {
    // set price impact to 0.1% for every $50,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 50,000 => 2 * (10 ** -8)
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    expect(await getOrderCount(dataStore)).eq(0);

    const params = {
      account: user0,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(5050, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: params,
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("5010020040080160"); // ~5010
        },
      },
    });

    await handleOrder(fixture, {
      create: { ...params, isLong: false, acceptablePrice: expandDecimals(4950, 12) },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("5005005005005005"); // ~5005
          expect(positionIncreaseEvent.pendingPriceImpactUsd).eq("199999999999999996294009356670000"); // 200
        },
      },
    });

    await dataStore.setUint(keys.maxPositionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 4));

    await handleOrder(fixture, {
      create: params,
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("5010020040080160"); // ~5010
          expect(positionIncreaseEvent.pendingPriceImpactUsd).eq("-399999999999999992588018713340000"); // -400
        },
      },
    });

    await handleOrder(fixture, {
      create: { ...params, isLong: false, acceptablePrice: expandDecimals(4950, 12) },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("5000500050005000"); // ~5000.5
          expect(positionIncreaseEvent.pendingPriceImpactUsd).eq(expandDecimals(20, 30)); // 20 usd
        },
      },
    });
  });

  it("price impact tracking", async () => {
    // Step                  | from increase    | from decrease    | poolAmount| totalPending | lent
    //
    // 1. user0, open long   | negative (-0.08) |                  | 0         | -0.08        | 0
    // 2. user1, open short  | positive (+0.04) |                  | 0         | -0.04        | 0
    // 3. user2, open short  | negative (-0.08) |                  | 0         | -0.12        | 0
    //
    // 4. user1, close short | positive (+0.04) | positive (+0.04) | 0         | -0.16        | 0.08
    // 5. user0, close long  | negative (-0.08) | negative (-0.08) | 0.08      | -0.08        | 0
    // 6. user2, close short | negative (-0.08) | positive (+0.04) | 0.12      | +0.00        | 0

    // set price impact to 0.1% for every $50,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 50,000 => 2 * (10 ** -8)
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    const params = {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: expandDecimals(50000, 6),
      shouldUnwrapNativeToken: false,
    };

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);
    expect(await dataStore.getInt(keys.totalPendingImpactAmountKey(ethUsdMarket.marketToken))).eq(0);
    expect(await dataStore.getUint(keys.lentPositionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);

    // 1. user0, open long, negative price impact (-0.08)
    const positionKey0 = getPositionKey(user0.address, ethUsdMarket.marketToken, wnt.address, true);
    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey0))).eq(0);

    await handleOrder(fixture, {
      create: {
        ...params,
        account: user0,
        isLong: true,
        orderType: OrderType.MarketIncrease,
        acceptablePrice: expandDecimals(5050, 12),
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const totalPendingImpactEvent = getEventData(logs, "TotalPendingImpactAmountUpdated");
          expect(totalPendingImpactEvent.market).eq(ethUsdMarket.marketToken);
          expect(totalPendingImpactEvent.delta).eq("-79999999999999999"); // -0.08 ETH
          expect(totalPendingImpactEvent.nextValue).eq("-79999999999999999"); // -0.08 ETH

          const lentPositionImpactPoolEvent = getEventData(logs, "LentPositionImpactPoolAmountUpdated");
          expect(lentPositionImpactPoolEvent).to.be.undefined;
        },
      },
    });

    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey0))).eq("-79999999999999999"); // -0.08 ETH
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);
    expect(await dataStore.getInt(keys.totalPendingImpactAmountKey(ethUsdMarket.marketToken))).eq("-79999999999999999"); // -0.08 ETH
    expect(await dataStore.getUint(keys.lentPositionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);

    // 2. user1, open short, positive price impact (+0.04)
    const positionKey1 = getPositionKey(user1.address, ethUsdMarket.marketToken, wnt.address, false);
    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey1))).eq(0);

    await handleOrder(fixture, {
      create: {
        ...params,
        account: user1,
        isLong: false,
        orderType: OrderType.MarketIncrease,
        acceptablePrice: expandDecimals(5005, 12),
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const totalPendingImpactEvent = getEventData(logs, "TotalPendingImpactAmountUpdated");
          expect(totalPendingImpactEvent.market).eq(ethUsdMarket.marketToken);
          expect(totalPendingImpactEvent.delta).eq("39999999999999999"); // 0.04 ETH
          expect(totalPendingImpactEvent.nextValue).eq("-40000000000000000"); // -0.08 + 0.04 = -0.04 ETH

          const lentPositionImpactPoolEvent = getEventData(logs, "LentPositionImpactPoolAmountUpdated");
          expect(lentPositionImpactPoolEvent).to.be.undefined;
        },
      },
    });

    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey0))).eq("-79999999999999999"); // -0.08 ETH
    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey1))).eq("39999999999999999"); // 0.04 ETH
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);
    expect(await dataStore.getInt(keys.totalPendingImpactAmountKey(ethUsdMarket.marketToken))).eq("-40000000000000000"); // -0.08 + 0.04 = -0.04 ETH
    expect(await dataStore.getUint(keys.lentPositionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);

    // 3. user2, open short, negative price impact (-0.08)
    const positionKey2 = getPositionKey(user2.address, ethUsdMarket.marketToken, wnt.address, false);
    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey2))).eq(0);

    await handleOrder(fixture, {
      create: {
        ...params,
        account: user2,
        isLong: false,
        orderType: OrderType.MarketIncrease,
        acceptablePrice: expandDecimals(4990, 12),
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const totalPendingImpactEvent = getEventData(logs, "TotalPendingImpactAmountUpdated");
          expect(totalPendingImpactEvent.market).eq(ethUsdMarket.marketToken);
          expect(totalPendingImpactEvent.delta).eq("-79999999999999999"); // -0.08 ETH
          expect(totalPendingImpactEvent.nextValue).eq("-119999999999999999"); // -0.08 + 0.04 - 0.08 = -0.12 ETH

          const lentPositionImpactPoolEvent = getEventData(logs, "LentPositionImpactPoolAmountUpdated");
          expect(lentPositionImpactPoolEvent).to.be.undefined;
        },
      },
    });

    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey0))).eq("-79999999999999999"); // -0.08 ETH
    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey1))).eq("39999999999999999"); // 0.04 ETH
    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey2))).eq("-79999999999999999"); // -0.08 ETH
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);
    expect(await dataStore.getInt(keys.totalPendingImpactAmountKey(ethUsdMarket.marketToken))).eq(
      "-119999999999999999"
    ); // -0.08 + 0.04 - 0.08 = -0.12 ETH
    expect(await dataStore.getUint(keys.lentPositionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);

    // 4. user1, close short, positive price impact (+0.04 from increase +0.04 from decrease)
    // impact is "lent" to user because the position pool amount is 0
    await handleOrder(fixture, {
      create: { ...params, account: user1, isLong: false, orderType: OrderType.MarketDecrease },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const totalPendingImpactEvent = getEventData(logs, "TotalPendingImpactAmountUpdated");
          expect(totalPendingImpactEvent.market).eq(ethUsdMarket.marketToken);
          expect(totalPendingImpactEvent.delta).eq("-39999999999999999"); // -0.04 ETH
          expect(totalPendingImpactEvent.nextValue).eq("-159999999999999998"); // -0.12 - 0.04 = -0.16 ETH

          const lentPositionImpactPoolEvent = getEventData(logs, "LentPositionImpactPoolAmountUpdated");
          expect(lentPositionImpactPoolEvent.market).eq(ethUsdMarket.marketToken);
          expect(lentPositionImpactPoolEvent.delta).eq("79999999999999999");
          expect(lentPositionImpactPoolEvent.nextValue).eq("79999999999999999");
        },
      },
    });

    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey0))).eq("-79999999999999999"); // -0.08 ETH
    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey1))).eq(0);
    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey2))).eq("-79999999999999999"); // -0.08 ETH
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);
    expect(await dataStore.getInt(keys.totalPendingImpactAmountKey(ethUsdMarket.marketToken))).eq(
      "-159999999999999998"
    ); // -0.08 ETH
    expect(await dataStore.getUint(keys.lentPositionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "79999999999999999"
    ); // +0.04 + 0.04 = 0.08 ETH

    // 5. user0, close long, negative price impact (-0.08 from increase - 0.08 from decrease)
    await handleOrder(fixture, {
      create: {
        ...params,
        account: user0,
        isLong: true,
        orderType: OrderType.MarketDecrease,
        acceptablePrice: expandDecimals(4990, 12),
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const totalPendingImpactEvent = getEventData(logs, "TotalPendingImpactAmountUpdated");
          expect(totalPendingImpactEvent.market).eq(ethUsdMarket.marketToken);
          expect(totalPendingImpactEvent.delta).eq("79999999999999999"); // 0.08 ETH
          expect(totalPendingImpactEvent.nextValue).eq("-79999999999999999"); // -0.08 ETH

          const lentPositionImpactPoolEvent = getEventData(logs, "LentPositionImpactPoolAmountUpdated");
          expect(lentPositionImpactPoolEvent.market).eq(ethUsdMarket.marketToken);
          expect(lentPositionImpactPoolEvent.delta).eq("79999999999999999"); // 0.08 ETH
          expect(lentPositionImpactPoolEvent.nextValue).eq(0);
        },
      },
    });

    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey0))).eq(0);
    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey1))).eq(0);
    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey2))).eq("-79999999999999999"); // -0.08 ETH
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq("79999999999999999"); // 0.08 ETH
    expect(await dataStore.getInt(keys.totalPendingImpactAmountKey(ethUsdMarket.marketToken))).eq("-79999999999999999"); // -0.08 ETH
    expect(await dataStore.getUint(keys.lentPositionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);

    // 6. user2, close long, positive price impact
    await handleOrder(fixture, {
      create: {
        ...params,
        account: user2,
        isLong: false,
        orderType: OrderType.MarketDecrease,
        acceptablePrice: expandDecimals(5004, 12),
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const totalPendingImpactEvent = getEventData(logs, "TotalPendingImpactAmountUpdated");
          expect(totalPendingImpactEvent.market).eq(ethUsdMarket.marketToken);
          expect(totalPendingImpactEvent.delta).eq("79999999999999999"); // 0.08 ETH
          expect(totalPendingImpactEvent.nextValue).eq(0);

          const lentPositionImpactPoolEvent = getEventData(logs, "LentPositionImpactPoolAmountUpdated");
          expect(lentPositionImpactPoolEvent.market).eq(ethUsdMarket.marketToken);
          expect(lentPositionImpactPoolEvent.delta).eq(0);
          expect(lentPositionImpactPoolEvent.nextValue).eq(0);
        },
      },
    });

    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey0))).eq(0);
    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey1))).eq(0);
    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey2))).eq(0);
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "119999999999999999"
    ); // 0.12 ETH
    expect(await dataStore.getInt(keys.totalPendingImpactAmountKey(ethUsdMarket.marketToken))).eq(0);
    expect(await dataStore.getUint(keys.lentPositionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);
  });

  it("difference in pnl should be equal to price impact amount", async () => {
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    const marketPrices = {
      indexTokenPrice: {
        min: expandDecimals(5000, 12),
        max: expandDecimals(5000, 12),
      },
      longTokenPrice: {
        min: expandDecimals(5000, 12),
        max: expandDecimals(5000, 12),
      },
      shortTokenPrice: {
        min: expandDecimals(1, 6),
        max: expandDecimals(1, 6),
      },
    };

    const increaseOrderParams = {
      account: user0,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(5050, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseOrderParams,
      execute: {
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("5010020040080160"); // ~5010
          expect(positionIncreaseEvent.pendingPriceImpactAmount).eq("-79999999999999999"); // 0.079999999999999999 ETH, 400 USD
        },
      },
    });

    const positionKey0 = getPositionKey(user0.address, ethUsdMarket.marketToken, wnt.address, true);

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKey0,
        marketPrices,
        decimalToFloat(200_000),
        ethers.constants.AddressZero,
        false
      ),
      (positionInfo) => {
        expect(positionInfo.position.numbers.collateralAmount).eq("10000000000000000000"); // 10 ETH
        expect(positionInfo.position.numbers.sizeInTokens).eq("40000000000000000000"); // 40.0 ETH - doesn't contain the price impact
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(200_000));
      }
    );

    // check position pnl
    await usingResult(
      reader.getPositionPnlUsd(
        dataStore.address,
        ethUsdMarket,
        marketPrices,
        positionKey0,
        increaseOrderParams.sizeDeltaUsd
      ),
      (pnl) => {
        expect(pnl[0]).eq(0);
      }
    );

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);
    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey0))).eq("-79999999999999999"); // 0.079999999999999999 ETH, 400 USD

    await handleOrder(fixture, {
      create: { ...increaseOrderParams, sizeDeltaUsd: decimalToFloat(100_000) },
      execute: {
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("5025125628140703"); // ~5025.12562814
          expect(positionIncreaseEvent.pendingPriceImpactAmount).eq("-99999999999999999"); // 0.099999999999999999 ETH, 500 USD
        },
      },
    });

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKey0,
        marketPrices,
        decimalToFloat(300_000),
        ethers.constants.AddressZero,
        false
      ),
      (positionInfo) => {
        expect(positionInfo.position.numbers.collateralAmount).eq("20000000000000000000"); // 20 ETH
        expect(positionInfo.position.numbers.sizeInTokens).eq("60000000000000000000"); // 60.0 ETH
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(300_000));
      }
    );

    await usingResult(
      reader.getPositionPnlUsd(dataStore.address, ethUsdMarket, marketPrices, positionKey0, decimalToFloat(300_000)),
      (pnl) => {
        expect(pnl[0]).eq(0);
      }
    );

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);
    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey0))).eq("-179999999999999998"); // 0.179999999999999998 ETH, 900 USD

    const decreaseOrderParams = {
      account: user0,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(150 * 1000),
      acceptablePrice: expandDecimals(4950, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: 0,
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    // the position's impact pending should be -900 USD
    // closing half of the position should deduct 450 USD of ETH from the position's collateral
    // if there is a positive price impact of 337.5 USD, only 112.5 USD should be deducted from the position's collateral
    // 112.5 / 5000 => 0.0225 ETH should be deducted from the position's collateral
    await handleOrder(fixture, {
      create: decreaseOrderParams,
      execute: {
        afterExecution: ({ logs }) => {
          const positionDecreaseEvent = getEventData(logs, "PositionDecrease");
          expect(positionDecreaseEvent.executionPrice).eq("5011249999999999"); // ~5011
          expect(positionDecreaseEvent.priceImpactUsd).eq("337499999999999994450071536280000"); // 337.5
          expect(positionDecreaseEvent.basePnlUsd).eq(0);
        },
      },
    });

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKey0,
        marketPrices,
        decimalToFloat(150_000),
        ethers.constants.AddressZero,
        false
      ),
      (positionInfo) => {
        // 10 - 9.977499999999999999 => 0.0225 ETH, 112.5 USD
        expect(positionInfo.position.numbers.collateralAmount).eq("9977499999999999999"); // 10 - 0.0225 = 9.9775 ETH
        expect(positionInfo.position.numbers.sizeInTokens).eq("30000000000000000000"); // 30.0 ETH
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(150_000));
      }
    );

    await usingResult(
      reader.getPositionPnlUsd(dataStore.address, ethUsdMarket, marketPrices, positionKey0, decimalToFloat(150_000)),
      (pnl) => {
        expect(pnl[0]).eq(0);
      }
    );

    // position decreased by 50%, so the impact pending is reduced by half => 0.179999999999999998 - 0.089999999999999999 => 0.089999999999999999
    expect(await dataStore.getInt(getPendingImpactAmountKey(positionKey0))).eq("-89999999999999999"); // 0.089999999999999999 ETH, 450 USD
    // proportional impact pending from increase - impact from decrease => 450 - 337.5 => 112.5 USD => 0.0225 ETH
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq("22500000000000001"); // 0.0225 ETH, 112.5 USD
  });
});
