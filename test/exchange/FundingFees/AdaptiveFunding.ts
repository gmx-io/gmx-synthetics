import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { usingResult } from "../../../utils/use";
import { deployFixture } from "../../../utils/fixture";
import { getExecuteParams } from "../../../utils/exchange";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { handleDeposit } from "../../../utils/deposit";
import { OrderType, handleOrder } from "../../../utils/order";
import { getEventData } from "../../../utils/event";
import { prices } from "../../../utils/prices";
import * as keys from "../../../utils/keys";

describe("Exchange.FundingFees.AdaptiveFunding", () => {
  let fixture;
  let user0, user1;
  let dataStore, reader, ethUsdMarket, ethUsdSingleTokenMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ dataStore, reader, ethUsdMarket, ethUsdSingleTokenMarket, wnt, usdc } = fixture.contracts);

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

  async function testAdaptiveFunding(useOpenInterestInTokensForBalance) {
    if (useOpenInterestInTokensForBalance) {
      await dataStore.setBool(keys.USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE, true);
    }

    await dataStore.setUint(keys.fundingFactorKey(ethUsdMarket.marketToken), decimalToFloat(1, 10));
    await dataStore.setUint(keys.fundingExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(1));

    await dataStore.setUint(keys.thresholdForStableFundingKey(ethUsdMarket.marketToken), decimalToFloat(5, 2)); // 5%
    await dataStore.setUint(keys.thresholdForDecreaseFundingKey(ethUsdMarket.marketToken), decimalToFloat(3, 2)); // 3%
    await dataStore.setUint(keys.fundingIncreaseFactorPerSecondKey(ethUsdMarket.marketToken), decimalToFloat(1, 6)); // 0.0001%
    await dataStore.setUint(keys.fundingDecreaseFactorPerSecondKey(ethUsdMarket.marketToken), decimalToFloat(2, 8)); // 0.000002%
    await dataStore.setUint(keys.minFundingFactorPerSecondKey(ethUsdMarket.marketToken), 0);
    await dataStore.setUint(keys.maxFundingFactorPerSecondKey(ethUsdMarket.marketToken), decimalToFloat(1));

    // user0 opens a $106k long position, using wnt as collateral
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(106_000),
        acceptablePrice: expandDecimals(5050, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
    });

    // user1 opens a $94k short position, using usdc as collateral
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(10_000, 6),
        sizeDeltaUsd: decimalToFloat(94_000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketIncrease,
        isLong: false,
      },
    });

    await usingResult(
      reader.getMarketInfo(dataStore.address, prices.ethUsdMarket, ethUsdMarket.marketToken),
      (marketInfo) => {
        expect(marketInfo.nextFunding.fundingFactorPerSecond).eq(0);
        expect(marketInfo.nextFunding.nextSavedFundingFactorPerSecond).eq(0);
      }
    );

    await time.increase(10 * 60);

    await usingResult(
      reader.getMarketInfo(dataStore.address, prices.ethUsdMarket, ethUsdMarket.marketToken),
      (marketInfo) => {
        expect(marketInfo.nextFunding.longsPayShorts).eq(true);
        // diff in open interest: 12k / 200k = 6%
        // fundingIncreaseFactorPerSecond: 0.0001%
        // increase in funding: 6% * 0.0001% * 600 = 0.0036%
        expect(marketInfo.nextFunding.fundingFactorPerSecond).eq("36000000000000000000000000"); // 0.0036%
        expect(marketInfo.nextFunding.nextSavedFundingFactorPerSecond).eq("36000000000000000000000000"); // 0.0036%
      }
    );

    // increase position by a small amount to update the savedFundingFactor
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(1, 6),
        sizeDeltaUsd: decimalToFloat(1),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketIncrease,
        isLong: false,
      },
    });

    await usingResult(
      reader.getMarketInfo(dataStore.address, prices.ethUsdMarket, ethUsdMarket.marketToken),
      (marketInfo) => {
        expect(marketInfo.nextFunding.longsPayShorts).eq(true);
        expect(marketInfo.nextFunding.fundingFactorPerSecond).eq("36240000000000000000000000"); // 0.003624%
        expect(marketInfo.nextFunding.nextSavedFundingFactorPerSecond).eq("36240000000000000000000000"); // 0.003624%
      }
    );

    await time.increase(10 * 60);

    await usingResult(
      reader.getMarketInfo(dataStore.address, prices.ethUsdMarket, ethUsdMarket.marketToken),
      (marketInfo) => {
        expect(marketInfo.nextFunding.longsPayShorts).eq(true);
        // diff in open interest: 12k / 200k = 6%
        // fundingIncreaseFactorPerSecond: 0.0001%
        // increase in funding: 6% * 0.0001% * 600 = 0.0036%
        // new funding = 0.0036% + 0.0036% = 0.0072%
        expect(marketInfo.nextFunding.fundingFactorPerSecond).eq("72236820015899920500397200"); // 0.00722%
        expect(marketInfo.nextFunding.nextSavedFundingFactorPerSecond).eq("72236820015899920500397200"); // 0.00722%
      }
    );

    // user0 decreases long position by $2k, new position size: $104k
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        sizeDeltaUsd: decimalToFloat(2000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
    });

    // user1 increases short position by $2k, new position size: $96k
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        sizeDeltaUsd: decimalToFloat(2000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketIncrease,
        isLong: false,
      },
    });

    await usingResult(
      reader.getMarketInfo(dataStore.address, prices.ethUsdMarket, ethUsdMarket.marketToken),
      (marketInfo) => {
        expect(marketInfo.nextFunding.longsPayShorts).eq(true);
        expect(marketInfo.nextFunding.fundingFactorPerSecond).closeTo(
          "72637888432138635383224410",
          "100000000000000000000000"
        ); // 0.00726%
        expect(marketInfo.nextFunding.nextSavedFundingFactorPerSecond).closeTo(
          "72637888432138635383224410",
          "100000000000000000000000"
        ); // 0.00726%
      }
    );

    await time.increase(10 * 60);

    await usingResult(
      reader.getMarketInfo(dataStore.address, prices.ethUsdMarket, ethUsdMarket.marketToken),
      (marketInfo) => {
        expect(marketInfo.nextFunding.longsPayShorts).eq(true);
        // diff in open interest: 8k / 200k = 4%
        // funding rate should not change
        expect(marketInfo.nextFunding.fundingFactorPerSecond).closeTo(
          "72637888432138635383224410",
          "100000000000000000000000"
        ); // 0.00726%
        expect(marketInfo.nextFunding.nextSavedFundingFactorPerSecond).closeTo(
          "72637888432138635383224410",
          "100000000000000000000000"
        ); // 0.00726%
      }
    );

    // user0 decreases long position by $2k, new position size: $102k
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        sizeDeltaUsd: decimalToFloat(2000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
    });

    // user1 increases short position by $2k, new position size: $98k
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        sizeDeltaUsd: decimalToFloat(2000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketIncrease,
        isLong: false,
      },
    });

    await usingResult(
      reader.getMarketInfo(dataStore.address, prices.ethUsdMarket, ethUsdMarket.marketToken),
      (marketInfo) => {
        expect(marketInfo.nextFunding.longsPayShorts).eq(true);
        expect(marketInfo.nextFunding.fundingFactorPerSecond).closeTo(
          "72618803095782552410311774",
          "100000000000000000000000"
        ); // 0.00726%
        expect(marketInfo.nextFunding.nextSavedFundingFactorPerSecond).closeTo(
          "72618803095782552410311774",
          "100000000000000000000000"
        ); // 0.00726%
      }
    );

    await time.increase(10 * 60);

    await usingResult(
      reader.getMarketInfo(dataStore.address, prices.ethUsdMarket, ethUsdMarket.marketToken),
      (marketInfo) => {
        expect(marketInfo.nextFunding.longsPayShorts).eq(true);
        // diff in open interest: 4k / 200k = 2%
        // fundingDecreaseFactorPerSecond: 0.000002%
        // decrease in funding: 0.000002% * 600 = 0.0012%
        // new funding = 0.0072% - 0.0012% = 0.006%
        expect(marketInfo.nextFunding.fundingFactorPerSecond).closeTo(
          "60618803095782552410311774",
          "100000000000000000000000"
        ); // 0.0060%
        expect(marketInfo.nextFunding.nextSavedFundingFactorPerSecond).closeTo(
          "60618803095782552410311774",
          "100000000000000000000000"
        ); // 0.0060%
      }
    );

    // user0 decreases long position by $8k, new position size: $94k
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        sizeDeltaUsd: decimalToFloat(8000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
    });

    // user1 increases short position by $8k, new position size: $106k
    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        sizeDeltaUsd: decimalToFloat(8000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketIncrease,
        isLong: false,
      },
    });

    await usingResult(
      reader.getMarketInfo(dataStore.address, prices.ethUsdMarket, ethUsdMarket.marketToken),
      (marketInfo) => {
        expect(marketInfo.nextFunding.longsPayShorts).eq(true);
        expect(marketInfo.nextFunding.fundingFactorPerSecond).closeTo(
          "60475449363249909351161042",
          "100000000000000000000000"
        ); // 0.00604%
        expect(marketInfo.nextFunding.nextSavedFundingFactorPerSecond).closeTo(
          "60475449363249909351161042",
          "100000000000000000000000"
        ); // 0.00604%
      }
    );

    await time.increase(10 * 60);

    await usingResult(
      reader.getMarketInfo(dataStore.address, prices.ethUsdMarket, ethUsdMarket.marketToken),
      (marketInfo) => {
        // diff in open interest: 12k / 200k = 6%
        // fundingIncreaseFactorPerSecond: 0.0001%
        // increase in funding: - 6% * 0.0001% * 600 = -0.0036%
        // new funding = 0.00604% + -0.0036% = 0.00244%
        expect(marketInfo.nextFunding.longsPayShorts).eq(true);
        expect(marketInfo.nextFunding.fundingFactorPerSecond).closeTo(
          "24451790944216678086726159",
          "100000000000000000000000"
        ); // 0.00244%
        expect(marketInfo.nextFunding.nextSavedFundingFactorPerSecond).closeTo(
          "24451790944216678086726159",
          "100000000000000000000000"
        ); // 0.00244%
      }
    );

    await time.increase(10 * 60);

    await usingResult(
      reader.getMarketInfo(dataStore.address, prices.ethUsdMarket, ethUsdMarket.marketToken),
      (marketInfo) => {
        // diff in open interest: 12k / 200k = 6%
        // fundingIncreaseFactorPerSecond: 0.0001%
        // increase in funding: - 6% * 0.0001% * 600 = -0.0036%
        // new funding = 0.00244% + -0.0036% = -0.00116%
        expect(marketInfo.nextFunding.longsPayShorts).eq(false);
        expect(marketInfo.nextFunding.fundingFactorPerSecond).closeTo(
          "11500529296732609336067894",
          "100000000000000000000000"
        ); // 0.00115%
        expect(marketInfo.nextFunding.nextSavedFundingFactorPerSecond).closeTo(
          "-11500529296732609336067894",
          "100000000000000000000000"
        ); // -0.00115%
      }
    );

    await time.increase(10 * 60);

    await usingResult(
      reader.getMarketInfo(dataStore.address, prices.ethUsdMarket, ethUsdMarket.marketToken),
      (marketInfo) => {
        // diff in open interest: 12k / 200k = 6%
        // fundingIncreaseFactorPerSecond: 0.0001%
        // increase in funding: - 6% * 0.0001% * 600 = -0.0036%
        // new funding = -0.00116% + -0.0036% = -0.00476%
        expect(marketInfo.nextFunding.longsPayShorts).eq(false);
        expect(marketInfo.nextFunding.fundingFactorPerSecond).closeTo(
          "47533010594450302147780558",
          "100000000000000000000000"
        ); // 0.00475%
        expect(marketInfo.nextFunding.nextSavedFundingFactorPerSecond).closeTo(
          "-47533010594450302147780558",
          "100000000000000000000000"
        ); // -0.00475%
      }
    );

    // increase position at a different wnt price to create some difference between openInterestInTokens and openInterestInUsd
    // the open interest in USD should be balanced after this order, the open interest in tokens should not be balanced
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        sizeDeltaUsd: decimalToFloat(12_001),
        acceptablePrice: expandDecimals(5050, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased] }) },
    });

    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, true))).eq(
      "106001000000000000000000000000000000"
    ); // 106,001
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, false))).eq(
      "106001000000000000000000000000000000"
    ); // 106,001

    expect(await dataStore.getUint(keys.openInterestInTokensKey(ethUsdMarket.marketToken, wnt.address, true))).eq(
      "21190637450199203187"
    ); // 21.190637450199203187
    expect(await dataStore.getUint(keys.openInterestInTokensKey(ethUsdMarket.marketToken, usdc.address, false))).eq(
      "21200200000000000000"
    ); // 21.2002

    await time.increase(10 * 60);

    if (useOpenInterestInTokensForBalance) {
      await usingResult(
        reader.getMarketInfo(dataStore.address, prices.ethUsdMarket, ethUsdMarket.marketToken),
        (marketInfo) => {
          expect(marketInfo.nextFunding.longsPayShorts).eq(false);
          expect(marketInfo.nextFunding.fundingFactorPerSecond).closeTo(
            "35773029394356302617778206",
            "100000000000000000000000"
          ); // 0.00357%
          expect(marketInfo.nextFunding.nextSavedFundingFactorPerSecond).closeTo(
            "-35773029394356302617778206",
            "100000000000000000000000"
          ); // -0.00357%
        }
      );
    } else {
      // if !useOpenInterestInTokensForBalance there should only be a minor change in funding
      await usingResult(
        reader.getMarketInfo(dataStore.address, prices.ethUsdMarket, ethUsdMarket.marketToken),
        (marketInfo) => {
          expect(marketInfo.nextFunding.longsPayShorts).eq(false);
          expect(marketInfo.nextFunding.fundingFactorPerSecond).closeTo(
            "47773029394356302617778206",
            "100000000000000000000000"
          ); // 0.00475%
          expect(marketInfo.nextFunding.nextSavedFundingFactorPerSecond).closeTo(
            "-47773029394356302617778206",
            "100000000000000000000000"
          ); // -0.00475%
        }
      );
    }

    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(2, 0));
    await dataStore.setUint(
      keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken, false),
      decimalToFloat(2, 0)
    );

    // is useOpenInterestInTokensForBalance, there should be a small positive price impact
    // since the openInterestInTokens for longs is slightly smaller than for shorts
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        initialCollateralToken: wnt,
        sizeDeltaUsd: decimalToFloat(30),
        acceptablePrice: expandDecimals(5050, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: {
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          //  0.00000984141 / -0.000009
          expect(positionIncreaseEvent.pendingPriceImpactUsd).eq(
            useOpenInterestInTokensForBalance ? "9843824701195219287825000" : "-8999999999999999859640000"
          );
        },
      },
    });

    // the position should be fully closeable
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        sizeDeltaUsd: decimalToFloat(106_031),
        acceptablePrice: expandDecimals(4050, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.decreased] }),
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionDecreaseEvent = getEventData(logs, "PositionDecrease");
          expect(positionDecreaseEvent.sizeInUsd).eq("0");
          expect(positionDecreaseEvent.priceImpactUsd).eq(
            useOpenInterestInTokensForBalance
              ? "-111465017696232642237559789270000" // -111.465017696
              : "-112362115509999998076470009600000" // -112.36211551
          );
        },
      },
    });
  }

  it("adaptive funding", async () => {
    await testAdaptiveFunding(false);
  });

  it("adaptive funding with USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE as true", async () => {
    await testAdaptiveFunding(true);
  });
});
