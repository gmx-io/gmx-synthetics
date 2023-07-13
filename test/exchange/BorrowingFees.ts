import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { usingResult } from "../../utils/use";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { getPositionCount, getAccountPositionCount, getPositionKeys } from "../../utils/position";
import { getMarketTokenPriceWithPoolValue } from "../../utils/market";
import { prices } from "../../utils/prices";
import * as keys from "../../utils/keys";

describe("Exchange.BorrowingFees", () => {
  const { provider } = ethers;
  let fixture;
  let user0, user1;
  let reader, dataStore, referralStorage, ethUsdMarket, ethUsdSingleTokenMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ reader, dataStore, referralStorage, ethUsdMarket, ethUsdSingleTokenMarket, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1_000_000, 6),
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: ethUsdSingleTokenMarket,
        longTokenAmount: expandDecimals(5_000_000, 6),
        shortTokenAmount: expandDecimals(5_000_000, 6),
      },
    });
  });

  it("borrowing fees", async () => {
    await dataStore.setUint(keys.borrowingFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 7));
    await dataStore.setUint(keys.borrowingFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 7));
    await dataStore.setUint(keys.borrowingExponentFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1));
    await dataStore.setUint(keys.borrowingExponentFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1));

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(6_000_000));
      }
    );

    expect(await dataStore.getUint(keys.cumulativeBorrowingFactorUpdatedAtKey(ethUsdMarket.marketToken, true))).eq(0);

    // user0 increase long position by $200k
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    // user1 increase short position by $150k
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(10_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(150_000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).closeTo("1000000000533333333333333333333", "1000000000000000000000"); // 1.00000000053
        expect(poolValueInfo.poolValue).closeTo(
          "6000000003200000000000000000000000000",
          "10000000000000000000000000000"
        ); // 6000000.0032
      }
    );

    const block = await provider.getBlock();
    expect(await dataStore.getUint(keys.cumulativeBorrowingFactorUpdatedAtKey(ethUsdMarket.marketToken, true))).closeTo(
      block.timestamp,
      100
    );

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    expect(await getAccountPositionCount(dataStore, user1.address)).eq(1);
    expect(await getPositionCount(dataStore)).eq(2);

    await time.increase(14 * 24 * 60 * 60);

    const positionKeys = await getPositionKeys(dataStore, 0, 10);
    const position0 = await reader.getPositionInfo(
      dataStore.address,
      referralStorage.address,
      positionKeys[0],
      prices.ethUsdMarket,
      0, // sizeDeltaUsd
      ethers.constants.AddressZero,
      true // usePositionSizeAsSizeDeltaUsd
    );
    const position1 = await reader.getPositionInfo(
      dataStore.address,
      referralStorage.address,
      positionKeys[1],
      prices.ethUsdMarket,
      0, // sizeDeltaUsd
      ethers.constants.AddressZero,
      true // usePositionSizeAsSizeDeltaUsd
    );

    expect(position0.fees.borrowing.borrowingFeeUsd).closeTo(
      "967684000000000000000000000000000",
      decimalToFloat(10, 3)
    ); // $967.684

    expect(position1.fees.borrowing.borrowingFeeUsd).closeTo(
      "5443200000000000000000000000000000",
      decimalToFloat(10, 3)
    ); // $5443.2

    expect(await dataStore.getUint(keys.cumulativeBorrowingFactorKey(ethUsdMarket.marketToken, true))).closeTo(
      0,
      "20000000000000000000000"
    );
    expect(await dataStore.getUint(keys.cumulativeBorrowingFactorKey(ethUsdMarket.marketToken, false))).eq(0);

    // user0 increase long position by $1000
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(1, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(1000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    expect(await dataStore.getUint(keys.cumulativeBorrowingFactorKey(ethUsdMarket.marketToken, true))).closeTo(
      "4838432000000000000000000000",
      decimalToFloat(10, 8)
    );
    expect(await dataStore.getUint(keys.cumulativeBorrowingFactorKey(ethUsdMarket.marketToken, false))).eq(
      "36288120000000000000000000000"
    );

    // user1 increase short position by $1000
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(5000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(1000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    expect(await dataStore.getUint(keys.cumulativeBorrowingFactorKey(ethUsdMarket.marketToken, true))).closeTo(
      "4838432000000000000000000000",
      decimalToFloat(10, 8)
    ); // 0.004838432

    expect(await dataStore.getUint(keys.cumulativeBorrowingFactorKey(ethUsdMarket.marketToken, false))).closeTo(
      "36288240000000000000000000000",
      decimalToFloat(10, 8)
    ); // 0.03628824

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).closeTo("1001068487605242432177935697848", "10000000000000000000000"); // 1.00106848761
        expect(poolValueInfo.poolValue).closeTo(
          "6006410925631454593067614187093608000",
          "100000000000000000000000000000"
        ); // 6006410.92563
      }
    );

    // user0 close long position
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(201_000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    // user1 close short position
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(151_000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).closeTo("1001068492544674256310833333333", "1000000000000000000000"); // 1.00106849254
        expect(poolValueInfo.poolValue).closeTo(
          "6006410955268045537865000000000000000",
          "100000000000000000000000000000"
        ); // 6006410.95527
      }
    );
  });

  it("borrowing fees vary with time", async () => {
    await dataStore.setUint(keys.borrowingFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 7));
    await dataStore.setUint(keys.borrowingFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 7));
    await dataStore.setUint(keys.borrowingExponentFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1));
    await dataStore.setUint(keys.borrowingExponentFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1));

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(6_000_000));
      }
    );

    expect(await dataStore.getUint(keys.cumulativeBorrowingFactorUpdatedAtKey(ethUsdMarket.marketToken, true))).eq(0);

    // user0 increase long position by $200k
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("1000000000000000000000000000000"); // 1
        expect(poolValueInfo.poolValue).eq("6000000000000000000000000000000000000"); // 6,000,000
      }
    );

    await time.increase(14 * 24 * 60 * 60);

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("1000161280000000000000000000000"); // 1.00016128
        expect(poolValueInfo.poolValue).eq("6000967680000000000000000000000000000"); // 6,000,967.68
      }
    );

    let positionKeys = await getPositionKeys(dataStore, 0, 10);

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKeys[0],
        prices.ethUsdMarket,
        0, // sizeDeltaUsd
        ethers.constants.AddressZero,
        true // usePositionSizeAsSizeDeltaUsd
      ),
      (position) => {
        expect(position.fees.borrowing.borrowingFeeUsd).closeTo(
          "967680000000000000000000000000000",
          decimalToFloat(10, 3)
        ); // 967.68
      }
    );

    // user1 increase long position by $200k
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(10_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    await time.increase(14 * 24 * 60 * 60);

    positionKeys = await getPositionKeys(dataStore, 0, 10);

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKeys[0],
        prices.ethUsdMarket,
        0, // sizeDeltaUsd
        ethers.constants.AddressZero,
        true // usePositionSizeAsSizeDeltaUsd
      ),
      (position) => {
        expect(position.fees.borrowing.borrowingFeeUsd).closeTo(
          "2903043200000000000000000000000000",
          decimalToFloat(10, 3)
        ); // 2903.0432, 2903.0432 - 967.68 = 1935.3632
      }
    );

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKeys[1],
        prices.ethUsdMarket,
        0, // sizeDeltaUsd
        ethers.constants.AddressZero,
        true // usePositionSizeAsSizeDeltaUsd
      ),
      (position) => {
        expect(position.fees.borrowing.borrowingFeeUsd).closeTo(
          "1935360000000000000000000000000000",
          decimalToFloat(10, 3)
        ); // 1935.36
      }
    );

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("1000806400533333333333333333333"); // 1.00080640053
        expect(poolValueInfo.poolValue).eq("6004838403200000000000000000000000000"); // 6,004,838.4032
      }
    );

    // user0 close long position
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    // user1 close long position
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).closeTo("1000806402533000000000000000000", "10000000000000000000000"); // 1.00080640253
        expect(poolValueInfo.poolValue).closeTo(
          "6004838415198000000000000000000000000",
          "100000000000000000000000000000"
        ); // 6,004,838.4152
      }
    );
  });

  it("single token market", async () => {
    await dataStore.setUint(keys.borrowingFactorKey(ethUsdSingleTokenMarket.marketToken, true), decimalToFloat(1, 7));
    await dataStore.setUint(keys.borrowingFactorKey(ethUsdSingleTokenMarket.marketToken, false), decimalToFloat(2, 7));
    await dataStore.setUint(
      keys.borrowingExponentFactorKey(ethUsdSingleTokenMarket.marketToken, true),
      decimalToFloat(1)
    );
    await dataStore.setUint(
      keys.borrowingExponentFactorKey(ethUsdSingleTokenMarket.marketToken, false),
      decimalToFloat(1)
    );

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, {
        market: ethUsdSingleTokenMarket,
        prices: prices.ethUsdSingleTokenMarket,
      }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(10_000_000));
      }
    );

    expect(
      await dataStore.getUint(keys.cumulativeBorrowingFactorUpdatedAtKey(ethUsdSingleTokenMarket.marketToken, true))
    ).eq(0);

    // user0 increase long position by $200k
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, {
        market: ethUsdSingleTokenMarket,
        prices: prices.ethUsdSingleTokenMarket,
      }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(10_000_000));
      }
    );

    await time.increase(14 * 24 * 60 * 60);

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, {
        market: ethUsdSingleTokenMarket,
        prices: prices.ethUsdSingleTokenMarket,
      }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("1000096768000000000000000000000"); // 1.000096768
        expect(poolValueInfo.poolValue).eq("10000967680000000000000000000000000000"); // 10,000,967.68
      }
    );

    let positionKeys = await getPositionKeys(dataStore, 0, 10);

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKeys[0],
        prices.ethUsdSingleTokenMarket,
        0, // sizeDeltaUsd
        ethers.constants.AddressZero,
        true // usePositionSizeAsSizeDeltaUsd
      ),
      (position) => {
        expect(position.fees.borrowing.borrowingFeeUsd).closeTo(
          "967680000000000000000000000000000",
          decimalToFloat(10, 3)
        ); // 967.68
      }
    );

    // user1 increase long position by $200k
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(10_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    await time.increase(14 * 24 * 60 * 60);

    positionKeys = await getPositionKeys(dataStore, 0, 10);

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKeys[0],
        prices.ethUsdSingleTokenMarket,
        0, // sizeDeltaUsd
        ethers.constants.AddressZero,
        true // usePositionSizeAsSizeDeltaUsd
      ),
      (position) => {
        expect(position.fees.borrowing.borrowingFeeUsd).closeTo(
          "2903043200000000000000000000000000",
          decimalToFloat(10, 3)
        ); // 2903.0432, 2903.0432 - 967.68 = 1935.3632
      }
    );

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKeys[1],
        prices.ethUsdSingleTokenMarket,
        0, // sizeDeltaUsd
        ethers.constants.AddressZero,
        true // usePositionSizeAsSizeDeltaUsd
      ),
      (position) => {
        expect(position.fees.borrowing.borrowingFeeUsd).closeTo(
          "1935360000000000000000000000000000",
          decimalToFloat(10, 3)
        ); // 1935.36
      }
    );

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, {
        market: ethUsdSingleTokenMarket,
        prices: prices.ethUsdSingleTokenMarket,
      }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("1000483840320000000000000000000"); // 1.00048384032
        expect(poolValueInfo.poolValue).eq("10004838403200000000000000000000000000"); // 10,004,838.4032
      }
    );

    // user0 close long position
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    // user1 close long position
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, {
        market: ethUsdSingleTokenMarket,
        prices: prices.ethUsdSingleTokenMarket,
      }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).closeTo("1000483841519800000000000000000", "100000000000000000000"); // 1.00048384152
        expect(poolValueInfo.poolValue).eq("10004838415198000000000000000000000000", decimalToFloat(1, 2)); // 10,004,838.4152
      }
    );
  });
});
