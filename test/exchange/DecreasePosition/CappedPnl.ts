import { expect } from "chai";

import { usingResult } from "../../../utils/use";
import { handleDeposit } from "../../../utils/deposit";
import { deployFixture } from "../../../utils/fixture";
import { getExecuteParams } from "../../../utils/exchange";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { getMarketTokenPriceWithPoolValue } from "../../../utils/market";
import { OrderType, handleOrder } from "../../../utils/order";
import { prices } from "../../../utils/prices";
import * as keys from "../../../utils/keys";

describe("Exchange.DecreasePosition", () => {
  let fixture;
  let user0, user1, user2, user3;
  let dataStore, wnt, usdc, ethUsdSingleTokenMarket;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({ dataStore, wnt, usdc, ethUsdSingleTokenMarket } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdSingleTokenMarket,
        longTokenAmount: expandDecimals(1_000_000, 6),
        shortTokenAmount: expandDecimals(1_000_000, 6),
      },
    });
  });

  it("base case pnl check", async () => {
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(100_000, 6),
        sizeDeltaUsd: decimalToFloat(250 * 1000),
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
        initialCollateralDeltaAmount: expandDecimals(100_000, 6),
        sizeDeltaUsd: decimalToFloat(250 * 1000),
        acceptablePrice: expandDecimals(5050, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
    });

    expect(await wnt.balanceOf(user2.address)).eq(0);
    expect(await usdc.balanceOf(user2.address)).eq(0);

    expect(await wnt.balanceOf(user3.address)).eq(0);
    expect(await usdc.balanceOf(user3.address)).eq(0);

    await handleOrder(fixture, {
      create: {
        account: user0,
        receiver: user2,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(250 * 1000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
      execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased.byFiftyPercent] }) },
    });

    await handleOrder(fixture, {
      create: {
        account: user1,
        receiver: user3,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(250 * 1000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
      execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased.byFiftyPercent] }) },
    });

    expect(await wnt.balanceOf(user2.address)).eq(0);
    expect(await usdc.balanceOf(user2.address)).eq("225000000000"); // 225,000

    expect(await wnt.balanceOf(user3.address)).eq(0);
    expect(await usdc.balanceOf(user3.address)).eq("225000000000"); // 225,000
  });

  it("capped pnl", async () => {
    await dataStore.setUint(
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_TRADERS, ethUsdSingleTokenMarket.marketToken, true),
      decimalToFloat(7, 2)
    ); // 7%

    await dataStore.setUint(
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, ethUsdSingleTokenMarket.marketToken, true),
      decimalToFloat(5, 1)
    ); // 50%

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, {
        pnlFactorType: keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
        market: ethUsdSingleTokenMarket,
        prices: prices.ethUsdSingleTokenMarket,
      }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(2_000_000));
      }
    );

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(100_000, 6),
        sizeDeltaUsd: decimalToFloat(250 * 1000),
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
        initialCollateralDeltaAmount: expandDecimals(100_000, 6),
        sizeDeltaUsd: decimalToFloat(250 * 1000),
        acceptablePrice: expandDecimals(5050, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
    });

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, {
        pnlFactorType: keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
        market: ethUsdSingleTokenMarket,
        prices: prices.ethUsdSingleTokenMarket,
      }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(2_000_000));
      }
    );

    expect(await wnt.balanceOf(user2.address)).eq(0);
    expect(await usdc.balanceOf(user2.address)).eq(0);

    expect(await wnt.balanceOf(user3.address)).eq(0);
    expect(await usdc.balanceOf(user3.address)).eq(0);

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, {
        pnlFactorType: keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
        market: ethUsdSingleTokenMarket,
        prices: { ...prices.ethUsdSingleTokenMarket.increased.byFiftyPercent },
      }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("875000000000000000000000000000"); // 0.875
        expect(poolValueInfo.poolValue).eq("1750000000000000000000000000000000000"); // 1,750,000
      }
    );

    await handleOrder(fixture, {
      create: {
        account: user0,
        receiver: user2,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(250 * 1000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
      execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased.byFiftyPercent] }) },
    });

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, {
        pnlFactorType: keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
        market: ethUsdSingleTokenMarket,
        prices: { ...prices.ethUsdSingleTokenMarket.increased.byFiftyPercent },
      }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("920000000000000000000000000000"); // 0.92
        expect(poolValueInfo.poolValue).eq("1840000000000000000000000000000000000"); // 1,840,000
      }
    );

    await handleOrder(fixture, {
      create: {
        account: user1,
        receiver: user3,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(250 * 1000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
      execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased.byFiftyPercent] }) },
    });

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, {
        pnlFactorType: keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
        market: ethUsdSingleTokenMarket,
        prices: { ...prices.ethUsdSingleTokenMarket.increased.byFiftyPercent },
      }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("948112500000000000000000000000"); // 0.9481125
        expect(poolValueInfo.poolValue).eq("1896225000000000000000000000000000000"); // 1,896,225
      }
    );

    expect(await wnt.balanceOf(user2.address)).eq(0);
    expect(await usdc.balanceOf(user2.address)).eq("135000000000"); // 135,000

    expect(await wnt.balanceOf(user3.address)).eq(0);
    expect(await usdc.balanceOf(user3.address)).eq("168775000000"); // 168,775
  });
});
