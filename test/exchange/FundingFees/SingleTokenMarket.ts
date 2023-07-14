import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { handleDeposit } from "../../../utils/deposit";
import { OrderType, handleOrder } from "../../../utils/order";
import { getEventData, getEventDataArray } from "../../../utils/event";
import * as keys from "../../../utils/keys";

describe("Exchange.FundingFees.SingleTokenMarket", () => {
  let fixture;
  let user0, user1;
  let dataStore, ethUsdMarket, ethUsdSingleTokenMarket, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, ethUsdSingleTokenMarket, usdc } = fixture.contracts);

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
          expect(feeInfo.fundingFeeAmount).eq("8064020"); // 8.064020 USD
          expect(feeInfo.collateralToken).eq(usdc.address);
          const claimableFundingData = getEventDataArray(logs, "ClaimableFundingUpdated");
          expect(claimableFundingData.length).eq(0);
        },
      },
    });

    expect(
      await dataStore.getUint(keys.fundingFeeAmountPerSizeKey(ethUsdSingleTokenMarket.marketToken, usdc.address, true))
    ).eq("40320100000000000");
    expect(
      await dataStore.getUint(keys.fundingFeeAmountPerSizeKey(ethUsdSingleTokenMarket.marketToken, usdc.address, false))
    ).eq(0);

    expect(
      await dataStore.getUint(
        keys.claimableFundingAmountPerSizeKey(ethUsdSingleTokenMarket.marketToken, usdc.address, true)
      )
    ).eq(0);
    expect(
      await dataStore.getUint(
        keys.claimableFundingAmountPerSizeKey(ethUsdSingleTokenMarket.marketToken, usdc.address, false)
      )
    ).eq("40320099999999998");

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
          expect(feeInfo.fundingFeeAmount).closeTo(0, 50);
          expect(feeInfo.collateralToken).eq(usdc.address);
          const claimableFundingData = getEventDataArray(logs, "ClaimableFundingUpdated");
          expect(claimableFundingData.length).eq(2);
          expect(claimableFundingData[0].token).eq(usdc.address);
          expect(claimableFundingData[0].delta).eq("4032009"); // 4.032009 USD

          expect(claimableFundingData[1].token).eq(usdc.address);
          expect(claimableFundingData[1].delta).eq("4032009"); // 4.032009 USD
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
    ).eq("8064018"); // 8.064018 USD
  });
});
