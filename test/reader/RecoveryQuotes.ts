import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { handleDeposit } from "../../utils/deposit";
import { handleGlvDeposit } from "../../utils/glv";
import { handleOrder, OrderType } from "../../utils/order";
import { getPositionKeys } from "../../utils/position";
import { decimalToFloat, expandDecimals } from "../../utils/math";
import { prices } from "../../utils/prices";
import { errorsContract } from "../../utils/error";
import { SwapPricingType } from "../../utils/swap";
import * as keys from "../../utils/keys";

describe("Reader.ZeroPoolRecoveryQuotes", () => {
  let fixture;
  let user0;
  let reader, glvReader, dataStore, referralStorage;
  let ethUsdMarket, ethUsdGlvAddress, wnt;
  let positionKey;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ reader, glvReader, dataStore, referralStorage, ethUsdMarket, ethUsdGlvAddress, wnt } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(100, 18),
        shortTokenAmount: expandDecimals(500_000, 6),
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(2, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(5000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {},
    });

    [positionKey] = await getPositionKeys(dataStore, 0, 1);

    await handleGlvDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(50_000, 6),
      },
    });

    await dataStore.setUint(keys.poolAmountKey(ethUsdMarket.marketToken, wnt.address), 0);
  });

  it("quotes an executable market deposit while preserving strict withdrawal valuation", async () => {
    const amountOut = await reader.getDepositAmountOut(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket,
      expandDecimals(1, 18),
      expandDecimals(5000, 6),
      ethers.constants.AddressZero,
      SwapPricingType.TwoStep,
      true
    );
    expect(amountOut).gt(0);

    await expect(
      reader.getMarketTokenPrice(
        dataStore.address,
        ethUsdMarket,
        prices.ethUsdMarket.indexTokenPrice,
        prices.ethUsdMarket.longTokenPrice,
        prices.ethUsdMarket.shortTokenPrice,
        keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
        true
      )
    ).to.be.revertedWithCustomError(errorsContract, "UnableToGetBorrowingFactorEmptyPoolUsd");

    const [marketTokenPrice] = await reader.getMarketTokenPriceForDeposit(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket.indexTokenPrice,
      prices.ethUsdMarket.longTokenPrice,
      prices.ethUsdMarket.shortTokenPrice,
      keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
      true
    );
    expect(marketTokenPrice).gt(0);

    await expect(
      reader.getWithdrawalAmountOut(
        dataStore.address,
        ethUsdMarket,
        prices.ethUsdMarket,
        expandDecimals(1, 18),
        ethers.constants.AddressZero,
        SwapPricingType.TwoStep
      )
    ).to.be.revertedWithCustomError(errorsContract, "UnableToGetBorrowingFactorEmptyPoolUsd");
  });

  it("provides deposit-oriented GLV value and token price quotes", async () => {
    const marketAddresses = [ethUsdMarket.marketToken];
    const indexTokenPrices = [prices.ethUsdMarket.indexTokenPrice];

    await expect(
      glvReader.getGlvValue(
        dataStore.address,
        marketAddresses,
        indexTokenPrices,
        prices.ethUsdMarket.longTokenPrice,
        prices.ethUsdMarket.shortTokenPrice,
        ethUsdGlvAddress,
        true
      )
    ).to.be.revertedWithCustomError(errorsContract, "UnableToGetBorrowingFactorEmptyPoolUsd");

    await expect(
      glvReader.getGlvTokenPrice(
        dataStore.address,
        marketAddresses,
        indexTokenPrices,
        prices.ethUsdMarket.longTokenPrice,
        prices.ethUsdMarket.shortTokenPrice,
        ethUsdGlvAddress,
        true
      )
    ).to.be.revertedWithCustomError(errorsContract, "UnableToGetBorrowingFactorEmptyPoolUsd");

    const glvValue = await glvReader.getGlvValueForDeposit(
      dataStore.address,
      marketAddresses,
      indexTokenPrices,
      prices.ethUsdMarket.longTokenPrice,
      prices.ethUsdMarket.shortTokenPrice,
      ethUsdGlvAddress,
      true
    );
    const [glvTokenPrice, value] = await glvReader.getGlvTokenPriceForDeposit(
      dataStore.address,
      marketAddresses,
      indexTokenPrices,
      prices.ethUsdMarket.longTokenPrice,
      prices.ethUsdMarket.shortTokenPrice,
      ethUsdGlvAddress,
      true
    );

    expect(glvValue).gt(0);
    expect(value).eq(glvValue);
    expect(glvTokenPrice).gt(0);
  });

  it("quotes nonzero decreases through all position-info endpoints", async () => {
    await expect(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKey,
        prices.ethUsdMarket,
        0,
        ethers.constants.AddressZero,
        false
      )
    ).to.be.revertedWithCustomError(errorsContract, "UnableToGetBorrowingFactorEmptyPoolUsd");

    const positionInfo = await reader.getPositionInfo(
      dataStore.address,
      referralStorage.address,
      positionKey,
      prices.ethUsdMarket,
      decimalToFloat(1000),
      ethers.constants.AddressZero,
      false
    );
    expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(5000));

    const positionInfoList = await reader.getPositionInfoList(
      dataStore.address,
      referralStorage.address,
      [positionKey],
      [prices.ethUsdMarket],
      ethers.constants.AddressZero
    );
    expect(positionInfoList.length).eq(1);

    const accountPositionInfoList = await reader.getAccountPositionInfoList(
      dataStore.address,
      referralStorage.address,
      user0.address,
      [ethUsdMarket.marketToken],
      [prices.ethUsdMarket],
      ethers.constants.AddressZero,
      0,
      10
    );
    expect(accountPositionInfoList.length).eq(1);
  });

  it("returns market information with per-side borrowing availability", async () => {
    const marketInfo = await reader.getMarketInfo(dataStore.address, prices.ethUsdMarket, ethUsdMarket.marketToken);
    expect(marketInfo.market.marketToken).eq(ethUsdMarket.marketToken);
    expect(marketInfo.borrowingFactorPerSecondForLongs).eq(0);
    expect(marketInfo.borrowingFactorForLongsAvailable).eq(false);
    expect(marketInfo.borrowingFactorForShortsAvailable).eq(true);

    const gmxUsdMarketPrices = {
      indexTokenPrice: {
        min: expandDecimals(20, 12),
        max: expandDecimals(20, 12),
      },
      longTokenPrice: {
        min: expandDecimals(20, 12),
        max: expandDecimals(20, 12),
      },
      shortTokenPrice: prices.ethUsdMarket.shortTokenPrice,
    };

    const marketInfoList = await reader.getMarketInfoList(
      dataStore.address,
      [prices.ethUsdMarket, gmxUsdMarketPrices],
      0,
      2
    );
    expect(marketInfoList.length).eq(2);
    expect(marketInfoList[0].market.marketToken).eq(ethUsdMarket.marketToken);
    expect(marketInfoList[0].borrowingFactorForLongsAvailable).eq(false);
    expect(marketInfoList[1].borrowingFactorForLongsAvailable).eq(true);
    expect(marketInfoList[1].borrowingFactorForShortsAvailable).eq(true);
  });
});
