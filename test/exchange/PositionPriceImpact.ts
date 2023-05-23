import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, getOrderCount, handleOrder } from "../../utils/order";
import { getPositionCount, getAccountPositionCount, getPositionKeys } from "../../utils/position";
import { getExecuteParams } from "../../utils/exchange";
import { getEventData } from "../../utils/event";
import * as keys from "../../utils/keys";

describe("Exchange.PositionPriceImpact", () => {
  let fixture;
  let user0, user1;
  let reader, dataStore, ethUsdMarket, btcUsdMarket, wnt, wbtc, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ reader, dataStore, ethUsdMarket, btcUsdMarket, wnt, wbtc, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(2000 * 1000, 6),
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

  it("price impact", async () => {
    // set price impact to 0.1% for every $50,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 50,000 => 2 * (10 ** -8)
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 8));
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
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

    // increase long position was executed with price above oracle price
    // the impact pool amount should increase
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq("79999999999999998"); // 0.079999999999999998 ETH, 400 USD

    let positionKeys = await getPositionKeys(dataStore, 0, 10);
    const position0 = await reader.getPosition(dataStore.address, positionKeys[0]);
    expect(position0.numbers.sizeInUsd).eq(decimalToFloat(200 * 1000));
    // 200,000 / 5010.020040080160 => 39.92
    expect(position0.numbers.sizeInTokens).eq("39920000000000002554"); // 39.920000000000002554 ETH

    await handleOrder(fixture, {
      create: { ...params, account: user1, acceptablePrice: expandDecimals(5020, 12) },
      execute: {
        expectedCancellationReason: "OrderNotFulfillableDueToPriceImpact",
      },
    });

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq("79999999999999998"); // 0.079999999999999998 ETH, 400 USD

    await handleOrder(fixture, {
      create: { ...params, account: user1, acceptablePrice: expandDecimals(5050, 12) },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("5030181086519114"); // ~5030
        },
      },
    });

    // increase long position was executed with price above oracle price
    // the impact pool amount should increase
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "319999999999999993"
    ); // 0.319999999999999993 ETH, 1600 USD

    expect(await getAccountPositionCount(dataStore, user1.address)).eq(1);
    expect(await getPositionCount(dataStore)).eq(2);

    positionKeys = await getPositionKeys(dataStore, 0, 10);
    const position1 = await reader.getPosition(dataStore.address, positionKeys[1]);

    expect(position1.numbers.sizeInUsd).eq(decimalToFloat(200 * 1000));
    // 200,000 / 5029.999999999999 => 39.7614314115
    expect(position1.numbers.sizeInTokens).eq("39760000000000005439"); // 39.760000000000005439 ETH

    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 4));

    await handleOrder(fixture, {
      create: { ...params, isLong: false, sizeDeltaUsd: decimalToFloat(500 * 1000) },
      execute: {
        gasUsageLabel: "executeOrder",
        expectedCancellationReason: "PriceImpactLargerThanOrderSize",
      },
    });

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "318408907830462392"
    ); // 0.318408907830462392 ETH, 1592.04453915 USD

    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));

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
          expect(positionIncreaseEvent.executionPrice).eq("5019750000000000"); // 5019.75
        },
      },
    });

    // increase short position was executed with price above oracle price
    // the impact pool amount should decrease
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "310539990055672810"
    ); // 0.310539990055672810 ETH, 1552.69995028 USD

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
          expect(positionDecreaseEvent.pnlUsd).eq("-39344588873947906550500000000000"); // -39.3445888739
        },
      },
    });

    // decrease short position was executed with price above oracle price
    // the impact pool amount should increase
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "326216148404715373"
    ); // 0.326216148404715373 ETH, 1631.08074202 USD

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
          expect(positionIncreaseEvent.executionPrice).eq("5006999999999999"); // ~5007
        },
      },
    });

    // increase short position was executed with price above oracle price
    // the impact pool amount should decrease
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "186411874388338275"
    ); // 0.186411874388338275 ETH, 932.059371942 USD

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
          expect(positionIncreaseEvent.executionPrice).eq("4985000000000000"); // ~4985
        },
      },
    });

    // increase short position was executed with price below oracle price
    // the impact pool amount should increase
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "246592416013212897"
    ); // 0.246592416013212897 ETH, 1232.96208007 USD

    await handleOrder(fixture, {
      create: {
        ...params,
        sizeDeltaUsd: decimalToFloat(100 * 1000),
        acceptablePrice: expandDecimals(5000, 12),
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("4992500000000000"); // ~4992.5
        },
      },
    });

    // increase long position was executed with price below oracle price
    // the impact pool amount should decrease
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "216547348411810794"
    ); // 0.216547348411810794 ETH, 1082.73674206 USD
  });

  // it("capped price impact", async () => {
  //   // set price impact to 0.1% for every $50,000 of token imbalance
  //   // 0.1% => 0.001
  //   // 0.001 / 50,000 => 2 * (10 ** -8)
  //   await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 8));
  //   await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
  //   await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));
  //
  //   expect(await getOrderCount(dataStore)).eq(0);
  //
  //   const params = {
  //     account: user0,
  //     market: ethUsdMarket,
  //     initialCollateralToken: wnt,
  //     initialCollateralDeltaAmount: expandDecimals(10, 18),
  //     swapPath: [],
  //     sizeDeltaUsd: decimalToFloat(200 * 1000),
  //     acceptablePrice: expandDecimals(5050, 12),
  //     executionFee: expandDecimals(1, 15),
  //     minOutputAmount: expandDecimals(50000, 6),
  //     orderType: OrderType.MarketIncrease,
  //     isLong: true,
  //     shouldUnwrapNativeToken: false,
  //   };
  //
  //   await handleOrder(fixture, {
  //     create: params,
  //     execute: {
  //       gasUsageLabel: "executeOrder",
  //       afterExecution: ({ logs }) => {
  //         const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
  //         expect(positionIncreaseEvent.executionPrice).eq("5010020040080160"); // ~5010
  //       },
  //     },
  //   });
  //
  //   await handleOrder(fixture, {
  //     create: { ...params, isLong: false, acceptablePrice: expandDecimals(4950, 12) },
  //     execute: {
  //       gasUsageLabel: "executeOrder",
  //       afterExecution: ({ logs }) => {
  //         const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
  //         expect(positionIncreaseEvent.executionPrice).eq("5005005005005005"); // ~5005
  //       },
  //     },
  //   });
  //
  //   await dataStore.setUint(keys.maxPositionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 4));
  //
  //   await handleOrder(fixture, {
  //     create: params,
  //     execute: {
  //       gasUsageLabel: "executeOrder",
  //       afterExecution: ({ logs }) => {
  //         const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
  //         expect(positionIncreaseEvent.executionPrice).eq("5010020040080160"); // ~5010
  //       },
  //     },
  //   });
  //
  //   await handleOrder(fixture, {
  //     create: { ...params, isLong: false, acceptablePrice: expandDecimals(4950, 12) },
  //     execute: {
  //       gasUsageLabel: "executeOrder",
  //       afterExecution: ({ logs }) => {
  //         const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
  //         expect(positionIncreaseEvent.executionPrice).eq("5000500050005000"); // ~5000.5
  //       },
  //     },
  //   });
  // });
});
