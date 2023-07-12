import { expect } from "chai";

import { usingResult } from "../../../utils/use";
import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { handleDeposit } from "../../../utils/deposit";
import { OrderType, getOrderCount, handleOrder } from "../../../utils/order";
import { getPositionCount, getAccountPositionCount, getPositionKeys, getPositionKey } from "../../../utils/position";
import { getEventData } from "../../../utils/event";
import * as keys from "../../../utils/keys";

describe("Exchange.PositionPriceImpact.PairMarket", () => {
  let fixture;
  let user0, user1;
  let reader, dataStore, referralStorage, ethUsdMarket, wnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ reader, dataStore, referralStorage, ethUsdMarket, wnt } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(2000 * 1000, 6),
      },
    });
  });

  it("price impact", async () => {
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
          expect(positionIncreaseEvent.priceImpactUsd).eq("-399999999999999992588018713340000"); // -400
        },
      },
    });

    // increase long position was executed with price above oracle price
    // the impact pool amount should increase
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq("79999999999999999"); // 0.079999999999999999 ETH, 400 USD

    let positionKeys = await getPositionKeys(dataStore, 0, 10);
    const position0 = await reader.getPosition(dataStore.address, positionKeys[0]);
    expect(position0.numbers.sizeInUsd).eq(decimalToFloat(200 * 1000));
    // 200,000 / 5010.020040080160 => 39.92
    expect(position0.numbers.sizeInTokens).eq("39920000000000000001"); // 39.920000000000000001 ETH

    await handleOrder(fixture, {
      create: { ...params, account: user1, acceptablePrice: expandDecimals(5020, 12) },
      execute: {
        expectedCancellationReason: "OrderNotFulfillableAtAcceptablePrice",
      },
    });

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq("79999999999999999"); // 0.079999999999999999 ETH, 400 USD

    // increase long position, negative price impact
    await handleOrder(fixture, {
      create: { ...params, account: user1, acceptablePrice: expandDecimals(5050, 12) },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("5030181086519114"); // ~5030
          expect(positionIncreaseEvent.priceImpactUsd).eq("-1199999999999999977764056140040000"); // -1200
        },
      },
    });

    // increase long position was executed with price above oracle price
    // the impact pool amount should increase
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "319999999999999995"
    ); // 0.319999999999999995 ETH, 1600 USD

    expect(await getAccountPositionCount(dataStore, user1.address)).eq(1);
    expect(await getPositionCount(dataStore)).eq(2);

    positionKeys = await getPositionKeys(dataStore, 0, 10);
    const position1 = await reader.getPosition(dataStore.address, positionKeys[1]);

    expect(position1.numbers.sizeInUsd).eq(decimalToFloat(200 * 1000));
    // 200,000 / 5029.999999999999 => 39.7614314115
    expect(position1.numbers.sizeInTokens).eq("39760000000000000004"); // 39.760000000000000004 ETH

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

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "319999999999999995"
    ); // 0.319999999999999995 ETH, 1600 USD

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
          expect(positionIncreaseEvent.priceImpactUsd).eq("39500000000000000326409486835000"); // 39.5
        },
      },
    });

    // increase short position was executed with price above oracle price
    // the impact pool amount should decrease
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "312099999999999995"
    ); // 0.312099999999999995 ETH, 1560.5 USD

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
          expect(positionDecreaseEvent.executionPrice).eq("5039656643742783"); // 5039.65664374
          expect(positionDecreaseEvent.basePnlUsd).eq("39500000000000000000000000000000"); // 39.5
          expect(positionDecreaseEvent.priceImpactUsd).eq("-79000000000000000652818973670000"); // -79
        },
      },
    });

    // decrease short position was executed with price above oracle price
    // the impact pool amount should increase
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "327899999999999996"
    ); // 0.327899999999999996 ETH, 1639.5 USD

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
          expect(positionIncreaseEvent.priceImpactUsd).eq("699999999999999987029032748360000"); // 700
        },
      },
    });

    // increase short position was executed with price above oracle price
    // the impact pool amount should decrease
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "187899999999999999"
    ); // 0.187899999999999999 ETH, 939.5 USD

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
          expect(positionIncreaseEvent.priceImpactUsd).eq("-299999999999999994441014035010000"); // -300
        },
      },
    });

    // increase short position was executed with price below oracle price
    // the impact pool amount should increase
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "247899999999999998"
    ); // 0.247899999999999998 ETH, 1239.5 USD

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
          expect(positionIncreaseEvent.priceImpactUsd).eq("199999999999999996294009356670000"); // 200
        },
      },
    });

    // increase long position was executed with price below oracle price
    // the impact pool amount should decrease
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "207899999999999999"
    ); // 0.207899999999999999 ETH, 1039.5 USD

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
          expect(positionIncreaseEvent.priceImpactUsd).eq("-99999999999999998147004678330000"); // -100
        },
      },
    });

    // increase long position was executed with price above oracle price
    // the impact pool amount should increase
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "227899999999999999"
    ); // 0.227899999999999999 ETH, 1139.5 USD

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
          expect(positionDecreaseEvent.executionPrice).eq("5002501500900540"); // ~5002.5
          expect(positionDecreaseEvent.priceImpactUsd).eq("49999999999999999073502339165000"); // 50
        },
      },
    });

    // decrease long position was executed with price above oracle price
    // the impact pool amount should decrease
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "217899999999999999"
    ); // 0.217899999999999999 ETH, 1089.5 USD

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
          expect(positionDecreaseEvent.executionPrice).eq("4994996998198920"); // ~4994.9
          expect(positionDecreaseEvent.priceImpactUsd).eq("-99999999999999998147004678330000"); // -100
        },
      },
    });

    // decrease long position was executed with price below oracle price
    // the impact pool amount should increase
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "237899999999999999"
    ); // 0.237899999999999999 ETH, 1189.5 USD

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
          expect(positionDecreaseEvent.executionPrice).eq("4997498332221481"); // ~4997.4
          expect(positionDecreaseEvent.priceImpactUsd).eq("49999999999999999073502339165000"); // 50
        },
      },
    });

    // decrease short position was executed with price below oracle price
    // the impact pool amount should decrease
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "227899999999999999"
    ); // 0.227899999999999999 ETH, 1139.5 USD
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
          expect(positionIncreaseEvent.priceImpactUsd).eq("199999999999999996294009356670000"); // 200
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
          expect(positionIncreaseEvent.priceImpactUsd).eq("-399999999999999992588018713340000"); // -400
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
          expect(positionIncreaseEvent.priceImpactUsd).eq("20000000000000000000000000000000"); // 20
        },
      },
    });
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
          expect(positionIncreaseEvent.priceImpactAmount).eq("-79999999999999999"); // 0.079999999999999999 ETH, 400 USD
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
        expect(positionInfo.position.numbers.sizeInTokens).eq("39920000000000000001"); // 39.920000000000000001 ETH
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
        expect(pnl[0]).eq("-399999999999999995000000000000000"); // -400 USD
      }
    );

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq("79999999999999999"); // 0.079999999999999999 ETH, 400 USD

    await handleOrder(fixture, {
      create: { ...increaseOrderParams, sizeDeltaUsd: decimalToFloat(100_000) },
      execute: {
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("5025125628140703"); // ~5025.12562814
          expect(positionIncreaseEvent.priceImpactAmount).eq("-99999999999999999"); // 0.099999999999999999 ETH, 500 USD
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
        expect(positionInfo.position.numbers.sizeInTokens).eq("59820000000000000002"); // 59.820000000000000002 ETH
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(300_000));
      }
    );

    await usingResult(
      reader.getPositionPnlUsd(dataStore.address, ethUsdMarket, marketPrices, positionKey0, decimalToFloat(300_000)),
      (pnl) => {
        expect(pnl[0]).eq("-899999999999999990000000000000000"); // -900 USD
      }
    );

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "179999999999999998"
    ); // 0.179999999999999998 ETH, 900 USD

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

    // the position's total pnl should be -900 USD
    // closing half of the position should deduct 450 USD of ETH from the position's collateral
    // if there is a positive price impact of 337.5 USD, only 112.5 USD should be deducted from the position's collateral
    // 112.5 / 5000 => 0.0225 ETH should be deducted from the position's collateral
    await handleOrder(fixture, {
      create: decreaseOrderParams,
      execute: {
        afterExecution: ({ logs }) => {
          const positionDecreaseEvent = getEventData(logs, "PositionDecrease");
          expect(positionDecreaseEvent.executionPrice).eq("5011283851554663"); // ~5011.28385155
          expect(positionDecreaseEvent.priceImpactUsd).eq("337499999999999994450071536280000"); // 337.5 USD
          expect(positionDecreaseEvent.basePnlUsd).eq("-449999999999999995000000000000000"); // -450
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
        expect(positionInfo.position.numbers.collateralAmount).eq("9977499999999999999"); // 9.977499999999999999 ETH
        expect(positionInfo.position.numbers.sizeInTokens).eq("29910000000000000001"); // 29.910000000000000001 ETH
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(150_000));
      }
    );

    await usingResult(
      reader.getPositionPnlUsd(dataStore.address, ethUsdMarket, marketPrices, positionKey0, decimalToFloat(150_000)),
      (pnl) => {
        expect(pnl[0]).eq("-449999999999999995000000000000000"); // -450 USD
      }
    );

    // 900 - 337.5 => 562.5
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "112499999999999999"
    ); // 0.179999999999999998 - 0.067499999999999999 => 0.112499999999999999 ETH, 562.5 USD
  });
});
