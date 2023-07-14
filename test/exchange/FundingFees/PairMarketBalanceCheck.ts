import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { handleDeposit } from "../../../utils/deposit";
import { OrderType, handleOrder } from "../../../utils/order";
import { getEventData, getEventDataArray } from "../../../utils/event";
import * as keys from "../../../utils/keys";

describe("Exchange.FundingFees.PairMarketBalanceCheck", () => {
  let fixture;
  let user0, user1, user2, user3, user4;
  let dataStore, ethUsdMarket, ethUsdSingleTokenMarket, exchangeRouter, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3, user4 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, ethUsdSingleTokenMarket, exchangeRouter, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10_000, 18),
        shortTokenAmount: expandDecimals(5_000_000, 6),
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

  it("funding fees after funding switches sides", async () => {
    await dataStore.setUint(keys.fundingFactorKey(ethUsdMarket.marketToken), decimalToFloat(1, 7));
    await dataStore.setUint(keys.fundingExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(1));

    expect(await dataStore.getUint(keys.fundingUpdatedAtKey(ethUsdMarket.marketToken))).eq(0);

    // ORDER 1
    // user0 opens a $200k long position, using wnt as collateral
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

    // ORDER 2
    // user1 opens a $100k long position, using wnt as collateral
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
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
        market: ethUsdMarket,
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
    // user3 opens a $100k short position, using wnt as collateral
    await handleOrder(fixture, {
      create: {
        account: user3,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(5, 18),
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
    // user4 opens a $100k short position, using wnt as collateral
    await handleOrder(fixture, {
      create: {
        account: user4,
        market: ethUsdMarket,
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

    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, true))).eq(
      decimalToFloat(300_000)
    );
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, true))).eq(
      decimalToFloat(100_000)
    );
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, false))).eq(
      decimalToFloat(100_000)
    );
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, false))).eq(
      decimalToFloat(100_000)
    );

    expect(await dataStore.getUint(keys.collateralSumKey(ethUsdMarket.marketToken, wnt.address, true))).eq(
      expandDecimals(20, 18)
    );
    expect(await dataStore.getUint(keys.collateralSumKey(ethUsdMarket.marketToken, usdc.address, true))).eq(
      expandDecimals(50_000, 6)
    );
    expect(await dataStore.getUint(keys.collateralSumKey(ethUsdMarket.marketToken, wnt.address, false))).eq(
      expandDecimals(5, 18)
    );
    expect(await dataStore.getUint(keys.collateralSumKey(ethUsdMarket.marketToken, usdc.address, false))).eq(
      expandDecimals(25_000, 6)
    );

    await time.increase(14 * 24 * 60 * 60);

    // ORDER 6
    // user0 closes the long position
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
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
        market: ethUsdMarket,
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
        market: ethUsdMarket,
        initialCollateralToken: wnt,
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
          expect(feeInfo.fundingFeeAmount).closeTo("806406800000000000", "10000000000000"); // 0.8064068 ETH, 4032.034 USD
          expect(feeInfo.collateralToken).eq(wnt.address);
          const claimableFundingData = getEventDataArray(logs, "ClaimableFundingUpdated");
          expect(claimableFundingData.length).eq(2);
          expect(claimableFundingData[0].token).eq(wnt.address);
          expect(claimableFundingData[0].delta).closeTo(0, "10000000000000");
        },
      },
    });

    // ORDER 8
    // user4 increases the short position by $1
    await handleOrder(fixture, {
      create: {
        account: user4,
        market: ethUsdMarket,
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

    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, true))).eq(
      decimalToFloat(99_999)
    );
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, true))).eq(
      decimalToFloat(100_000)
    );
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, false))).eq(
      decimalToFloat(100_000)
    );
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, false))).eq(
      decimalToFloat(300_001)
    );

    await time.increase(28 * 24 * 60 * 60);

    expect(await wnt.balanceOf(user0.address)).closeTo("8387186400000000000", "10000000000000");
    expect(await usdc.balanceOf(user0.address)).eq(0);

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq(0);

    expect(await wnt.balanceOf(user2.address)).eq(0);
    expect(await usdc.balanceOf(user2.address)).eq(0);

    expect(await wnt.balanceOf(user3.address)).eq(0);
    expect(await usdc.balanceOf(user3.address)).eq(0);

    expect(await wnt.balanceOf(user4.address)).eq(0);
    expect(await usdc.balanceOf(user4.address)).eq(0);

    // ORDER 9
    // user0 closes their position
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
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
        market: ethUsdMarket,
        initialCollateralToken: wnt,
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
        market: ethUsdMarket,
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
        market: ethUsdMarket,
        initialCollateralToken: wnt,
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
        market: ethUsdMarket,
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

    expect(await wnt.balanceOf(user0.address)).closeTo("8387186400000000000", "100000000000000"); // 8.3871864 ETH
    expect(await usdc.balanceOf(user0.address)).closeTo("33871772052", "100000"); // 33,871.772054 USDC

    expect(await wnt.balanceOf(user1.address)).closeTo("9193593200000000000", "100000000000000"); // 9.1935932 ETH
    expect(await usdc.balanceOf(user1.address)).eq(0);

    expect(await wnt.balanceOf(user2.address)).eq(0);
    expect(await usdc.balanceOf(user2.address)).closeTo("45967966000", "100000"); // 45,967.966 USDC

    expect(await wnt.balanceOf(user3.address)).closeTo("3387175205252222237", "10000000000000"); // 3.387175205252222237 ETH
    expect(await usdc.balanceOf(user3.address)).eq(0);

    expect(await wnt.balanceOf(user4.address)).eq(0);
    expect(await usdc.balanceOf(user4.address)).closeTo("16935795384", "10000"); // 16,935.795384 USDC

    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, true))).eq(0);
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, true))).eq(0);
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, false))).eq(0);
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, false))).eq(0);

    expect(await dataStore.getUint(keys.collateralSumKey(ethUsdMarket.marketToken, wnt.address, true))).eq(0);
    expect(await dataStore.getUint(keys.collateralSumKey(ethUsdMarket.marketToken, usdc.address, true))).eq(0);
    expect(await dataStore.getUint(keys.collateralSumKey(ethUsdMarket.marketToken, wnt.address, false))).eq(0);
    expect(await dataStore.getUint(keys.collateralSumKey(ethUsdMarket.marketToken, usdc.address, false))).eq(0);

    const users = [user0, user1, user2, user3, user4];
    for (let i = 0; i < users.length; i++) {
      await exchangeRouter
        .connect(users[i])
        .claimFundingFees(
          [ethUsdMarket.marketToken, ethUsdMarket.marketToken],
          [wnt.address, usdc.address],
          users[i].address
        );
    }

    // 41,935.932 + 33,871.772054 = 75,807.704054
    // total initial collateral amount: 10 ETH, 50,000 USDC (50,000 + 50,000 = $100,000)
    // diff: 75,807.6973862 - 100,000 = -24,192.3026138
    expect(await wnt.balanceOf(user0.address)).closeTo("8387186400000000000", "10000000000000"); // 8.3871864 ETH, 41,935.932 USD
    expect(await usdc.balanceOf(user0.address)).closeTo("33871772052", "1000000"); // 33,871.772052 USDC

    // 50,000.0028265 + 12,096.150798 = 62,096.1536245
    // initial collateral amount: 10 ETH ($50,000), diff: 62,096.1536245 - 50,000 = 12,096.1536245
    expect(await wnt.balanceOf(user1.address)).closeTo("10000000565295075039", "10000000000000"); // 10.000000565295075039 ETH, 50,000.0028265 USD
    expect(await usdc.balanceOf(user1.address)).closeTo("12096150798", "1000000"); // 12,096.150798 USDC

    // 4032.08714726 + 58,064.247762 = 62,096.3349093
    // initial collateral amount: 50,000 USDC, diff: 62,096.3349093 - 50,000 = 12,096.3349093
    expect(await wnt.balanceOf(user2.address)).closeTo("806417429452702722", "10000000000000"); // 0.806417429452702722 ETH, 4032.08714726 USD
    expect(await usdc.balanceOf(user2.address)).closeTo("58064247762", "1000000"); // 58,064.247762 USDC

    // 22,983.9630263 + 2016.028999 = 24,999.9920253  USD
    // initial collateral amount: 5 ETH ($25,000), diff: 24,999.9920253 - 25,000 = -0.0079747
    expect(await wnt.balanceOf(user3.address)).closeTo("4596792605252222236", "10000000000000"); // 4.596792605252222236 ETH, 22,983.9630263 USD
    expect(await usdc.balanceOf(user3.address)).closeTo("2016028999", "1000000"); // 2016.028999

    // 6048.015 + 18,951.800383 = 24,999.815383
    // initial collateral amount: 25,000, diff: 24,999.7920526 - 25,000 = -0.20794739999
    expect(await wnt.balanceOf(user4.address)).closeTo("1209602999999999999", "10000000000000"); // 1.209602999999999999 ETH, 6048.015 USD
    expect(await usdc.balanceOf(user4.address)).closeTo("18951800383", "1000000"); // 18,951.800383 USDC

    // total ETH collateral: 10 (user0) + 10 (user1) + 5 (user3) = 25 ETH
    // total USDC collateral: 50,000 (user0) + 50,000 (user2) + 25,000 (user4) = 125,000 USDC
    expect(
      (await wnt.balanceOf(user0.address))
        .add(await wnt.balanceOf(user1.address))
        .add(await wnt.balanceOf(user2.address))
        .add(await wnt.balanceOf(user3.address))
        .add(await wnt.balanceOf(user4.address))
    ).eq("24999999999999999996"); // 24.999999999999999996 ETH

    expect(
      (await usdc.balanceOf(user0.address))
        .add(await usdc.balanceOf(user1.address))
        .add(await usdc.balanceOf(user2.address))
        .add(await usdc.balanceOf(user3.address))
        .add(await usdc.balanceOf(user4.address))
    ).closeTo("124999999995", "10"); // 12,4999.999995 USDC
  });
});
