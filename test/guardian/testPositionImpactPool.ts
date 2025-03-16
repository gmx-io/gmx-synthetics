import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { OrderType, handleOrder } from "../../utils/order";
import { getAccountPositionCount, getPositionKeys } from "../../utils/position";
import { getMarketTokenPriceWithPoolValue, getSwapImpactPoolAmount } from "../../utils/market";
import { handleDeposit } from "../../utils/deposit";
import * as keys from "../../utils/keys";
import { getBalanceOf } from "../../utils/token";
import { prices } from "../../utils/prices";
import { getEventData } from "../../utils/event";
import { usingResult } from "../../utils/use";

describe("Guardian.PositionImpactPool", () => {
  let fixture;
  let user0, user1;
  let dataStore, ethUsdMarket, wnt, usdc, reader, ethUsdMarketAddress, timelockConfig, eventEmitter;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, wnt, usdc, reader, ethUsdMarketAddress, timelockConfig, eventEmitter } =
      fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1000 * 5000, 6),
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });
  });

  it("Price impact pool", async () => {
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

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getAccountPositionCount(dataStore, user1.address)).eq(0);

    let marketTokenPrice, poolValueInfo;

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
          const positionIncreasedEvent = getEventData(logs, "PositionIncrease");

          // Negative impact amount for $25,000 of imbalance
          // 25,000^2 * 1e22 / 1e30 = $6.25
          expect(positionIncreasedEvent.priceImpactUsd).to.closeTo(
            expandDecimals(-25, 30).mul(-1),
            expandDecimals(1, 28)
          ); // ~$6.25 in negative impact
        },
      },
    });

    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });
    expect(marketTokenPrice).to.eq("1000000000000000000000000000000"); // Market token price is slightly higher as $75 of fees have accrued
    expect(poolValueInfo.impactPoolAmount).to.eq("0");

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
    });

    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });
    expect(marketTokenPrice).to.eq("1000000000000000000000000000000"); // Market token price is slightly higher as $75 of fees have accrued
    expect(poolValueInfo.impactPoolAmount).to.eq("0");
  });

  it("Price impact pool2", async () => {
    await usingResult(getMarketTokenPriceWithPoolValue(fixture), ([marketTokenPrice, poolValueInfo]) => {
      expect(marketTokenPrice).eq(decimalToFloat(1));
      expect(poolValueInfo.poolValue).eq(decimalToFloat(10_000_000)); // $10,000,000
    });

    await dataStore.setUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken), expandDecimals(400, 18)); // $2,000,000

    // Pool value should be decremented by impact pool value
    await usingResult(getMarketTokenPriceWithPoolValue(fixture), ([marketTokenPrice, poolValueInfo]) => {
      expect(marketTokenPrice).eq(decimalToFloat(8, 1));
      expect(poolValueInfo.poolValue).eq(decimalToFloat(8_000_000)); // $8,000,000
    });

    // console.log(ethUsdMarketAddress);
    // console.log(ethUsdMarket);
    await timelockConfig.withdrawFromPositionImpactPool(ethUsdMarket.marketToken, user1.address, expandDecimals(1, 18));

    // Pool value should be decremented by impact pool value
    await usingResult(getMarketTokenPriceWithPoolValue(fixture), ([marketTokenPrice, poolValueInfo]) => {
      expect(marketTokenPrice).eq(decimalToFloat(8, 1));
      expect(poolValueInfo.poolValue).eq(decimalToFloat(8_000_000)); // $8,000,000
    });
  });
});
