import { contractAt, deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";

import { grantRole } from "../../utils/role";
import { validateStoreUtils } from "../../utils/storeUtils";
import {
  getPositionCount,
  getPositionKeys,
  getAccountPositionCount,
  getAccountPositionKeys,
} from "../../utils/position";
import { handleDeposit } from "../../utils/deposit";
import { applyFactor, bigNumberify, decimalToFloat, expandDecimals } from "../../utils/math";
import { getOrderKeys, handleOrder, OrderType } from "../../utils/order";
import * as keys from "../../utils/keys";
import { expect } from "chai";
import { scenes } from "../scenes";
import { usingResult } from "../../utils/use";
import { getMarketTokenPrice, getMarketTokenPriceWithPoolValue } from "../../utils/market";
import { prices } from "../../utils/prices";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { handleWithdrawal } from "../../utils/withdrawal";
import { SwapPricingType } from "../../utils/swap";
import { constants } from "ethers";

// eslint-disable-next-line no-undef
describe("Hedge GM", () => {
  let fixture;
  let dataStore, exchangeRouter, reader, referralStorage, ethUsdMarket, wnt, usdc;
  let user0, user1;

  const highPrices = {
    indexTokenPrice: {
      min: expandDecimals(5500, 12),
      max: expandDecimals(5500, 12),
    },
    longTokenPrice: {
      min: expandDecimals(5500, 12),
      max: expandDecimals(5500, 12),
    },
    shortTokenPrice: {
      min: expandDecimals(1, 24),
      max: expandDecimals(1, 24),
    },
  };

  const pricesWith10PercentDiscount = {
    indexTokenPrice: {
      min: expandDecimals(4950, 12),
      max: expandDecimals(4950, 12),
    },
    longTokenPrice: {
      min: expandDecimals(4950, 12),
      max: expandDecimals(4950, 12),
    },
    shortTokenPrice: {
      min: expandDecimals(1, 24),
      max: expandDecimals(1, 24),
    },
  };

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ dataStore, reader, exchangeRouter, referralStorage, ethUsdMarket, wnt, usdc } = fixture.contracts);
    ({ user0, user1 } = fixture.accounts);

    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    await setMarketState(ethUsdMarket);
  });

  // make initial deposit
  // generate price impact pool about 10% size of the pool value
  // generate borrowing fees about 15% of the pool value
  async function setMarketState(market) {
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(market.marketToken))).eq(0);

    // 5m$ pool value with prices 5000$ per ETH
    // 500 ETH * 5000$ + 2_500_000 USDC
    await handleDeposit(fixture, {
      create: {
        account: user0,
        market: market,
        longTokenAmount: expandDecimals(500, 18),
        shortTokenAmount: expandDecimals(2_500_000, 6),
      },
    });

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(poolValueInfo.poolValue).eq(expandDecimals(5_000_000, 30));
      }
    );

    await scenes.increasePosition.short(fixture, {
      create: {
        sizeDeltaUsd: decimalToFloat(20_000),
        initialCollateralDeltaAmount: expandDecimals(1, 18),
      },
    });

    for (let i = 0; i < 200; i++) {
      await scenes.increasePosition.long(fixture, {
        create: {
          sizeDeltaUsd: decimalToFloat(750_000),
          initialCollateralDeltaAmount: expandDecimals(200_000, 6),
        },
      });

      await scenes.decreasePosition.long.positivePnl(fixture, {
        create: {
          receiver: user0,
          initialCollateralDeltaAmount: 0,
          sizeDeltaUsd: decimalToFloat(750_000),
        },
      });
    }

    await scenes.decreasePosition.short(fixture, {
      create: {
        sizeDeltaUsd: decimalToFloat(20_000),
        initialCollateralDeltaAmount: 0,
      },
    });

    // PriceImpactPool generated
    // 100 ETH ~ $500_000 = 10% of initial pool size
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(market.marketToken))).closeTo(
      "107084384063745019801",
      "10000000"
    );

    //Generate borrowing fees
    await dataStore.setUint(keys.borrowingFactorKey(market.marketToken, true), decimalToFloat(10, 7));
    await dataStore.setUint(keys.borrowingFactorKey(market.marketToken, false), decimalToFloat(0, 7));
    await dataStore.setUint(keys.borrowingExponentFactorKey(market.marketToken, true), decimalToFloat(1));
    await dataStore.setUint(keys.borrowingExponentFactorKey(market.marketToken, false), decimalToFloat(0));

    await handleOrder(fixture, {
      create: {
        account: user1,
        market: market,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(500_000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user1,
        market: market,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(15, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(450_000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await time.increase(60 * 24 * 60 * 60);

    // about $650k(15% pool value) transferred to the pool as borrowing fees.
    const position0 = await getPositionInfo(0);
    expect(position0.fees.borrowing.borrowingFeeUsd).closeTo(
      "681247976991655602198406137576000000",
      "1000000000000000000000"
    );
  }

  async function getPositionInfo(positionId) {
    const positionKeys = await getPositionKeys(dataStore, positionId, positionId + 1);

    const positionPrices = {
      indexTokenPrice: {
        min: expandDecimals(5000, 12),
        max: expandDecimals(5000, 12),
      },
      longTokenPrice: {
        min: expandDecimals(5000, 12),
        max: expandDecimals(5000, 12),
      },
      shortTokenPrice: {
        min: expandDecimals(1, 24),
        max: expandDecimals(1, 24),
      },
    };
    const position0 = await reader.getPositionInfo(
      dataStore.address,
      referralStorage.address,
      positionKeys[0],
      positionPrices,
      0, // sizeDeltaUsd
      ethers.constants.AddressZero,
      true // usePositionSizeAsSizeDeltaUsd
    );
    return position0;
  }

  async function getLongExposure(market, user, prices) {
    const PIPool = await dataStore.getUint(keys.positionImpactPoolAmountKey(market.marketToken));
    console.log(`\n\nPI pool: ${PIPool.toString()}`);

    const [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices,
      market: market,
    });

    console.log(`PV: ${poolValueInfo.poolValue.toString()}, longTokenAmount: ${poolValueInfo.longTokenAmount.toString()},
      shortTokenAmount: ${poolValueInfo.shortTokenAmount.toString()},
        longTokenUsd: ${poolValueInfo.longTokenUsd.toString()}, shortTokenUsd: ${poolValueInfo.shortTokenUsd.toString()},
         totalBorrowingFees: ${poolValueInfo.totalBorrowingFees.toString()},`);

    const _marketToken = await contractAt("MintableToken", market.marketToken);
    const marketTokenAmount = await _marketToken.balanceOf(user.address);
    const marketTokenSupply = await _marketToken.totalSupply();
    console.log(`Supply: ${marketTokenSupply.toString()}, tokens: ${marketTokenAmount.toString()}`);
    const userShare = marketTokenAmount.mul(expandDecimals(1, 18)).div(marketTokenSupply);

    const userLongTokenShare = poolValueInfo.longTokenAmount.mul(userShare).div(expandDecimals(1, 18));
    const userShortTokenShare = poolValueInfo.shortTokenAmount.mul(userShare).div(expandDecimals(1, 18));

    const userDirectShareUSD = userLongTokenShare
      .mul(prices.longTokenPrice.min)
      .add(userShortTokenShare.mul(prices.shortTokenPrice.min));

    console.log(`UserShare: ${userShare.toString()}, UserDirectShare: ${userDirectShareUSD.toString()},
     userLongTokenShare: ${userLongTokenShare.toString()}`);

    const oiLong = await dataStore.getUint(keys.openInterestInTokensKey(ethUsdMarket.marketToken, wnt.address, true));
    const oiShort = await dataStore.getUint(keys.openInterestInTokensKey(ethUsdMarket.marketToken, wnt.address, false));
    console.log(`oiLong: ${oiLong.toString()}, olShort: ${oiShort.toString()}`);

    const longTokenPoolShare = poolValueInfo.longTokenUsd
      .mul(expandDecimals(1, 30))
      .div(poolValueInfo.longTokenUsd.add(poolValueInfo.shortTokenUsd));
    console.log(`longTokenPoolShare: ${longTokenPoolShare.toString()}`);

    const oiDiffInLongToken = oiLong.sub(oiShort).div(prices.longTokenPrice.min);
    console.log(`OI diff: ${oiDiffInLongToken.toString()}`);

    const exposure = poolValueInfo.longTokenAmount
      .sub(PIPool)
      .sub(oiLong)
      .add(oiShort)
      .mul(userShare)
      .div(expandDecimals(1, 6));

    return exposure;
  }

  it("calc hedge amount for a paired asset deposit", async () => {
    // User mints GM tokens for a $525k worth @ $5500 /ETH
    // deposit composition is 50 ETH + 250_000 USDC
    const userEthBalance = await wnt.balanceOf(user1.address);
    const userUsdcBalance = await usdc.balanceOf(user1.address);
    const _marketToken = await contractAt("MintableToken", ethUsdMarket.marketToken);
    let userGMTokenAmount = await _marketToken.balanceOf(user1.address);
    expect(userGMTokenAmount).eq(0);

    const userDepositUsdValue = expandDecimals(50, 18)
      .mul(expandDecimals(5500, 0))
      .add(expandDecimals(275_000, 18))
      .div(expandDecimals(1, 18));

    await handleDeposit(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(50, 18),
        shortTokenAmount: expandDecimals(275_000, 6),
      },
      execute: {
        tokens: [wnt.address, usdc.address],
        precisions: [8, 18],
        minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
      },
    });
    userGMTokenAmount = await _marketToken.balanceOf(user1.address);
    console.log("User market token amount: ", userGMTokenAmount.toString());

    const gmTokenPrice = await getMarketTokenPrice(fixture, { prices: pricesWith10PercentDiscount });
    console.log(`GM price: ${gmTokenPrice.toString()}`);

    // estimate USD value of GM tokens
    const marketTokenUSDValue = gmTokenPrice.mul(userGMTokenAmount).div(expandDecimals(1, 48));
    console.log("MarketTokenUSDValue: ", marketTokenUSDValue.toString());
    expect(marketTokenUSDValue).eq("533562");

    // estimate amount of tokens to widthdrawal
    const withdrawalAmountOut = await reader.getWithdrawalAmountOut(
      dataStore.address,
      ethUsdMarket,
      pricesWith10PercentDiscount,
      userGMTokenAmount,
      constants.AddressZero,
      SwapPricingType.TwoStep
    );
    console.log(`WithdrawalAmountOut[0]: ${withdrawalAmountOut[0].toString()},
     WithdrawalAmountOut[1]: ${withdrawalAmountOut[1].toString()}`);

    // expect withdrawal token price equal market token value
    const withdrawalCompositionUsdValue = withdrawalAmountOut[0]
      .mul(expandDecimals(4950, 0))
      .add(expandDecimals(withdrawalAmountOut[1], 12))
      .div(expandDecimals(1, 18));
    expect(withdrawalCompositionUsdValue).eq(marketTokenUSDValue);

    // Calculate exposure to long token
    const longExposure = await getLongExposure(ethUsdMarket, user1, pricesWith10PercentDiscount);
    console.log(`LongExposure: ${longExposure.toString()}\n\n`);

    // Calculate user PnL after long token price drops by 10%
    const expectedPnL = longExposure
      .mul(pricesWith10PercentDiscount.longTokenPrice.min)
      .sub(longExposure.mul(highPrices.longTokenPrice.min))
      .div(expandDecimals(1, 42));
    console.log(`ExpectedPnL: ${expectedPnL}`);

    await handleWithdrawal(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        marketTokenAmount: userGMTokenAmount,
        minLongTokenAmount: 0,
      },
      execute: {
        minPrices: [expandDecimals(4950, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(4950, 4), expandDecimals(1, 6)],
      },
    });

    const PIPool = await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken));
    console.log(`\n\nPI pool: ${PIPool.toString()}`);

    const userEthBalance2 = await wnt.balanceOf(user1.address);
    const userUsdcBalance2 = await usdc.balanceOf(user1.address);

    console.log(`user Eth balance withdraw: ${userEthBalance2.sub(userEthBalance).toString()}`);
    console.log(`user USDC balance withdraw: ${userUsdcBalance2.sub(userUsdcBalance).toString()}`);

    const userBalance = userEthBalance2
      .sub(userEthBalance)
      .mul(expandDecimals(4950, 0))
      .add(expandDecimals(userUsdcBalance2.sub(userUsdcBalance), 12))
      .div(expandDecimals(1, 18));
    console.log("User balance: ", userBalance.toString());
    expect(userBalance).eq(marketTokenUSDValue);

    console.log(userDepositUsdValue.toString());
    const userLongPnl = userBalance.sub(userDepositUsdValue);
    console.log("PNL: ", userLongPnl.toString());

    // Expect that PnL calculated from longExposure to be close with the real PnL with 1 USD tolerance
    expect(expectedPnL.sub(userLongPnl)).closeTo("0", "1");
  });

  // eslint-disable-next-line no-undef
  xit("calc hedge amount for a single asset deposit", async () => {
    // User mints GM tokens for a $550k worth @ $5500 /ETH
    // deposit in a single asset
    const userEthBalance = await wnt.balanceOf(user1.address);
    const userUsdcBalance = await usdc.balanceOf(user1.address);
    const _marketToken = await contractAt("MintableToken", ethUsdMarket.marketToken);
    let userGMTokenAmount = await _marketToken.balanceOf(user1.address);
    expect(userGMTokenAmount).eq(0);

    const userDepositUsdValue = expandDecimals(100, 18).mul(expandDecimals(5500, 0)).div(expandDecimals(1, 18));
    await handleDeposit(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(100, 18),
        shortTokenAmount: 0,
      },
      execute: {
        tokens: [wnt.address, usdc.address],
        precisions: [8, 18],
        minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
      },
    });
    userGMTokenAmount = await _marketToken.balanceOf(user1.address);
    expect(userGMTokenAmount).eq("527074608208642123556391");

    // estimate amount of tokens to widthdrawal
    const withdrawalAmountOut0 = await reader.getWithdrawalAmountOut(
      dataStore.address,
      ethUsdMarket,
      highPrices,
      userGMTokenAmount,
      constants.AddressZero,
      SwapPricingType.TwoStep
    );
    expect(withdrawalAmountOut0[0]).eq("46523622539616770630");
    expect(withdrawalAmountOut0[1]).eq("294120076032");

    const gmTokenPrice = await getMarketTokenPrice(fixture, { prices: pricesWith10PercentDiscount });
    // estimate USD value of GM tokens
    const marketTokenUSDValue = gmTokenPrice.mul(userGMTokenAmount).div(expandDecimals(1, 48));
    expect(marketTokenUSDValue).eq("530940");

    // estimate amount of tokens to widthdrawal
    const withdrawalAmountOut = await reader.getWithdrawalAmountOut(
      dataStore.address,
      ethUsdMarket,
      pricesWith10PercentDiscount,
      userGMTokenAmount,
      constants.AddressZero,
      SwapPricingType.TwoStep
    );
    expect(withdrawalAmountOut[0]).eq("47102780164374696009");
    expect(withdrawalAmountOut[1]).eq("297781482331");
    // expect withdrawal token price equal market token value
    const withdrawalCompositionUsdValue = withdrawalAmountOut[0]
      .mul(expandDecimals(4950, 0))
      .add(expandDecimals(withdrawalAmountOut[1], 12))
      .div(expandDecimals(1, 18));
    expect(withdrawalCompositionUsdValue).eq(marketTokenUSDValue);

    await handleWithdrawal(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        marketTokenAmount: userGMTokenAmount,
        minLongTokenAmount: 0,
      },
      execute: {
        minPrices: [expandDecimals(4950, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(4950, 4), expandDecimals(1, 6)],
      },
    });

    const userEthBalance2 = await wnt.balanceOf(user1.address);
    const userUsdcBalance2 = await usdc.balanceOf(user1.address);

    const userBalance = userEthBalance2
      .sub(userEthBalance)
      .mul(expandDecimals(4950, 0))
      .add(expandDecimals(userUsdcBalance2.sub(userUsdcBalance), 12))
      .div(expandDecimals(1, 18));
    expect(userBalance).eq(marketTokenUSDValue);

    console.log(userDepositUsdValue.toString());
    const userLongPnl = userBalance.sub(userDepositUsdValue);
    console.log("PNL: ", userLongPnl.toString());
    const userPnLPercent = userLongPnl.mul(expandDecimals(1, 18)).div(userDepositUsdValue);
    console.log("PNL%: ", userPnLPercent.toString());
  });
});
