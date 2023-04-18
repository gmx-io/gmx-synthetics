import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { parseLogs, getEventData } from "../../utils/event";
import { hashString } from "../../utils/hash";
import * as keys from "../../utils/keys";

describe("Exchange.PositionFees", () => {
  let fixture;
  let user0, user1, user2, user3;
  let dataStore, ethUsdMarket, referralStorage, wnt, usdc;
  const referralCode0 = hashString("example code 0");
  const referralCode1 = hashString("example code 1");

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, referralStorage, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(500 * 1000, 6),
      },
    });

    await referralStorage.connect(user2).registerCode(referralCode0);
    await referralStorage.connect(user3).registerCode(referralCode1);

    await referralStorage.setTier(1, 1000, 2000); // tier 1, totalRebate: 10%, discountShare: 20%
    await referralStorage.setTier(2, 2000, 2500); // tier 2, totalRebate: 20%, discountShare: 25%

    await referralStorage.setReferrerTier(user2.address, 1);
    await referralStorage.setReferrerTier(user3.address, 2);
  });

  it("position fees", async () => {
    await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken), decimalToFloat(5, 4)); // 0.05%

    await dataStore.setUint(keys.POSITION_FEE_RECEIVER_FACTOR, decimalToFloat(2, 1)); // 20%
    await dataStore.setUint(keys.BORROWING_FEE_RECEIVER_FACTOR, decimalToFloat(4, 1)); // 40%

    await dataStore.setUint(keys.borrowingFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 9));
    await dataStore.setUint(keys.borrowingFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 9));
    await dataStore.setUint(keys.borrowingExponentFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1));
    await dataStore.setUint(keys.borrowingExponentFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1));

    await dataStore.setUint(keys.fundingFactorKey(ethUsdMarket.marketToken), decimalToFloat(1, 10));
    await dataStore.setUint(keys.fundingExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(1));

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
        referralCode: referralCode0,
      },
    });

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
        referralCode: referralCode1,
      },
    });

    await time.increase(14 * 24 * 60 * 60);

    const { executeResult } = await handleOrder(fixture, {
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
    });

    const executeResultLogs = parseLogs(fixture, executeResult);
    const positionFeesCollectedEvent = getEventData(executeResultLogs, "PositionFeesCollected");

    // positionFee: 190,000 * 0.05% => 95 USD
    // totalRebate: 95 * 10% => 9.5 USD
    // traderDiscount: 9.5 * 20% => 1.9 USD
    // affiliateReward: 9.5 - 1.9 => 7.6 USD
    // protocolFee: positionFeeAmount - totalRebateAmount => 95 - 9.5 => 85.5
    // positionFeeForPool: 85.5 * 80% => 68.4 USD
    // fundingFee: 0.0016128039998 ETH => 8.064019999 USD
    // borrowingFee:  0.001935343331056032 ETH => 9.67671665528 USD
    // borrowingFeeForFeeReceiver: 9.67671665528 * 40% => 3.87068666211 USD
    // feeReceiver: 85.5 * 20% + 3.87068666211 => 20.9706866621 USD
    // feeForPool: 85.5 * 80% + 9.67671665528 * 60% => 74.2060299932 USD
    // totalNetCost: positionFee + borrowingFee + fundingFee - traderDiscount
    //    => 95 + 9.67671665528 + 8.064019999 - 1.9 => 110.840736654 USD

    expect(positionFeesCollectedEvent.collateralToken).eq(wnt.address);
    expect(positionFeesCollectedEvent["collateralTokenPrice.min"]).eq(expandDecimals(5000, 12));
    expect(positionFeesCollectedEvent["collateralTokenPrice.max"]).eq(expandDecimals(5000, 12));
    expect(positionFeesCollectedEvent.tradeSizeUsd).eq(decimalToFloat(190 * 1000));
    expect(positionFeesCollectedEvent.totalRebateFactor).eq(decimalToFloat(1, 1)); // 10%
    expect(positionFeesCollectedEvent.traderDiscountFactor).eq(decimalToFloat(2, 1)); // 20%
    expect(positionFeesCollectedEvent.totalRebateAmount).eq("1900000000000000"); // 0.0019 ETH => 9.5 USD
    expect(positionFeesCollectedEvent.traderDiscountAmount).eq("380000000000000"); // 0.00038 ETH => 1.9 USD
    expect(positionFeesCollectedEvent.affiliateRewardAmount).eq("1520000000000000"); // 0.00152 ETH => 7.6 USD
    expect(positionFeesCollectedEvent.fundingFeeAmount).eq("1612803999800000"); // 0.0016128039998 ETH => 8.064019999 USD
    expect(positionFeesCollectedEvent.claimableLongTokenAmount).eq("0");
    expect(positionFeesCollectedEvent.claimableShortTokenAmount).eq("0");
    expect(positionFeesCollectedEvent.borrowingFeeAmount).eq("1935343331056032"); // 0.001935343331056032 ETH => 9.67671665528 USD
    expect(positionFeesCollectedEvent.borrowingFeeReceiverFactor).eq(decimalToFloat(4, 1)); // 40%
    expect(positionFeesCollectedEvent.borrowingFeeAmountForFeeReceiver).eq("774137332422412"); // 0.000774137332422412 ETH => 3.87068666211 USD
    expect(positionFeesCollectedEvent.positionFeeFactor).eq(decimalToFloat(5, 4));
    expect(positionFeesCollectedEvent.protocolFeeAmount).eq("17100000000000000"); // 0.0171 ETH => 85.5 USD
    expect(positionFeesCollectedEvent.positionFeeReceiverFactor).eq(decimalToFloat(2, 1)); // 20%
    expect(positionFeesCollectedEvent.feeReceiverAmount).eq("4194137332422412"); // 0.004194137332422412 ETH => 20.9706866621 USD
    expect(positionFeesCollectedEvent.feeAmountForPool).eq("14841205998633620"); // 0.129800599863361968 ETH => 74.2060299932 USD
    expect(positionFeesCollectedEvent.positionFeeAmountForPool).eq("13680000000000000"); // 0.01368 ETH => 68.4 USD
    expect(positionFeesCollectedEvent.positionFeeAmount).eq("19000000000000000"); // 0.019 ETH => 95 USD
    expect(positionFeesCollectedEvent.totalNetCostAmount).eq("22168147330856032"); // 0.022168147330856032 ETH => 110.840736654 USD
    expect(positionFeesCollectedEvent.totalNetCostUsd).eq("110840736654280160000000000000000"); // 110.840736654 USD
    expect(positionFeesCollectedEvent.latestLongTokenFundingAmountPerSize).eq("8064019999");
    expect(positionFeesCollectedEvent.latestShortTokenFundingAmountPerSize).eq("0");
    expect(positionFeesCollectedEvent.hasPendingLongTokenFundingFee).eq(false);
    expect(positionFeesCollectedEvent.hasPendingShortTokenFundingFee).eq(false);
    expect(positionFeesCollectedEvent.isIncrease).eq(false);
  });
});
