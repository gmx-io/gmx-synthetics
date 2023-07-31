import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import * as keys from "../../utils/keys";
import { getOrderCount, handleOrder, OrderType } from "../../utils/order";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { getEventData } from "../../utils/event";
import { getPositionCount, getPositionKeys, getAccountPositionCount } from "../../utils/position";
import { prices } from "../../utils/prices";

describe("Guardian.FundingFees", () => {
  let fixture;
  let user0, user1, user2, user3;
  let dataStore, wnt, usdc, reader, referralStorage, ethUsdMarket, ethUsdSingleTokenMarket, exchangeRouter;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({ dataStore, wnt, usdc, reader, referralStorage, ethUsdMarket, ethUsdSingleTokenMarket, exchangeRouter } =
      fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(100, 18),
        shortTokenAmount: expandDecimals(100 * 5000, 6),
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    await handleDeposit(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        longTokenAmount: expandDecimals(200 * 5000, 6),
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });
  });

  it("Funding fees charged in a single token market are the same as those charged for a normal market", async () => {
    // Activate funding fees
    await dataStore.setUint(keys.fundingFactorKey(ethUsdMarket.marketToken), decimalToFloat(5, 10));
    await dataStore.setUint(keys.fundingExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(1));

    expect(await dataStore.getUint(keys.fundingUpdatedAtKey(ethUsdMarket.marketToken))).eq(0);

    await dataStore.setUint(keys.fundingFactorKey(ethUsdSingleTokenMarket.marketToken), decimalToFloat(5, 10));
    await dataStore.setUint(keys.fundingExponentFactorKey(ethUsdSingleTokenMarket.marketToken), decimalToFloat(1));

    expect(await dataStore.getUint(keys.fundingUpdatedAtKey(ethUsdSingleTokenMarket.marketToken))).eq(0);

    // Normal Market - Long 200K
    // user0 opens a $200k long position, using usdc as collateral
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(25_000, 6),
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

    // Normal Market - Short 100K
    // user1 opens a $100k short position, using usdc as collateral
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(10_000, 6),
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

    // Homogenous Market - Long 200K
    // user0 opens a $200k long position, using usdc as collateral
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(25_000, 6),
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

    // Homogenous Market - Short 100K
    // user1 opens a $100k short position, using usdc as collateral
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(10_000, 6),
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

    // Some funding fees accumulate
    await time.increase(14 * 24 * 60 * 60);

    const positionKeys = await getPositionKeys(dataStore, 0, 10);
    expect(positionKeys.length).to.eq(4);
    const normalMarketLongPositionInfo = await reader.getPositionInfo(
      dataStore.address,
      referralStorage.address,
      positionKeys[0],
      prices.ethUsdMarket,
      0, // sizeDeltaUsd
      ethers.constants.AddressZero,
      true // usePositionSizeAsSizeDeltaUsd
    );
    const normalMarketShortPositionInfo = await reader.getPositionInfo(
      dataStore.address,
      referralStorage.address,
      positionKeys[1],
      prices.ethUsdMarket,
      0, // sizeDeltaUsd
      ethers.constants.AddressZero,
      true // usePositionSizeAsSizeDeltaUsd
    );
    const homogenousMarketLongPositionInfo = await reader.getPositionInfo(
      dataStore.address,
      referralStorage.address,
      positionKeys[2],
      prices.ethUsdSingleTokenMarket,
      0, // sizeDeltaUsd
      ethers.constants.AddressZero,
      true // usePositionSizeAsSizeDeltaUsd
    );
    const homogenousMarketShortPositionInfo = await reader.getPositionInfo(
      dataStore.address,
      referralStorage.address,
      positionKeys[3],
      prices.ethUsdSingleTokenMarket,
      0, // sizeDeltaUsd
      ethers.constants.AddressZero,
      true // usePositionSizeAsSizeDeltaUsd
    );

    expect(normalMarketLongPositionInfo.position.addresses.market).to.eq(ethUsdMarket.marketToken);
    expect(normalMarketLongPositionInfo.position.flags.isLong).to.be.true;
    expect(normalMarketShortPositionInfo.position.addresses.market).to.eq(ethUsdMarket.marketToken);
    expect(normalMarketShortPositionInfo.position.flags.isLong).to.be.false;

    // Inaccuracy due to inconsistent funding fee last updated at values -- due to testing timestamp variation
    expect(normalMarketLongPositionInfo.fees.funding.fundingFeeAmount).to.closeTo("40320334", "500"); // ~$40 of funding fees in USDC
    expect(normalMarketShortPositionInfo.fees.funding.fundingFeeAmount).to.eq(0);

    expect(normalMarketShortPositionInfo.fees.funding.claimableLongTokenAmount).to.eq(0);
    expect(normalMarketShortPositionInfo.fees.funding.claimableShortTokenAmount).to.closeTo("40320266", "500");

    expect(normalMarketLongPositionInfo.fees.funding.claimableLongTokenAmount).to.eq(0);
    expect(normalMarketLongPositionInfo.fees.funding.claimableLongTokenAmount).to.eq(0);

    expect(homogenousMarketLongPositionInfo.position.addresses.market).to.eq(ethUsdSingleTokenMarket.marketToken);
    expect(homogenousMarketLongPositionInfo.position.flags.isLong).to.be.true;
    expect(homogenousMarketShortPositionInfo.position.addresses.market).to.eq(ethUsdSingleTokenMarket.marketToken);
    expect(homogenousMarketShortPositionInfo.position.flags.isLong).to.be.false;

    // Notice: The Reader does not accurately value homogenous funding fees
    expect(homogenousMarketLongPositionInfo.fees.funding.fundingFeeAmount).to.closeTo("20160000", "500");
    expect(homogenousMarketShortPositionInfo.fees.funding.fundingFeeAmount).to.eq("0");

    expect(homogenousMarketShortPositionInfo.fees.funding.claimableLongTokenAmount).to.eq("10079999");
    expect(homogenousMarketShortPositionInfo.fees.funding.claimableShortTokenAmount).to.eq("10079999");

    expect(homogenousMarketLongPositionInfo.fees.funding.claimableLongTokenAmount).to.eq(0);
    expect(homogenousMarketLongPositionInfo.fees.funding.claimableShortTokenAmount).to.eq(0);

    // Close Long Homogenous Market -- User0 MarketDecrease for the whole position size
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5000, 12),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");
          expect(positionFeesCollectedEvent.fundingFeeAmount).to.closeTo("40320100", "500");
          expect(positionFeesCollectedEvent.claimableLongTokenAmount).to.eq("0");
          expect(positionFeesCollectedEvent.claimableShortTokenAmount).to.eq("0");
        },
      },
    });

    // Close Long Normal Market -- User0 MarketDecrease for the whole position size
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5000, 12),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");
          expect(positionFeesCollectedEvent.fundingFeeAmount).to.closeTo("40320467", "500"); // Slight differences due to timing
          expect(positionFeesCollectedEvent.claimableLongTokenAmount).to.eq("0");
          expect(positionFeesCollectedEvent.claimableShortTokenAmount).to.eq("0");
        },
      },
    });

    // Close Short Homogenous Market -- User1 MarketDecrease for the whole position size
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000),
        acceptablePrice: expandDecimals(5000, 12),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");
          expect(positionFeesCollectedEvent.fundingFeeAmount).to.eq("0");
          expect(positionFeesCollectedEvent.claimableLongTokenAmount).to.closeTo("20160049", "500");
          expect(positionFeesCollectedEvent.claimableShortTokenAmount).to.closeTo("20160049", "500");
        },
      },
    });

    // Close Short Homogenous Market -- User1 MarketDecrease for the whole position size
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000),
        acceptablePrice: expandDecimals(5000, 12),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");
          expect(positionFeesCollectedEvent.fundingFeeAmount).to.eq("0"); // Slight differences due to timing
          expect(positionFeesCollectedEvent.claimableLongTokenAmount).to.eq("0");
          expect(positionFeesCollectedEvent.claimableShortTokenAmount).to.closeTo("40320466", "500");
        },
      },
    });

    const currentFundingFeeAmountPerSizeLongUSDC = await dataStore.getUint(
      keys.fundingFeeAmountPerSizeKey(ethUsdMarket.marketToken, usdc.address, true)
    );
    const currentFundingFeeAmountPerSizeShortUSDC = await dataStore.getUint(
      keys.fundingFeeAmountPerSizeKey(ethUsdMarket.marketToken, usdc.address, false)
    );
    const currentFundingFeeAmountPerSizeLongETH = await dataStore.getUint(
      keys.fundingFeeAmountPerSizeKey(ethUsdMarket.marketToken, wnt.address, true)
    );
    const currentFundingFeeAmountPerSizeShortETH = await dataStore.getUint(
      keys.fundingFeeAmountPerSizeKey(ethUsdMarket.marketToken, wnt.address, false)
    );

    expect(currentFundingFeeAmountPerSizeLongETH).to.eq(0);
    expect(currentFundingFeeAmountPerSizeShortETH).to.eq(0);
    expect(currentFundingFeeAmountPerSizeShortUSDC).to.eq(0);

    const currentClaimableFundingPerSizeLongUSDC = await dataStore.getUint(
      keys.claimableFundingAmountPerSizeKey(ethUsdMarket.marketToken, usdc.address, true)
    );
    const currentClaimableFundingPerSizeShortUSDC = await dataStore.getUint(
      keys.claimableFundingAmountPerSizeKey(ethUsdMarket.marketToken, usdc.address, false)
    );
    const currentClaimableFundingPerSizeLongETH = await dataStore.getUint(
      keys.claimableFundingAmountPerSizeKey(ethUsdMarket.marketToken, wnt.address, true)
    );
    const currentClaimableFundingPerSizeShortETH = await dataStore.getUint(
      keys.claimableFundingAmountPerSizeKey(ethUsdMarket.marketToken, wnt.address, false)
    );

    expect(currentClaimableFundingPerSizeLongETH).to.eq(0);
    expect(currentClaimableFundingPerSizeShortETH).to.eq(0);
    expect(currentClaimableFundingPerSizeLongUSDC).to.eq(0);

    expect(await getPositionCount(dataStore)).to.eq(0);
    expect(await getOrderCount(dataStore)).to.eq(0);

    // user0 opens a long position and it is stamped with the current funding fee per size value,
    // the position is exempt from the funding fees that have previously accumulated before it's opening
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100_000),
        acceptablePrice: expandDecimals(5000, 12),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");
          expect(positionFeesCollectedEvent.fundingFeeAmount).to.eq("0"); // Slight differences due to timing
          expect(positionFeesCollectedEvent.claimableLongTokenAmount).to.eq("0");
          expect(positionFeesCollectedEvent.claimableShortTokenAmount).to.eq("0");
        },
      },
    });

    const position1Key = (await getPositionKeys(dataStore, 0, 1))[0];
    const position1 = await reader.getPosition(dataStore.address, position1Key);

    expect(position1.addresses.account).to.eq(user0.address);
    expect(position1.numbers.sizeInUsd).to.eq(decimalToFloat(100_000));
    expect(position1.numbers.fundingFeeAmountPerSize).to.eq(currentFundingFeeAmountPerSizeLongUSDC);
    expect(position1.numbers.longTokenClaimableFundingAmountPerSize).to.eq(0);
    expect(position1.numbers.shortTokenClaimableFundingAmountPerSize).to.eq(0);

    // user1 opens a short position and it is stamped with the current claimable funding fee value,
    // the position is exempt from the claimable funding fees that have previously accumulated before it's opening
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000),
        acceptablePrice: expandDecimals(5000, 12),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        afterExecution: ({ logs }) => {
          const positionFeesCollectedEvent = getEventData(logs, "PositionFeesCollected");
          expect(positionFeesCollectedEvent.fundingFeeAmount).to.eq("0"); // Slight differences due to timing
          expect(positionFeesCollectedEvent.claimableLongTokenAmount).to.eq("0");
          expect(positionFeesCollectedEvent.claimableShortTokenAmount).to.eq("0");
        },
      },
    });

    const position2Key = (await getPositionKeys(dataStore, 0, 2))[1];
    expect(position2Key).to.not.eq(position1Key);

    const position2 = await reader.getPosition(dataStore.address, position2Key);
    expect(position2.addresses.account).to.eq(user1.address);
    expect(position2.numbers.sizeInUsd).to.eq(decimalToFloat(100_000));
    expect(position2.numbers.fundingFeeAmountPerSize).to.eq(0);
    expect(position2.numbers.longTokenClaimableFundingAmountPerSize).to.eq(0);
    expect(position2.numbers.shortTokenClaimableFundingAmountPerSize)
      .to.eq(currentClaimableFundingPerSizeShortUSDC)
      .to.closeTo("403204666666666666", "100000000000000");
  });

  it("Funding fees match when paid in different directions", async function () {
    await dataStore.setUint(keys.fundingFactorKey(ethUsdMarket.marketToken), decimalToFloat(1, 10));
    await dataStore.setUint(keys.fundingExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(1));

    expect(await dataStore.getUint(keys.fundingUpdatedAtKey(ethUsdMarket.marketToken))).eq(0);

    await handleDeposit(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(100, 18),
        shortTokenAmount: expandDecimals(100 * 5000, 6),
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50 * 1000, 6), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
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
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50 * 1000, 6), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user2,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50 * 1000, 6), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user3,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(100 * 1000, 6), // $100,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    expect(await getAccountPositionCount(dataStore, user1.address)).eq(1);
    expect(await getAccountPositionCount(dataStore, user2.address)).eq(1);
    expect(await getAccountPositionCount(dataStore, user3.address)).eq(1);
    expect(await getPositionCount(dataStore)).eq(4);

    await time.increase(100 * 24 * 60 * 60);

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await usdc.balanceOf(user0.address)).to.eq(0);
    expect(await usdc.balanceOf(user1.address)).to.eq(0);
    expect(await usdc.balanceOf(user2.address)).to.eq(0);
    expect(await usdc.balanceOf(user3.address)).to.eq(0);

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50 * 1000, 6), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50 * 1000, 6), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user2,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50 * 5000, 18), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user3,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(100 * 1000, 6), // $100,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    const balanceBefore = await usdc.balanceOf(user1.address);

    await exchangeRouter.connect(user1).claimFundingFees([ethUsdMarket.marketToken], [usdc.address], user1.address);

    const balanceAfter = await usdc.balanceOf(user1.address);

    expect(balanceAfter.sub(balanceBefore)).eq("25920009"); // $25.920009

    const balanceBeforeUser2 = await usdc.balanceOf(user2.address);

    await exchangeRouter.connect(user2).claimFundingFees([ethUsdMarket.marketToken], [usdc.address], user2.address);

    const balanceAfterUser2 = await usdc.balanceOf(user2.address);

    expect(balanceAfterUser2.sub(balanceBeforeUser2)).closeTo("25920028", "2000"); // $25.920028

    // Total claimed funding fees
    // 25.920009 + 25.920028 = $51.840037

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
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
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user2,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(20, 18), // $100,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user3,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    await time.increase(100 * 24 * 60 * 60);

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await wnt.balanceOf(user0.address)).to.eq(0);
    expect(await wnt.balanceOf(user1.address)).to.eq(0);
    expect(await wnt.balanceOf(user2.address)).to.eq(0);
    expect(await wnt.balanceOf(user3.address)).to.eq(0);

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user2,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(20, 18), // $100,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user3,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    const balanceBeforeUser0 = await wnt.balanceOf(user0.address);

    await exchangeRouter.connect(user0).claimFundingFees([ethUsdMarket.marketToken], [wnt.address], user0.address);

    const balanceAfterUser0 = await wnt.balanceOf(user0.address);
    expect(balanceAfterUser0.sub(balanceBeforeUser0)).eq("5184013800000000"); // $25.920069

    const balanceBeforeUser3 = await wnt.balanceOf(user3.address);
    await exchangeRouter.connect(user3).claimFundingFees([ethUsdMarket.marketToken], [wnt.address], user3.address);
    const balanceAfterUser3 = await wnt.balanceOf(user3.address);

    expect(balanceAfterUser3.sub(balanceBeforeUser3)).closeTo("5184014799999999", "10000000000"); // $25.920073999999995

    // Total claimed funding fees
    // 25.920069 + 25.920073999999995 = 51.840142999999995

    await handleOrder(fixture, {
      create: {
        account: user3,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
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
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50 * 1000, 6), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user2,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(100 * 1000, 6), // $100,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    expect(await getAccountPositionCount(dataStore, user1.address)).eq(1);
    expect(await getAccountPositionCount(dataStore, user2.address)).eq(1);
    expect(await getAccountPositionCount(dataStore, user3.address)).eq(1);
    expect(await getPositionCount(dataStore)).eq(4);

    await time.increase(100 * 24 * 60 * 60);

    expect(await getOrderCount(dataStore)).to.eq(0);

    await handleOrder(fixture, {
      create: {
        account: user3,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50 * 1000, 6), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user2,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18), // $50,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(100 * 1000, 18), // $100,000
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200 * 1000), // 2x Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    const USDCBalanceBeforeUser1 = await usdc.balanceOf(user1.address);

    await exchangeRouter.connect(user1).claimFundingFees([ethUsdMarket.marketToken], [usdc.address], user1.address);

    const USDCBalanceAfterUser1 = await usdc.balanceOf(user1.address);

    expect(USDCBalanceAfterUser1.sub(USDCBalanceBeforeUser1)).eq("17280006"); // $17.280006

    const USDCBalanceBeforeUser2 = await usdc.balanceOf(user2.address);

    await exchangeRouter.connect(user2).claimFundingFees([ethUsdMarket.marketToken], [usdc.address], user2.address);

    const USDCBalanceAfterUser2 = await usdc.balanceOf(user2.address);

    expect(USDCBalanceAfterUser2.sub(USDCBalanceBeforeUser2)).eq("17280025"); // $17.280025

    const WNTBalanceBeforeUser1 = await wnt.balanceOf(user1.address);

    await exchangeRouter.connect(user1).claimFundingFees([ethUsdMarket.marketToken], [wnt.address], user1.address);

    const WNTBalanceAfterUser1 = await wnt.balanceOf(user1.address);

    expect(WNTBalanceAfterUser1.sub(WNTBalanceBeforeUser1)).eq("1728000600000000"); // $8.640003

    const WNTBalanceBeforeUser2 = await wnt.balanceOf(user2.address);

    await exchangeRouter.connect(user2).claimFundingFees([ethUsdMarket.marketToken], [wnt.address], user2.address);

    const WNTBalanceAfterUser2 = await wnt.balanceOf(user2.address);

    expect(WNTBalanceAfterUser2.sub(WNTBalanceBeforeUser2)).eq("1728000600000000"); // $8.640003

    // Total claimed funding fees
    // 17.280006 + 17.280006 + 8.640003 + 8.640003 = $51.840018
  });
});
