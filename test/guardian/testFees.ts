import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import * as keys from "../../utils/keys";
import { getEventData } from "../../utils/event";
import { grantRole } from "../../utils/role";
import { hashData, hashString } from "../../utils/hash";

describe("Guardian.Fees", () => {
  let fixture;
  let wallet, user0, user1;
  let roleStore, dataStore, wnt, usdc, ethUsdMarket, referralStorage, exchangeRouter, feeHandler;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0, user1 } = fixture.accounts);
    ({ roleStore, dataStore, ethUsdMarket, wnt, usdc, referralStorage, exchangeRouter, feeHandler } =
      fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1000 * 5_000, 6),
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });
  });

  it("FeeKeeper claims fees through FeeHandler", async () => {
    await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken), decimalToFloat(5, 3)); // 50 BIPs
    await dataStore.setUint(keys.POSITION_FEE_RECEIVER_FACTOR, decimalToFloat(1, 1)); // 10%

    // Fee Amount is initially 0
    let claimableFeeAmount = await dataStore.getUint(
      keys.claimableFeeAmountKey(ethUsdMarket.marketToken, usdc.address)
    );
    expect(claimableFeeAmount).to.eq(0);

    // User opens a position and experiences a position fee,
    // a portion of which is claimable by the fee keeper
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50 * 1000, 6), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(50 * 1000), // $50,000 Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    // The increase size is 50,000 -> position fee = .50% * 50,000 = $250
    // 10% * $250 = $25 for the feeReceiver
    const positionFeeFromIncrease = expandDecimals(25, 6);

    claimableFeeAmount = await dataStore.getUint(keys.claimableFeeAmountKey(ethUsdMarket.marketToken, usdc.address));
    expect(claimableFeeAmount).to.eq(positionFeeFromIncrease);

    // User decreases their position and experiences a position fee,
    // a portion of which is claimable by the fee keeper
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(25 * 1000), // Decrease by half
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    // The decrease size is 25,000 -> position fee = .50% * 25,000 = $125
    // 10% * $125 = $12.5 for the feeReceiver
    const positionFeeFromDecrease = expandDecimals(125, 5);

    claimableFeeAmount = await dataStore.getUint(keys.claimableFeeAmountKey(ethUsdMarket.marketToken, usdc.address));
    expect(claimableFeeAmount).to.eq(positionFeeFromDecrease.add(positionFeeFromIncrease));

    // User closes their position and experiences a position fee,
    // a portion of which is claimable by the fee keeper
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(25 * 1000), // Decrease by the rest
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    // The decrease size is 25,000 -> position fee = .50% & 25,000 = $125
    // 10% * $125 = $12.5 for the feeReceiver
    claimableFeeAmount = await dataStore.getUint(keys.claimableFeeAmountKey(ethUsdMarket.marketToken, usdc.address));
    expect(claimableFeeAmount).to.eq(positionFeeFromDecrease.mul(2).add(positionFeeFromIncrease));

    const keeperBalBefore = await usdc.balanceOf(wallet.address);

    // The feeKeeper is able to claim the fees from the feeHandler
    await grantRole(roleStore, wallet.address, "FEE_KEEPER");
    await dataStore.setAddress(keys.FEE_RECEIVER, wallet.address);

    await feeHandler.connect(wallet).claimFees([ethUsdMarket.marketToken], [usdc.address]);

    const keeperBalAfter = await usdc.balanceOf(wallet.address);

    expect(keeperBalAfter.sub(keeperBalBefore)).to.eq(claimableFeeAmount);

    // Claimable fees are now 0
    claimableFeeAmount = await dataStore.getUint(keys.claimableFeeAmountKey(ethUsdMarket.marketToken, usdc.address));
    expect(claimableFeeAmount).to.eq(0);
  });

  it("Affiliates are able to claim their rewards", async () => {
    // Register referral code
    const code = hashData(["bytes32"], [hashString("CODE4")]);
    await referralStorage.connect(user1).registerCode(code);
    await referralStorage.setTier(1, 2000, 10000); // 20% discount code
    await referralStorage.connect(user1).setReferrerDiscountShare(5000); // 50% discount share
    await referralStorage.setReferrerTier(user1.address, 1);

    await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken), decimalToFloat(5, 3)); // 50 BIPs position fee

    // User creates an order with this referral code
    // during the position creation the fees are discounted
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(50 * 1000), // Open $50,000 size
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
        referralCode: code,
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");

          // $50,000 size * .50% position fee -> $250 position fee
          // with a 20% affiliate discount -> $50 discount | $200 position fee
          // 50% discount share -> $25 discount to the trader | $25 claimable for the affiliate

          // Original positionFee was $250
          expect(positionFeesCollectedEvent.positionFeeAmount).to.eq(expandDecimals(250, 6));

          // Discounted fee is $200
          expect(positionFeesCollectedEvent.protocolFeeAmount).to.eq(expandDecimals(200, 6));

          // Trader splits $50 discount with the affiliate
          expect(positionFeesCollectedEvent.affiliate).to.eq(user1.address);
          expect(positionFeesCollectedEvent.totalRebateAmount).to.eq(expandDecimals(50, 6));
          expect(positionFeesCollectedEvent.traderDiscountAmount).to.eq(expandDecimals(25, 6));
          expect(positionFeesCollectedEvent.affiliateRewardAmount).to.eq(expandDecimals(25, 6));
        },
      },
    });

    // Code is now registered for the user
    const traderCode = await referralStorage.traderReferralCodes(user0.address);
    expect(traderCode).to.eq(code);

    // Affiliate immediately has some accumulated rewards
    const affiliateRewardsFromIncrease = expandDecimals(25, 6);

    let affiliateReward = await dataStore.getUint(
      keys.affiliateRewardKey(ethUsdMarket.marketToken, usdc.address, user1.address)
    );
    expect(affiliateReward).to.eq(affiliateRewardsFromIncrease);

    // User decreases their position by half, their fees are discounted
    // The Affiliate gets a portion of this claimable
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(25 * 1000), // Decrease by half
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
        referralCode: code,
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");

          // $25,000 size * .50% position fee -> $125 position fee
          // with a 20% affiliate discount -> $25 discount | $100 position fee
          // 50% discount share -> $12.5 discount to the trader | $12.5 claimable for the affiliate

          // Original positionFee was $125
          expect(positionFeesCollectedEvent.positionFeeAmount).to.eq(expandDecimals(125, 6));

          // Discounted fee is $100
          expect(positionFeesCollectedEvent.protocolFeeAmount).to.eq(expandDecimals(100, 6));

          // Trader splits $25 discount with the affiliate
          expect(positionFeesCollectedEvent.affiliate).to.eq(user1.address);
          expect(positionFeesCollectedEvent.totalRebateAmount).to.eq(expandDecimals(25, 6));
          expect(positionFeesCollectedEvent.traderDiscountAmount).to.eq(expandDecimals(125, 5));
          expect(positionFeesCollectedEvent.affiliateRewardAmount).to.eq(expandDecimals(125, 5));
        },
      },
    });

    // Affiliate has more claimable rewards
    const affiliateRewardsFromDecrease = expandDecimals(125, 5);

    affiliateReward = await dataStore.getUint(
      keys.affiliateRewardKey(ethUsdMarket.marketToken, usdc.address, user1.address)
    );
    expect(affiliateReward).to.eq(affiliateRewardsFromDecrease.add(affiliateRewardsFromIncrease));

    // User closes their position, their fees are discounted
    // The Affiliate gets a portion of this claimable
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(25 * 1000), // Close the remainder of the position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
        referralCode: code,
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");

          // $25,000 size * .50% position fee -> $125 position fee
          // with a 20% affiliate discount -> $25 discount | $100 position fee
          // 50% discount share -> $12.5 discount to the trader | $12.5 claimable for the affiliate

          // Original positionFee was $125
          expect(positionFeesCollectedEvent.positionFeeAmount).to.eq(expandDecimals(125, 6));

          // Discounted fee is $100
          expect(positionFeesCollectedEvent.protocolFeeAmount).to.eq(expandDecimals(100, 6));

          // Trader splits $25 discount with the affiliate
          expect(positionFeesCollectedEvent.affiliate).to.eq(user1.address);
          expect(positionFeesCollectedEvent.totalRebateAmount).to.eq(expandDecimals(25, 6));
          expect(positionFeesCollectedEvent.traderDiscountAmount).to.eq(expandDecimals(125, 5));
          expect(positionFeesCollectedEvent.affiliateRewardAmount).to.eq(expandDecimals(125, 5));
        },
      },
    });

    // Affiliate has more claimable rewards
    affiliateReward = await dataStore.getUint(
      keys.affiliateRewardKey(ethUsdMarket.marketToken, usdc.address, user1.address)
    );
    expect(affiliateReward).to.eq(affiliateRewardsFromDecrease.mul(2).add(affiliateRewardsFromIncrease));

    const user1BalBefore = await usdc.balanceOf(user1.address);
    // The Affiliate can claim this amount
    await exchangeRouter
      .connect(user1)
      .claimAffiliateRewards([ethUsdMarket.marketToken], [usdc.address], user1.address);

    const user1BalAfter = await usdc.balanceOf(user1.address);

    expect(user1BalAfter.sub(user1BalBefore)).to.eq(affiliateReward);
  });

  it("UI fees are claimable", async () => {
    await dataStore.setUint(keys.MAX_UI_FEE_FACTOR, decimalToFloat(1, 2)); // 1% max UI fee factor
    await exchangeRouter.connect(user1).setUiFeeFactor(decimalToFloat(5, 3)); // Use 50 BIPs as the UI fee factor

    // user0 creates an order with user1 as the uiFeeReceiver
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(50 * 1000), // Open $50,000
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
        uiFeeReceiver: user1,
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");

          expect(positionFeesCollectedEvent.positionFeeAmount).to.eq(0);
          expect(positionFeesCollectedEvent.uiFeeReceiver).to.eq(user1.address);

          // uiFeeAmount = 50 BIPs of the order size
          // .005 * 50,000 = $250
          expect(positionFeesCollectedEvent.uiFeeAmount).to.eq(expandDecimals(250, 6));
        },
      },
    });

    // user1 has some claimable uiFees
    const uiFeesFromIncrease = expandDecimals(250, 6);

    let claimableUIFees = await dataStore.getUint(
      keys.claimableUiFeeAmountKey(ethUsdMarket.marketToken, usdc.address, user1.address)
    );
    expect(claimableUIFees).to.eq(uiFeesFromIncrease);

    // user0 decreases by half, user1 gets more UI fees
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(25 * 1000), // Decrease by half
        acceptablePrice: expandDecimals(5000, 12),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
        uiFeeReceiver: user1,
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");

          expect(positionFeesCollectedEvent.positionFeeAmount).to.eq(0);
          expect(positionFeesCollectedEvent.uiFeeReceiver).to.eq(user1.address);

          // uiFeeAmount = 50 BIPs of the order size
          // .005 * 25,000 = $125
          expect(positionFeesCollectedEvent.uiFeeAmount).to.eq(expandDecimals(125, 6));
        },
      },
    });

    const uiFeesFromDecrease = expandDecimals(125, 6);

    claimableUIFees = await dataStore.getUint(
      keys.claimableUiFeeAmountKey(ethUsdMarket.marketToken, usdc.address, user1.address)
    );
    expect(claimableUIFees).to.eq(uiFeesFromIncrease.add(uiFeesFromDecrease));

    // user0 closes their position, user1 gets more claimable ui fees
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(25 * 1000), // Close the rest
        acceptablePrice: expandDecimals(5000, 12),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
        uiFeeReceiver: user1,
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");

          expect(positionFeesCollectedEvent.positionFeeAmount).to.eq(0);
          expect(positionFeesCollectedEvent.uiFeeReceiver).to.eq(user1.address);

          // uiFeeAmount = 50 BIPs of the order size
          // .005 * 25,000 = $125
          expect(positionFeesCollectedEvent.uiFeeAmount).to.eq(expandDecimals(125, 6));
        },
      },
    });

    claimableUIFees = await dataStore.getUint(
      keys.claimableUiFeeAmountKey(ethUsdMarket.marketToken, usdc.address, user1.address)
    );
    expect(claimableUIFees).to.eq(uiFeesFromIncrease.add(uiFeesFromDecrease.mul(2)));

    const user1BalBefore = await usdc.balanceOf(user1.address);

    // Now user1 may claim their accumulated ui fees
    await exchangeRouter.connect(user1).claimUiFees([ethUsdMarket.marketToken], [usdc.address], user1.address);

    const user1BalAfter = await usdc.balanceOf(user1.address);
    expect(user1BalAfter.sub(user1BalBefore)).to.eq(claimableUIFees);
  });
});
