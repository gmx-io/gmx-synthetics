import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder, getOrderCount } from "../../utils/order";
import * as keys from "../../utils/keys";
import { getPositionKey, getPositionCount } from "../../utils/position";
import { getEventData } from "../../utils/event";
import { grantRole } from "../../utils/role";
import { hashData, hashString } from "../../utils/hash";
import { prices } from "../../utils/prices";
import { getMarketTokenPriceWithPoolValue } from "../../utils/market";
import { executeLiquidation } from "../../utils/liquidation";
import { BigNumber } from "ethers";

describe("Guardian.Fees", () => {
  let fixture;
  let wallet, user0, user1;
  let roleStore,
    dataStore,
    wnt,
    usdc,
    ethUsdMarket,
    referralStorage,
    exchangeRouter,
    feeHandler,
    reader,
    decreasePositionUtils;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0, user1 } = fixture.accounts);
    ({
      roleStore,
      dataStore,
      ethUsdMarket,
      wnt,
      usdc,
      referralStorage,
      exchangeRouter,
      feeHandler,
      reader,
      decreasePositionUtils,
    } = fixture.contracts);

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
    await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(5, 3)); // 50 BIPs
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

    await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(5, 3)); // 50 BIPs position fee

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

  it("Positive & negative impact fees for positions", async () => {
    // Set positive & negative position fee factor
    await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 3)); // 0.1%
    await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 4)); // 0.05%

    // Negative impact fees are greater than positive impact fees
    const negativeImpactPositionFeeFactor = await dataStore.getUint(
      keys.positionFeeFactorKey(ethUsdMarket.marketToken, false)
    );
    const positiveImpactPositionFeeFactor = await dataStore.getUint(
      keys.positionFeeFactorKey(ethUsdMarket.marketToken, true)
    );

    expect(negativeImpactPositionFeeFactor).to.gt(positiveImpactPositionFeeFactor);
    expect(negativeImpactPositionFeeFactor).to.eq(expandDecimals(1, 27));
    expect(positiveImpactPositionFeeFactor).to.eq(expandDecimals(5, 26));

    // Enable price impact
    // set positive price impact to 0.05% for every $100,000 of token imbalance
    // set negative price impact to 0.1% for every $100,000 of token imbalance
    // 0.05% => 0.0005
    // 0.0005 / 100,000 => 5 * (10 ** -9)
    // 0.1% => 0.001
    // 0.001 / 100,000 => 1 * (10 ** -8)
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    let poolPnl = await reader.getNetPnl(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket.withSpread.indexTokenPrice,
      false
    );
    expect(poolPnl).to.eq(0);
    poolPnl = await reader.getNetPnl(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket.withSpread.indexTokenPrice,
      true
    );
    expect(poolPnl).to.eq(0);

    let marketTokenPrice, poolValueInfo;

    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    expect(marketTokenPrice).to.eq(expandDecimals(1, 30));
    expect(poolValueInfo.poolValue).to.eq(expandDecimals(10_000_000, 30)); // 10M
    expect(poolValueInfo.impactPoolAmount).to.eq(0); // Nothing is in the position impact pool yet
    expect(poolValueInfo.shortTokenAmount).to.eq(expandDecimals(5_000_000, 6));
    expect(poolValueInfo.longTokenAmount).to.eq(expandDecimals(1_000, 18));
    expect(poolValueInfo.impactPoolAmount).to.eq(0);

    // Open a position and get negatively impacted, pay a .1% positionFeeFactor rate
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(25_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(50_000),
        acceptablePrice: expandDecimals(5050, 12), // Room for PI
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
        uiFeeReceiver: user1, // UI Fee receiver with no UI Fee
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");

          // 50_000 * .1% = $50

          expect(positionFeesCollectedEvent.positionFeeAmount).to.eq(expandDecimals(50, 6)); // $50
          expect(positionFeesCollectedEvent.uiFeeReceiver).to.eq(user1.address);

          // uiFeeAmount should be 0
          expect(positionFeesCollectedEvent.uiFeeAmount).to.eq(0);

          // Negative impact amount for $50,000 of imbalance
          // 50,000^2 * 1e22 / 1e30 = $25
          expect(positionIncreaseEvent.priceImpactUsd).to.closeTo(
            expandDecimals(25, 30).mul(-1),
            expandDecimals(1, 17)
          ); // ~$25
        },
      },
    });

    // Resulting position has $25,000 - $50 of collateral
    // & $50_000 - ~$25 of size in tokens E.g. 49,975 / 5,000 = 9.995 ETH
    const positionKey = getPositionKey(user0.address, ethUsdMarket.marketToken, usdc.address, true);
    const position = await reader.getPosition(dataStore.address, positionKey);

    expect(position.numbers.collateralAmount).to.eq(expandDecimals(25_000, 6).sub(expandDecimals(50, 6)));
    expect(position.numbers.sizeInUsd).to.eq(expandDecimals(50_000, 30));
    expect(position.numbers.sizeInTokens).to.eq(expandDecimals(9995, 15)); // 9.995 ETH

    // value of the pool has a net 0 change (other than fees) because the positionImpactPool
    // offsets the immediate negative PnL that user0 experiences

    poolPnl = await reader.getNetPnl(dataStore.address, ethUsdMarket, prices.ethUsdMarket.indexTokenPrice, false);
    expect(poolPnl).to.eq(expandDecimals(25, 30).mul(-1)); // -$25

    // With spread

    // ETH Price up $10, $10 gain per ETH, position size of 9.995 ETH
    // => position value = 5,010 * 9.995 = 50074.95 => gain of 74.95
    poolPnl = await reader.getNetPnl(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket.withSpread.indexTokenPrice,
      true
    );
    expect(poolPnl).to.eq(expandDecimals(7495, 28)); // ~$74.95

    // ETH Price down $10, $10 loss per ETH, position size of 9.995 ETH
    // => position value = 4,990 * 9.995 = $49,875.05
    // => $50,000 - $49,875.05 = $124.95 loss
    poolPnl = await reader.getNetPnl(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket.withSpread.indexTokenPrice,
      false
    );
    expect(poolPnl).to.eq(expandDecimals(12495, 28).mul(-1)); // ~-$124.95

    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    expect(marketTokenPrice).to.eq("1000005000000000000000000000000"); // Market token price is slightly higher as $50 of fees have accrued
    expect(poolValueInfo.poolValue).to.eq(expandDecimals(10_000_000, 30).add(expandDecimals(50, 30))); // 10M + $50 of fees

    let feeAmountCollected = expandDecimals(50, 6);

    expect(poolValueInfo.shortTokenAmount).to.eq(expandDecimals(5_000_000, 6).add(feeAmountCollected));
    expect(poolValueInfo.longTokenAmount).to.eq(expandDecimals(1_000, 18));

    // Now there is an offset of $25 worth of ETH that is being subtracted from the poolvalue, this way the trader's
    // immediate net pnl of -$25 does not affect the pool value above.
    let impactPoolAmount = expandDecimals(5, 15);
    expect(poolValueInfo.impactPoolAmount).to.eq(impactPoolAmount); // 0.005 ETH

    // Open a position and get positively impacted, pay a 0.05% positionFeeFactor rate
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(25_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(50_000),
        acceptablePrice: expandDecimals(4950, 12), // Room for PI
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false, // Open short side to balance OI
        shouldUnwrapNativeToken: false,
        uiFeeReceiver: user1, // UI Fee receiver with no UI Fee
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");

          // 50_000 * .05% = $25
          expect(positionFeesCollectedEvent.positionFeeAmount).to.eq(expandDecimals(25, 6)); // $25
          expect(positionFeesCollectedEvent.uiFeeReceiver).to.eq(user1.address);

          // uiFeeAmount should be 0
          expect(positionFeesCollectedEvent.uiFeeAmount).to.eq(0);

          // Negative impact amount for $50,000 of imbalance
          // 50,000^2 * 5e21 / 1e30 = $12.5
          expect(positionIncreaseEvent.priceImpactUsd).to.closeTo(expandDecimals(125, 29), expandDecimals(1, 17)); // ~$12.5 in positive impact
        },
      },
    });

    // Resulting position has $25,000 - $25 of collateral
    // & $50_000 - $12.5 of size in tokens E.g. $49,987.5 / $5,000 = 9.9975 ETH sizeInTokens
    const positionKey2 = getPositionKey(user0.address, ethUsdMarket.marketToken, usdc.address, false);
    let position2 = await reader.getPosition(dataStore.address, positionKey2);

    expect(position2.numbers.collateralAmount).to.eq(expandDecimals(25_000, 6).sub(expandDecimals(25, 6)));
    expect(position2.numbers.sizeInUsd).to.eq(expandDecimals(50_000, 30));
    expect(position2.numbers.sizeInTokens).to.eq("9997500000000000001"); // ~9.9975 ETH imprecision due to roundUp + PI imprecision

    // value of the pool has a net 0 change (other than fees) because the positionImpactPool
    // offsets the immediate PnL that is experienced
    // Long position is down $25
    // Short position is up $12.5 => -12.5 net trader PnL
    poolPnl = await reader.getNetPnl(dataStore.address, ethUsdMarket, prices.ethUsdMarket.indexTokenPrice, false);
    expect(poolPnl).to.eq("-12500000000000005000000000000000"); // The 1 in imprecision above gets magnified, this is fine

    // With spread

    // ETH Price up $10 for long,
    // $10 gain per ETH, position size of 9.995 ETH
    // => position 1 value = 5,010 * 9.995 = 50074.95 => gain of $74.95
    // Price of 4990 is used for short,
    // $10 gain per ETH, position size of 9.9975 ETH
    // => position 2 value = $50,000 - 9.9975 * 4,990 = $112.475
    poolPnl = await reader.getNetPnl(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket.withSpread.indexTokenPrice,
      true
    );
    expect(poolPnl).to.closeTo(expandDecimals(187425, 27), expandDecimals(1, 17)); // $74.95 + $112.475 = $187.425 with negligible imprecision

    // ETH Price down $10 for long,
    // $10 loss per ETH, position size of 9.995 ETH
    // => position value = 4,990 * 9.995 = $49,875.05
    // => $50,000 - $49,875.05 = -$124.95
    // Price of 50,010 for short
    // $10 loss per ETH, position size of 9.9975 ETH
    // => position 2 value = $50,000 - 9.9975 * 5,010 = -$87.475
    poolPnl = await reader.getNetPnl(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket.withSpread.indexTokenPrice,
      false
    );
    expect(poolPnl).to.closeTo(expandDecimals(212425, 27).mul(-1), expandDecimals(1, 17)); // -$124.95 - $87.475 = -$212.425 with imprecision

    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    expect(marketTokenPrice).to.eq("1000007500000000000000000000000"); // Market token price is slightly higher as $75 of fees have accrued
    expect(poolValueInfo.poolValue).to.eq(expandDecimals(10_000_000, 30).add(expandDecimals(75, 30))); // 10M + $75 of fees

    feeAmountCollected = expandDecimals(75, 6);

    expect(poolValueInfo.shortTokenAmount).to.eq(expandDecimals(5_000_000, 6).add(feeAmountCollected));
    expect(poolValueInfo.longTokenAmount).to.eq(expandDecimals(1_000, 18));

    // Now there is an offset of $25 worth of ETH that is being subtracted from the poolvalue, this way the trader's
    // immediate net pnl of -$25 does not affect the pool value above.
    impactPoolAmount = impactPoolAmount.sub(expandDecimals(25, 14));
    expect(poolValueInfo.impactPoolAmount).to.eq(impactPoolAmount.add(1)); // 0.005 ETH from long - 0.0025 ETH from short, extra wei from rounding

    // Test min collateral multiplier
    // goal min collateral factor of 0.15
    // => OI is 50,000 for short, and will be 25,000 after the close
    // minCollateralFactorForOpenInterestMultiplier: 0.15 / 25,000 = 6 * 1e-6
    // Therefore the factor ought to be 2 * 1e24
    // set it for just the short side
    await dataStore.setUint(
      keys.minCollateralFactorForOpenInterestMultiplierKey(ethUsdMarket.marketToken, false),
      decimalToFloat(6, 6)
    );

    let user0WntBalBefore = await wnt.balanceOf(user0.address);
    let user0UsdcBalBefore = await usdc.balanceOf(user0.address);

    // Now decrease the short position by half and get negatively impacted
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(24_975, 6), // Will position collateral be sufficient should auto adjust to 0
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(25_000), // Close 50% of size
        acceptablePrice: expandDecimals(5050, 12), // Room for PI
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
        uiFeeReceiver: user1, // UI Fee receiver with no UI Fee
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");
          const positionDecreasedEvent = getEventData(logs, "PositionDecrease");
          const autoAdjustCollateralEvent = getEventData(logs, "OrderCollateralDeltaAmountAutoUpdated");

          expect(autoAdjustCollateralEvent.collateralDeltaAmount).to.eq(expandDecimals(24_975, 6));
          expect(autoAdjustCollateralEvent.nextCollateralDeltaAmount).to.eq(0);

          // 25_000 * .1% = $25
          expect(positionFeesCollectedEvent.positionFeeAmount).to.eq(expandDecimals(25, 6)); // $25
          expect(positionFeesCollectedEvent.uiFeeReceiver).to.eq(user1.address);

          // uiFeeAmount & referral amounts should be 0
          expect(positionFeesCollectedEvent.uiFeeAmount).to.eq(0);
          expect(positionFeesCollectedEvent.totalRebateAmount).to.eq(0);
          expect(positionFeesCollectedEvent.traderDiscountAmount).to.eq(0);

          // Negative impact amount for $25,000 of imbalance
          // 25,000^2 * 1e22 / 1e30 = $6.25
          expect(positionDecreasedEvent.priceImpactUsd).to.closeTo(
            expandDecimals(625, 28).mul(-1),
            expandDecimals(1, 17)
          ); // ~$6.25 in negative impact
        },
      },
    });

    let user0WntBalAfter = await wnt.balanceOf(user0.address);
    let user0UsdcBalAfter = await usdc.balanceOf(user0.address);

    expect(user0WntBalAfter.sub(user0WntBalBefore)).to.eq(0); // Nothing paid out in WNT

    // Realizes half pending profits - PI
    // Pending profit: $12.5
    // PI: -$6.25
    // 12.5/2 - 6.25 = 0, Net gain should be 0
    expect(user0UsdcBalAfter.sub(user0UsdcBalBefore)).to.eq(0);

    // Resulting position has $25,000 - $25 of collateral
    // & $50_000 - $12.5 of size in tokens E.g. $49,987.5 / $5,000 = 9.9975 ETH sizeInTokens
    position2 = await reader.getPosition(dataStore.address, positionKey2);

    expect(position2.numbers.collateralAmount).to.closeTo(expandDecimals(25_000, 6).sub(expandDecimals(50, 6)), "1"); // Same collateral amount - $25 in fees
    expect(position2.numbers.sizeInUsd).to.eq(expandDecimals(25_000, 30)); // Size delta decreased 50%
    expect(position2.numbers.sizeInTokens).to.eq("4998750000000000001"); // ~9.9975/2 ETH imprecision due to roundUp + PI imprecision

    // value of the pool has a net 0 change (other than fees) because the positionImpactPool
    // offsets the immediate PnL that is experienced
    // Long position is down $25
    // Short position was up $12.5
    // Now short has decreased by half, they paid the negative price impact on the way out
    // leaving 6.25 in positive impact remaining PnL
    poolPnl = await reader.getNetPnl(dataStore.address, ethUsdMarket, prices.ethUsdMarket.indexTokenPrice, false);
    expect(poolPnl).to.eq("-18750000000000005000000000000000"); // The 1 in imprecision above gets magnified, this is fine

    // With spread

    // ETH Price up $10 for long,
    // $10 gain per ETH, position size of 9.995 ETH
    // => position 1 value = 5,010 * 9.995 = 50074.95 => gain of $74.95
    // Price of 4990 is used for short,
    // $10 gain per ETH, position size of 4.99875 ETH
    // => position 2 value = $25,000 - 4.99875 * 4,990 = $56.2375
    poolPnl = await reader.getNetPnl(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket.withSpread.indexTokenPrice,
      true
    );
    expect(poolPnl).to.closeTo(expandDecimals(1311875, 26), expandDecimals(1, 17)); // $74.95 + $56.2375 = $131.1875 with negligible imprecision

    // ETH Price down $10 for long,
    // $10 loss per ETH, position size of 9.995 ETH
    // => position value = 4,990 * 9.995 = $49,875.05
    // => $50,000 - $49,875.05 = -$124.95
    // Price of 50,010 for short
    // $10 loss per ETH, position size of 4.99875 ETH
    // => position 2 value = $25,000 - 4.99875 * 5,010 = -$43.7375
    poolPnl = await reader.getNetPnl(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket.withSpread.indexTokenPrice,
      false
    );
    expect(poolPnl).to.closeTo(expandDecimals(1686875, 26).mul(-1), expandDecimals(1, 17)); // -$124.95 - $43.7375 = -$168.6875 with negligible imprecision

    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    // Market token price is slightly higher as $100 of fees have accrued,
    // extra 100000000000000000 is from roundUp division on applying an amount paid for negative PI to the pool
    // Vs. using round down division for deducting positive PnL from the pool.
    expect(marketTokenPrice).to.eq("1000010000000100000000000000000");
    expect(poolValueInfo.poolValue).to.eq(
      expandDecimals(10_000_000, 30).add(expandDecimals(100, 30)).add("1000000000000000000000000")
    ); // 10M + $100 of fees & imprecision

    feeAmountCollected = expandDecimals(100, 6);
    let priceImpactAmountPaidToPool = expandDecimals(625, 4);
    const claimedProfitAmount = expandDecimals(625, 4);

    expect(poolValueInfo.shortTokenAmount).to.eq(
      expandDecimals(5_000_000, 6)
        .add(feeAmountCollected)
        .add(priceImpactAmountPaidToPool)
        .sub(claimedProfitAmount)
        .add(1)
    );
    expect(poolValueInfo.longTokenAmount).to.eq(expandDecimals(1_000, 18));

    // Now there is an offset of $25 worth of ETH that is being subtracted from the poolvalue, this way the trader's
    // immediate net pnl of -$25 does not affect the pool value above.
    // 0.005 ETH from opening long - 0.0025 ETH from opening short + 0.00125 ETH from decreasing short, extra wei from rounding
    impactPoolAmount = impactPoolAmount.add(expandDecimals(125, 13));
    expect(poolValueInfo.impactPoolAmount).to.eq(impactPoolAmount.add(1));

    user0WntBalBefore = await wnt.balanceOf(user0.address);
    user0UsdcBalBefore = await usdc.balanceOf(user0.address);

    // Decrease the long position entirely -> net negative impact since the negative impact factor
    // is greater than the positive impact factor
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(50_000), // Close 100% of size
        acceptablePrice: expandDecimals(4950, 12), // Room for PI
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
        uiFeeReceiver: user1, // UI Fee receiver with no UI Fee
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");
          const positionDecreasedEvent = getEventData(logs, "PositionDecrease");

          // Negative impact => negative impact position fee of .1%
          // 50_000 * .1% = $50
          expect(positionFeesCollectedEvent.positionFeeAmount).to.eq(expandDecimals(50, 6)); // $50
          expect(positionFeesCollectedEvent.uiFeeReceiver).to.eq(user1.address);

          // uiFeeAmount & referral amounts should be 0
          expect(positionFeesCollectedEvent.uiFeeAmount).to.eq(0);
          expect(positionFeesCollectedEvent.totalRebateAmount).to.eq(0);
          expect(positionFeesCollectedEvent.traderDiscountAmount).to.eq(0);

          // Positive impact amount for $25,000 of balance
          // 25,000^2 * 5e21 / 1e30 = $3.125
          // Negative impact amount for $25,000 of imbalance
          // 25,000^2 * 1e22 / 1e30 = $6.25
          // Net impact = $3.125 - $6.25 = -$3.125
          expect(positionDecreasedEvent.priceImpactUsd).to.closeTo(
            expandDecimals(3125, 27).mul(-1),
            expandDecimals(1, 17)
          ); // ~$3.125 in negative impact
        },
      },
    });

    user0WntBalAfter = await wnt.balanceOf(user0.address);
    user0UsdcBalAfter = await usdc.balanceOf(user0.address);

    // User receives their collateral back - fees - PI - losses
    // $25,000 initial collatera
    // $100 net fees: $50 on increase, $50 on decrease
    // PI: -$3.125
    // Losses: $25
    expect(user0UsdcBalAfter.sub(user0UsdcBalBefore)).to.eq(
      expandDecimals(25_000, 6).sub(expandDecimals(100, 6)).sub(expandDecimals(3125, 3)).sub(expandDecimals(25, 6))
    );

    // Nothing paid out in ETH, no positive PnL or positive impact
    expect(user0WntBalAfter.sub(user0WntBalAfter)).to.eq(0);

    const position1 = await reader.getPosition(dataStore.address, positionKey);

    // Zeroed out
    expect(position1.numbers.collateralAmount).to.eq(0);
    expect(position1.numbers.sizeInUsd).to.eq(0);
    expect(position1.numbers.sizeInTokens).to.eq(0);

    // value of the pool has a net 0 change (other than fees) because the positionImpactPool
    // offsets the immediate PnL that is experienced
    // Short position was up $12.5
    // Now short has decreased by half, they paid the negative price impact on the way out
    // leaving 6.25 in positive impact remaining PnL
    poolPnl = await reader.getNetPnl(dataStore.address, ethUsdMarket, prices.ethUsdMarket.indexTokenPrice, false);
    expect(poolPnl).to.eq("6249999999999995000000000000000"); // A bit of imprecision from roundUp vs. round down

    // With spread

    // Price of 4990 is used for short,
    // $10 gain per ETH, position size of 4.99875 ETH
    // => position 2 value = $25,000 - 4.99875 * 4,990 = $56.2375
    poolPnl = await reader.getNetPnl(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket.withSpread.indexTokenPrice,
      true
    );
    expect(poolPnl).to.closeTo(expandDecimals(562375, 26), expandDecimals(1, 17)); // $56.2375 with negligible imprecision

    // Price of 50,010 for short
    // $10 loss per ETH, position size of 4.99875 ETH
    // => position 2 value = $25,000 - 4.99875 * 5,010 = -$43.7375
    poolPnl = await reader.getNetPnl(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket.withSpread.indexTokenPrice,
      false
    );
    expect(poolPnl).to.closeTo(expandDecimals(437375, 26).mul(-1), expandDecimals(1, 17)); // $43.7375 with negligible imprecision

    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    // Market token price is slightly higher as $150 of fees have accrued,
    // extra 100000000000000000 is from roundUp division on applying an amount paid for negative PI to the pool
    // Vs. using round down division for deducting positive PnL from the pool.
    expect(marketTokenPrice).to.eq("1000015000000100000000000000000");
    expect(poolValueInfo.poolValue).to.eq(
      expandDecimals(10_000_000, 30).add(expandDecimals(150, 30)).add("1000000000000000000000000")
    ); // 10M + $150 of fees & imprecision

    feeAmountCollected = feeAmountCollected.add(expandDecimals(50, 6));
    priceImpactAmountPaidToPool = priceImpactAmountPaidToPool.add(expandDecimals(3125, 3));
    let realizedLossAmount = expandDecimals(25, 6);

    expect(poolValueInfo.shortTokenAmount).to.eq(
      expandDecimals(5_000_000, 6)
        .add(feeAmountCollected)
        .add(priceImpactAmountPaidToPool)
        .sub(claimedProfitAmount)
        .add(realizedLossAmount)
        .add(1)
    );
    expect(poolValueInfo.longTokenAmount).to.eq(expandDecimals(1_000, 18));

    // Now there is an offset of $25 worth of ETH that is being subtracted from the poolvalue, this way the trader's
    // immediate net pnl of -$25 does not affect the pool value above.
    // 0.005 ETH from opening long - 0.0025 ETH from opening short + 0.00125 ETH from decreasing short + 0.000625 ETH from decreasing long, extra wei from rounding
    impactPoolAmount = impactPoolAmount.add(expandDecimals(625, 12));
    expect(poolValueInfo.impactPoolAmount).to.eq(impactPoolAmount.add(1));

    // Short position gets liquidated
    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    await grantRole(roleStore, wallet.address, "LIQUIDATION_KEEPER");

    await expect(
      executeLiquidation(fixture, {
        account: user0.address,
        market: ethUsdMarket,
        collateralToken: usdc,
        tokens: [wnt.address, usdc.address],
        precisions: [8, 18],
        isLong: false,
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      })
    ).to.be.revertedWithCustomError(decreasePositionUtils, "PositionShouldNotBeLiquidated");

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    // Existing collateral is $24,950

    user0WntBalBefore = await wnt.balanceOf(user0.address);
    user0UsdcBalBefore = await usdc.balanceOf(user0.address);

    // First decrease collateral, leaving $10,450 USDC
    // E.g. leaving roughly ~<2.5x position leverage
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(14_500, 6),
        swapPath: [],
        sizeDeltaUsd: 0, // Close 0 size
        acceptablePrice: expandDecimals(100, 12), // Acceptable price is (correctly) not validated, otherwise this would fail
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
        uiFeeReceiver: user1, // UI Fee receiver with no UI Fee
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");
          const positionDecreasedEvent = getEventData(logs, "PositionDecrease");

          // No fees are collected
          expect(positionFeesCollectedEvent.positionFeeAmount).to.eq(0); // $0
          expect(positionFeesCollectedEvent.uiFeeReceiver).to.eq(user1.address);

          // uiFeeAmount & referral amounts should be 0
          expect(positionFeesCollectedEvent.uiFeeAmount).to.eq(0);
          expect(positionFeesCollectedEvent.totalRebateAmount).to.eq(0);
          expect(positionFeesCollectedEvent.traderDiscountAmount).to.eq(0);

          // No price impact is applied
          expect(positionDecreasedEvent.priceImpactUsd).to.eq(0);

          // Decreased collateral as expected
          expect(positionDecreasedEvent.collateralDeltaAmount).to.eq(expandDecimals(14_500, 6));
          expect(positionDecreasedEvent.collateralAmount).to.eq(expandDecimals(10_450, 6).sub(1)); // 1 wei imprecision
        },
      },
    });

    user0WntBalAfter = await wnt.balanceOf(user0.address);
    user0UsdcBalAfter = await usdc.balanceOf(user0.address);

    // User receives their withdrawn collateral back
    expect(user0UsdcBalAfter.sub(user0UsdcBalBefore)).to.eq(expandDecimals(14_500, 6));

    // Nothing paid out in ETH, no positive PnL or positive impact
    expect(user0WntBalAfter.sub(user0WntBalAfter)).to.eq(0);

    position2 = await reader.getPosition(dataStore.address, positionKey2);

    // Position values have not changed
    expect(position2.numbers.collateralAmount).to.eq(expandDecimals(10_450, 6).sub(1));
    expect(position2.numbers.sizeInUsd).to.eq(decimalToFloat(25_000));
    expect(position2.numbers.sizeInTokens).to.eq("4998750000000000001");

    // value of the pool has a net 0 change (other than fees) because the positionImpactPool
    // offsets the immediate PnL that is experienced
    // Short position was up $12.5
    // Now short has decreased by half, they paid the negative price impact on the way out
    // leaving 6.25 in positive impact remaining PnL
    poolPnl = await reader.getNetPnl(dataStore.address, ethUsdMarket, prices.ethUsdMarket.indexTokenPrice, false);
    expect(poolPnl).to.eq("6249999999999995000000000000000"); // A bit of imprecision from roundUp vs. round down

    // With spread

    // Price of 4990 is used for short,
    // $10 gain per ETH, position size of 4.99875 ETH
    // => position 2 value = $25,000 - 4.99875 * 4,990 = $56.2375
    poolPnl = await reader.getNetPnl(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket.withSpread.indexTokenPrice,
      true
    );
    expect(poolPnl).to.closeTo(expandDecimals(562375, 26), expandDecimals(1, 17)); // $56.2375 with negligible imprecision

    // Price of 50,010 for short
    // $10 loss per ETH, position size of 4.99875 ETH
    // => position 2 value = $25,000 - 4.99875 * 5,010 = -$43.7375
    poolPnl = await reader.getNetPnl(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket.withSpread.indexTokenPrice,
      false
    );
    expect(poolPnl).to.closeTo(expandDecimals(437375, 26).mul(-1), expandDecimals(1, 17)); // $43.7375 with negligible imprecision

    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    expect(poolValueInfo.shortTokenAmount).to.eq(
      expandDecimals(5_000_000, 6)
        .add(feeAmountCollected)
        .add(priceImpactAmountPaidToPool)
        .sub(claimedProfitAmount)
        .add(realizedLossAmount)
        .add(1)
    );
    expect(poolValueInfo.longTokenAmount).to.eq(expandDecimals(1_000, 18));

    // Market token price is slightly higher as $150 of fees have accrued,
    // extra 100000000000000000 is from roundUp division on applying an amount paid for negative PI to the pool
    // Vs. using round down division for deducting positive PnL from the pool.
    const marketTokenPriceBefore = BigNumber.from("1000015000000100000000000000000");
    expect(marketTokenPrice).to.eq(marketTokenPriceBefore);
    expect(poolValueInfo.poolValue).to.eq(
      expandDecimals(10_000_000, 30).add(expandDecimals(150, 30)).add("1000000000000000000000000")
    ); // 10M + $150 of fees & imprecision

    // Now there is an offset of $25 worth of ETH that is being subtracted from the poolvalue, this way the trader's
    // immediate net pnl of -$25 does not affect the pool value above.
    // 0.005 ETH from opening long - 0.0025 ETH from opening short + 0.00125 ETH from decreasing short + 0.000625 ETH from decreasing long, extra wei from rounding
    expect(poolValueInfo.impactPoolAmount).to.eq(impactPoolAmount.add(1));

    user0WntBalBefore = await wnt.balanceOf(user0.address);
    user0UsdcBalBefore = await usdc.balanceOf(user0.address);

    // Then Price rises by ~40% to $7,041
    // $2,041 loss per eth
    // Position size is 4.99875 ETH
    // Value of position: 4.99875 * 7,041 = $35,196.19875
    // E.g. PnL = $25,000 - $35,196.19875 = -$10,196.1988
    // min collateral necessary is ~250 USDC
    // Collateral is down to 10,450 - 10,196.1988 = 253.8012
    // Extra $12.5 fee is applied and + 3.125 PI E.g. position is now liquidated
    // as
    await expect(
      executeLiquidation(fixture, {
        account: user0.address,
        market: ethUsdMarket,
        collateralToken: usdc,
        tokens: [wnt.address, usdc.address],
        precisions: [8, 18],
        isLong: false,
        minPrices: [expandDecimals(7000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(7000, 4), expandDecimals(1, 6)],
      })
    ).to.be.revertedWithCustomError(decreasePositionUtils, "PositionShouldNotBeLiquidated");

    await executeLiquidation(fixture, {
      account: user0.address,
      market: ethUsdMarket,
      collateralToken: usdc,
      tokens: [wnt.address, usdc.address],
      precisions: [8, 18],
      isLong: false,
      minPrices: [expandDecimals(7041, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(7041, 4), expandDecimals(1, 6)],
      afterExecution: ({ logs }) => {
        const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");
        const positionDecreasedEvent = getEventData(logs, "PositionDecrease");

        // Positive impact => positive impact position fee of .05%
        // 25_000 * .05% = $12.5
        expect(positionFeesCollectedEvent.positionFeeAmount).to.eq(expandDecimals(125, 5)); // $12.5

        // uiFeeAmount & referral amounts should be 0
        expect(positionFeesCollectedEvent.uiFeeAmount).to.eq(0);
        expect(positionFeesCollectedEvent.totalRebateAmount).to.eq(0);
        expect(positionFeesCollectedEvent.traderDiscountAmount).to.eq(0);

        // Positive impact amount for $25,000 of balance
        // 25,000^2 * 5e21 / 1e30 = $3.125
        expect(positionDecreasedEvent.priceImpactUsd).to.closeTo(expandDecimals(3125, 27), expandDecimals(1, 17)); // ~$3.125 in positive impact
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    user0WntBalAfter = await wnt.balanceOf(user0.address);
    user0UsdcBalAfter = await usdc.balanceOf(user0.address);

    // User receives their remaining collateral back
    // From losses, remaining is 10,450 - 10,196.1988 = 253.8012 USDC
    // Fees that further
    // $12.5 in fees
    // PI is positive
    // PI: +$3.125
    // remaining collateral should be: 253.8012 - 12.5 + 3.125 ~= 244.4262
    expect(user0UsdcBalAfter.sub(user0UsdcBalBefore)).to.eq("244426247");

    // Nothing paid out in ETH, no positive PnL or positive impact
    expect(user0WntBalAfter.sub(user0WntBalAfter)).to.eq(0);

    // Position is zeroed out
    position2 = await reader.getPosition(dataStore.address, positionKey2);

    // Position values have not changed
    expect(position2.numbers.collateralAmount).to.eq(0);
    expect(position2.numbers.sizeInUsd).to.eq(0);
    expect(position2.numbers.sizeInTokens).to.eq(0);

    // 0 PnL
    poolPnl = await reader.getNetPnl(dataStore.address, ethUsdMarket, prices.ethUsdMarket.indexTokenPrice, false);
    expect(poolPnl).to.eq(0);

    // With spread

    // 0 PnL
    poolPnl = await reader.getNetPnl(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket.withSpread.indexTokenPrice,
      true
    );
    expect(poolPnl).to.eq(0);

    // 0 PnL
    poolPnl = await reader.getNetPnl(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket.withSpread.indexTokenPrice,
      false
    );
    expect(poolPnl).to.eq(0);

    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    feeAmountCollected = feeAmountCollected.add(expandDecimals(125, 5));
    priceImpactAmountPaidToPool = priceImpactAmountPaidToPool.sub(expandDecimals(3125, 3));
    realizedLossAmount = realizedLossAmount.add(BigNumber.from("10196198751"));

    expect(poolValueInfo.shortTokenAmount).to.eq(
      expandDecimals(5_000_000, 6)
        .add(feeAmountCollected)
        .add(priceImpactAmountPaidToPool)
        .sub(claimedProfitAmount)
        .add(realizedLossAmount)
        .add(2)
    );
    expect(poolValueInfo.longTokenAmount).to.eq(expandDecimals(1_000, 18));

    // Impact pool increase:
    // ~$3.125 in positive impact => impact pool pays out $3.125
    // Denominated in ETH: $3.125 / $7,041 = 0.000443829002 ETH
    impactPoolAmount = impactPoolAmount.sub(BigNumber.from("443829001562279"));
    expect(poolValueInfo.impactPoolAmount).to.eq(impactPoolAmount.add(1));

    const depositedValue = poolValueInfo.shortTokenAmount.mul(expandDecimals(1, 24)).add(expandDecimals(5_000_000, 30));

    expect(poolValueInfo.poolValue).to.eq(depositedValue.sub(impactPoolAmount.add(1).mul(expandDecimals(5000, 12))));
    expect(marketTokenPrice).to.eq("1001036404289800781139000000000");
  });
});
