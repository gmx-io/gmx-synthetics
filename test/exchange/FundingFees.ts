import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { getPositionCount, getAccountPositionCount } from "../../utils/position";
import { expectTokenBalanceIncrease } from "../../utils/token";
import { expectWithinRange } from "../../utils/validation";
import { getEventData, getEventDataArray } from "../../utils/event";
import * as keys from "../../utils/keys";

describe("Exchange.FundingFees", () => {
  const { provider } = ethers;
  let fixture;
  let user0, user1, user2;
  let dataStore, ethUsdMarket, ethUsdSingleTokenMarket, exchangeRouter, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, ethUsdSingleTokenMarket, exchangeRouter, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(500_000, 6),
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: ethUsdSingleTokenMarket,
        longTokenAmount: expandDecimals(500_000, 6),
        shortTokenAmount: expandDecimals(500_000, 6),
      },
    });
  });

  it("funding fees", async () => {
    await dataStore.setUint(keys.fundingFactorKey(ethUsdMarket.marketToken), decimalToFloat(1, 10));
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
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    // ORDER 2
    // user1 opens a $100k short position, using usdc as collateral
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(10 * 1000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    const block = await provider.getBlock();
    expectWithinRange(
      await dataStore.getUint(keys.cumulativeBorrowingFactorUpdatedAtKey(ethUsdMarket.marketToken, true)),
      block.timestamp,
      100
    );

    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, true))).eq(
      decimalToFloat(200 * 1000)
    );
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, true))).eq(0);
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, false))).eq(0);
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, false))).eq(
      decimalToFloat(100 * 1000)
    );

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    expect(await getAccountPositionCount(dataStore, user1.address)).eq(1);
    expect(await getPositionCount(dataStore)).eq(2);

    await time.increase(14 * 24 * 60 * 60);

    // ORDER 3
    // user0 decreases the long position by $190k, remaining long position size is $10k
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(190 * 1000),
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
          expect(feeInfo.fundingFeeAmount).eq("1612803999999999"); // 0.001612803999999999 ETH, 8.06402 USD
          expect(feeInfo.collateralToken).eq(wnt.address);
          const claimableFundingData = getEventDataArray(logs, "ClaimableFundingUpdated");
          expect(claimableFundingData.length).eq(0);
        },
      },
    });

    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, wnt.address, true))).eq(
      "8064019999999995000000000"
    );
    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, wnt.address, false))).eq(
      "-16128039999999990000000000"
    );
    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, usdc.address, true))).eq("0");
    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, usdc.address, false))).eq("0");

    // ORDER 4
    // user1 decreases the short position by $80k, remaining short position size is $20k
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(80 * 1000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        afterExecution: async ({ logs }) => {
          const feeInfo = getEventData(logs, "PositionFeesCollected");
          expectWithinRange(feeInfo.fundingFeeAmount, "24", "10");
          expect(feeInfo.collateralToken).eq(usdc.address);
          const claimableFundingData = getEventDataArray(logs, "ClaimableFundingUpdated");
          expect(claimableFundingData.length).eq(1);
          expect(claimableFundingData[0].token).eq(wnt.address);
          expect(claimableFundingData[0].delta).eq("1612803999999999"); // 0.001612803999999999 ETH, ~$8.06402
        },
      },
    });

    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, true))).eq(
      decimalToFloat(10 * 1000)
    );
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, true))).eq(0);
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, false))).eq(0);
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, false))).eq(
      decimalToFloat(20 * 1000)
    );

    // long positions using wnt for collateral should pay a funding fee
    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, wnt.address, true))).eq(
      "8064019999999995000000000"
    );
    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, wnt.address, false))).eq(
      "-16128039999999990000000000"
    );
    expectWithinRange(
      await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, usdc.address, true)),
      "-2400000000000",
      "1000000000000"
    );
    expectWithinRange(
      await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, usdc.address, false)),
      "240000000000",
      "1000000000000"
    );

    expect(
      await dataStore.getUint(keys.claimableFundingAmountKey(ethUsdMarket.marketToken, wnt.address, user1.address))
    ).eq("1612803999999999");

    await expectTokenBalanceIncrease({
      token: wnt,
      account: user2,
      sendTxn: async () => {
        await exchangeRouter.connect(user1).claimFundingFees([ethUsdMarket.marketToken], [wnt.address], user2.address);
      },
      increaseAmount: "1612803999999999",
    });

    await time.increase(14 * 24 * 60 * 60);

    // ORDER 5
    // user0 decreases the long position by $10k, remaining long position size is $0
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(1, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(10 * 1000),
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
          expect(feeInfo.fundingFeeAmount).eq("0");
          expect(feeInfo.collateralToken).eq(wnt.address);
          const claimableFundingData = getEventDataArray(logs, "ClaimableFundingUpdated");
          expect(claimableFundingData.length).eq(1);
          expect(claimableFundingData[0].token).eq(usdc.address);
          expectWithinRange(claimableFundingData[0].delta, "806434", "10"); // ~$0.806434
        },
      },
    });

    // ORDER 6
    // user1 decreases the short position by $20k, remaining short position size is $0
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(1000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(20 * 1000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        afterExecution: async ({ logs }) => {
          const feeInfo = getEventData(logs, "PositionFeesCollected");
          expectWithinRange(feeInfo.fundingFeeAmount, "806402", "10");
          expect(feeInfo.collateralToken).eq(usdc.address);
          const claimableFundingData = getEventDataArray(logs, "ClaimableFundingUpdated");
          expect(claimableFundingData.length).eq(0);
        },
      },
    });

    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, true))).eq(0);
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, true))).eq(0);
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, false))).eq(0);
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, false))).eq(0);

    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, wnt.address, true))).eq(
      "8064019999999995000000000"
    ); // 0.000000008064019999 ETH, 0.00004032009 USD
    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, wnt.address, false))).eq(
      "-16128039999999990000000000"
    ); // -0.000000016128039999 ETH, -0.00008064019 USD
    expectWithinRange(
      await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, usdc.address, true)),
      "-80642700000000000",
      "1000000000000"
    ); // -0.00008 USD
    expectWithinRange(
      await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, usdc.address, false)),
      "40320390000000000", // 0.00004 USD
      "100000000000"
    );
  });

  it("funding fees, single token market", async () => {
    await dataStore.setUint(keys.fundingFactorKey(ethUsdSingleTokenMarket.marketToken), decimalToFloat(1, 10));
    await dataStore.setUint(keys.fundingExponentFactorKey(ethUsdSingleTokenMarket.marketToken), decimalToFloat(1));

    expect(await dataStore.getUint(keys.fundingUpdatedAtKey(ethUsdSingleTokenMarket.marketToken))).eq(0);

    // ORDER 1
    // user0 opens a $200k long position, using wnt as collateral
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(10_000, 6),
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5050, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
    });

    // ORDER 2
    // user1 opens a $100k short position, using usdc as collateral
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(10_000, 6),
        sizeDeltaUsd: decimalToFloat(100 * 1000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketIncrease,
        isLong: false,
      },
    });

    await time.increase(14 * 24 * 60 * 60);

    // ORDER 3
    // user0 decreases the long position by $190k, remaining long position size is $10k
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(190 * 1000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
      execute: {
        afterExecution: async ({ logs }) => {
          const feeInfo = getEventData(logs, "PositionFeesCollected");
          expect(feeInfo.fundingFeeAmount).eq("8064018"); // 8.064018 USD
          expect(feeInfo.collateralToken).eq(usdc.address);
          const claimableFundingData = getEventDataArray(logs, "ClaimableFundingUpdated");
          expect(claimableFundingData.length).eq(0);
        },
      },
    });

    expect(
      await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdSingleTokenMarket.marketToken, usdc.address, true))
    ).eq("40320090000000000");
    expect(
      await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdSingleTokenMarket.marketToken, usdc.address, false))
    ).eq("-40320090000000000");

    // ORDER 4
    // user1 decreases the short position by $80k, remaining short position size is $20k
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(80 * 1000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
      },
      execute: {
        afterExecution: async ({ logs }) => {
          const feeInfo = getEventData(logs, "PositionFeesCollected");
          expect(feeInfo.fundingFeeAmount).eq(0);
          expect(feeInfo.collateralToken).eq(usdc.address);
          const claimableFundingData = getEventDataArray(logs, "ClaimableFundingUpdated");
          expect(claimableFundingData.length).eq(2);
          expect(claimableFundingData[0].token).eq(usdc.address);
          expect(claimableFundingData[0].delta).eq("4031985"); // 4.031985 USD

          expect(claimableFundingData[1].token).eq(usdc.address);
          expect(claimableFundingData[1].delta).eq("4031985"); // 4.031985 USD
        },
      },
    });

    expect(
      await dataStore.getUint(
        keys.claimableFundingAmountKey(ethUsdSingleTokenMarket.marketToken, usdc.address, user0.address)
      )
    ).eq(0);

    expect(
      await dataStore.getUint(
        keys.claimableFundingAmountKey(ethUsdSingleTokenMarket.marketToken, usdc.address, user1.address)
      )
    ).eq("8063970"); // 8.06397 USD
  });
});
