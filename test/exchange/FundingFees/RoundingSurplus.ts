import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { handleDeposit } from "../../../utils/deposit";
import { OrderType, handleOrder } from "../../../utils/order";
import { getPositionKeys } from "../../../utils/position";
import { prices } from "../../../utils/prices";
import * as keys from "../../../utils/keys";

/**
 * Tests that funding fee rounding creates a surplus (market gains tokens).
 *
 * Rounding scheme:
 * - fundingFeeAmount (owed by positions): rounded UP
 * - claimableFundingAmount (receivable by positions): rounded DOWN
 *
 * This ensures paid >= claimable, so the market always has sufficient tokens.
 */
describe("Exchange.FundingFees.RoundingSurplus", () => {
  let fixture;
  let user0, user1;
  let dataStore, usdc, reader, referralStorage, ethUsdSingleTokenMarket, exchangeRouter;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ dataStore, usdc, reader, referralStorage, ethUsdSingleTokenMarket, exchangeRouter } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdSingleTokenMarket,
        longTokenAmount: expandDecimals(1_000_000, 6),
      },
    });

    // Set funding factor
    await dataStore.setUint(keys.fundingFactorKey(ethUsdSingleTokenMarket.marketToken), decimalToFloat(1, 8));
    await dataStore.setUint(keys.fundingExponentFactorKey(ethUsdSingleTokenMarket.marketToken), decimalToFloat(1));
  });

  it("funding fee rounding creates surplus (paid > claimable)", async () => {
    const marketToken = ethUsdSingleTokenMarket.marketToken;
    const token = usdc.address;

    // Create imbalanced positions: $200k long vs $100k short
    // Longs pay funding to shorts
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50_000, 6),
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(5050, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(25_000, 6),
        sizeDeltaUsd: decimalToFloat(100_000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketIncrease,
        isLong: false,
      },
    });

    // Advance time to accumulate funding (50 days)
    await time.increase(50 * 24 * 60 * 60);

    // Get position keys and funding info
    const positionKeys = await getPositionKeys(dataStore, 0, 10);

    const longPositionInfo = await reader.getPositionInfo(
      dataStore.address,
      referralStorage.address,
      positionKeys[0],
      prices.ethUsdSingleTokenMarket,
      0,
      ethers.constants.AddressZero,
      true
    );

    const shortPositionInfo = await reader.getPositionInfo(
      dataStore.address,
      referralStorage.address,
      positionKeys[1],
      prices.ethUsdSingleTokenMarket,
      0,
      ethers.constants.AddressZero,
      true
    );

    const fundingFeePaid = longPositionInfo.fees.funding.fundingFeeAmount;
    const claimableLong = shortPositionInfo.fees.funding.claimableLongTokenAmount;
    const claimableShort = shortPositionInfo.fees.funding.claimableShortTokenAmount;
    const totalClaimable = claimableLong.add(claimableShort);

    // Rounding should create surplus: paid > claimable
    expect(fundingFeePaid).to.be.gt(totalClaimable);

    // Close positions
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        sizeDeltaUsd: decimalToFloat(100_000),
        acceptablePrice: expandDecimals(5050, 12),
        orderType: OrderType.MarketDecrease,
        isLong: false,
      },
    });

    const claimableInDataStore = await dataStore.getUint(
      keys.claimableFundingAmountKey(marketToken, token, user1.address)
    );
    const userBalanceBefore = await usdc.balanceOf(user1.address);
    await exchangeRouter.connect(user1).claimFundingFees([marketToken], [token], user1.address);
    const userBalanceAfter = await usdc.balanceOf(user1.address);

    expect(userBalanceAfter.sub(userBalanceBefore)).to.eq(claimableInDataStore);
  });
});
