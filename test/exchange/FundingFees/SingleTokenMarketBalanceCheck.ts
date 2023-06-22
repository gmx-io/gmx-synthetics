import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { handleDeposit } from "../../../utils/deposit";
import { OrderType, handleOrder } from "../../../utils/order";
import { getEventData, getEventDataArray } from "../../../utils/event";
import * as keys from "../../../utils/keys";

describe("Exchange.FundingFees.SingleTokenMarketBalanceCheck", () => {
  let fixture;
  let user0, user1, user2, user3, user4;
  let dataStore, ethUsdSingleTokenMarket, exchangeRouter, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3, user4 } = fixture.accounts);
    ({ dataStore, ethUsdSingleTokenMarket, exchangeRouter, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdSingleTokenMarket,
        longTokenAmount: expandDecimals(5_000_000, 6),
        shortTokenAmount: expandDecimals(5_000_000, 6),
      },
    });
  });

  it("funding fees after funding switches sides", async () => {
    await dataStore.setUint(keys.fundingFactorKey(ethUsdSingleTokenMarket.marketToken), decimalToFloat(1, 7));
    await dataStore.setUint(keys.fundingExponentFactorKey(ethUsdSingleTokenMarket.marketToken), decimalToFloat(1));

    expect(await dataStore.getUint(keys.fundingUpdatedAtKey(ethUsdSingleTokenMarket.marketToken))).eq(0);

    // ORDER 1
    // user0 opens a $200k long position, using usdc as collateral
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50_000, 6),
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

    // ORDER 2
    // user1 opens a $100k long position, using usdc as collateral
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100_000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    // ORDER 3
    // user2 opens a $100k long position, using usdc as collateral
    await handleOrder(fixture, {
      create: {
        account: user2,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100_000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    // ORDER 4
    // user3 opens a $100k short position, using usdc as collateral
    await handleOrder(fixture, {
      create: {
        account: user3,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(25_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100_000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    // ORDER 5
    // user4 opens a $100k short position, using usdc as collateral
    await handleOrder(fixture, {
      create: {
        account: user4,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(25_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100_000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    expect(await dataStore.getUint(keys.openInterestKey(ethUsdSingleTokenMarket.marketToken, usdc.address, true))).eq(
      decimalToFloat(400_000)
    );
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdSingleTokenMarket.marketToken, usdc.address, false))).eq(
      decimalToFloat(200_000)
    );

    expect(await dataStore.getUint(keys.collateralSumKey(ethUsdSingleTokenMarket.marketToken, usdc.address, true))).eq(
      expandDecimals(150_000, 6)
    );
    expect(await dataStore.getUint(keys.collateralSumKey(ethUsdSingleTokenMarket.marketToken, usdc.address, false))).eq(
      expandDecimals(50_000, 6)
    );

    await time.increase(14 * 24 * 60 * 60);

    // ORDER 6
    // user0 closes the long position
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
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

    // ORDER 6
    // user0 opens a $200k short position
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    // ORDER 7
    // user1 decreases the long position by $1
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(1),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        afterExecution: async ({ logs }) => {
          const feeInfo = getEventData(logs, "PositionFeesCollected");
          expect(feeInfo.fundingFeeAmount).closeTo("4032040000", "100000"); // 4032.04 USD
          expect(feeInfo.collateralToken).eq(usdc.address);
          const claimableFundingData = getEventDataArray(logs, "ClaimableFundingUpdated");
          expect(claimableFundingData.length).eq(2);
          expect(claimableFundingData[0].token).eq(usdc.address);
          expect(claimableFundingData[0].delta).closeTo(0, "1000000000000");
        },
      },
    });

    // ORDER 8
    // user4 increases the short position by $1
    await handleOrder(fixture, {
      create: {
        account: user4,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(1),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        afterExecution: async ({ logs }) => {
          const feeInfo = getEventData(logs, "PositionFeesCollected");
          expect(feeInfo.fundingFeeAmount).closeTo(0, 100000);
          expect(feeInfo.collateralToken).eq(usdc.address);
        },
      },
    });

    expect(await dataStore.getUint(keys.openInterestKey(ethUsdSingleTokenMarket.marketToken, usdc.address, true))).eq(
      decimalToFloat(199_999)
    );
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdSingleTokenMarket.marketToken, usdc.address, false))).eq(
      decimalToFloat(400_001)
    );

    await time.increase(28 * 24 * 60 * 60);

    expect(await usdc.balanceOf(user0.address)).closeTo("41935920000", "100000"); // 41,935.92
    expect(await usdc.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user2.address)).eq(0);
    expect(await usdc.balanceOf(user3.address)).eq(0);
    expect(await usdc.balanceOf(user4.address)).eq(0);

    // ORDER 9
    // user0 closes their position
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    // ORDER 10
    // user1 closes their position
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(99_999),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    // ORDER 11
    // user2 closes their position
    await handleOrder(fixture, {
      create: {
        account: user2,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100_000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    // ORDER 12
    // user3 closes their position
    await handleOrder(fixture, {
      create: {
        account: user3,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100_000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    // ORDER 13
    // user4 closes their position
    await handleOrder(fixture, {
      create: {
        account: user4,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100_001),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    expect(await usdc.balanceOf(user0.address)).closeTo("75807692052", "1000000"); // 75,807.692052
    expect(await usdc.balanceOf(user1.address)).closeTo("45967960000", "1000000"); // 45,967.96
    expect(await usdc.balanceOf(user2.address)).closeTo("45967960000", "1000000"); // 45,967.96
    expect(await usdc.balanceOf(user3.address)).closeTo("16935876026", "1000000"); // 16,935.876026
    expect(await usdc.balanceOf(user4.address)).closeTo("16935795384", "1000000"); // 16,935.795384

    expect(await dataStore.getUint(keys.openInterestKey(ethUsdSingleTokenMarket.marketToken, usdc.address, true))).eq(
      0
    );
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdSingleTokenMarket.marketToken, usdc.address, false))).eq(
      0
    );
    expect(await dataStore.getUint(keys.collateralSumKey(ethUsdSingleTokenMarket.marketToken, usdc.address, true))).eq(
      0
    );
    expect(await dataStore.getUint(keys.collateralSumKey(ethUsdSingleTokenMarket.marketToken, usdc.address, false))).eq(
      0
    );

    const users = [user0, user1, user2, user3, user4];
    for (let i = 0; i < users.length; i++) {
      await exchangeRouter
        .connect(users[i])
        .claimFundingFees([ethUsdSingleTokenMarket.marketToken], [usdc.address], users[i].address);
    }

    // total initial collateral amount: 50,000 + 50,000 = 100,000
    // diff: 75,807.692052 - 100,000 = -24,192.307948
    expect(await usdc.balanceOf(user0.address)).closeTo("75807692052", "1000000"); // 75,807.692052

    // initial collateral amount: 50,000, diff: 62,096.147624 - 50,000 = 12,096.147624
    expect(await usdc.balanceOf(user1.address)).closeTo("62096147624", "1000000"); // 62,096.147624

    // initial collateral amount: 50,000, diff: 62,096.328908 - 50,000 = 12,096.328908
    expect(await usdc.balanceOf(user2.address)).closeTo("62096328908", "1000000"); // 62,096.328908

    // initial collateral amount: 25,000, diff: 25,000.016024 - 25,000 = 0.016024
    expect(await usdc.balanceOf(user3.address)).closeTo("25000016024", "1000000"); // 25000.016024

    // initial collateral amount: 25,000, diff: 24,999.815382 - 25,000 = -0.18461799999
    expect(await usdc.balanceOf(user4.address)).closeTo("24999815382", "1000000"); // 24,999.815382

    // total USDC collateral: 100,000 (user0) + 50,000 (user1) + 50,000 (user2) + 25,000 (user3) + 25,000 (user4) = 250,000 USDC
    expect(
      (await usdc.balanceOf(user0.address))
        .add(await usdc.balanceOf(user1.address))
        .add(await usdc.balanceOf(user2.address))
        .add(await usdc.balanceOf(user3.address))
        .add(await usdc.balanceOf(user4.address))
    ).closeTo("249999999990", "10"); // 249,999.99999
  });
});
