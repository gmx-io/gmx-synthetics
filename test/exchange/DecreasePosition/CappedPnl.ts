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
import {
  getPositionKey,
  getAccountPositionCount,
  getRealizedUncappedPnlUsdKey,
  getRealizedPnlUsdKey,
} from "../../../utils/position";

describe("Exchange.DecreasePosition", () => {
  let fixture;
  let user0, user1, user2, user3;
  let dataStore, wnt, usdc, ethUsdMarket, ethUsdSingleTokenMarket;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({ dataStore, wnt, usdc, ethUsdMarket, ethUsdSingleTokenMarket } = fixture.contracts);

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

  it("capped pnl - partitioned close matches one-shot close", async () => {
    await dataStore.setUint(
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_TRADERS, ethUsdSingleTokenMarket.marketToken, true),
      decimalToFloat(7, 2)
    ); // 7%

    for (const account of [user0, user1]) {
      await handleOrder(fixture, {
        create: {
          account,
          market: ethUsdSingleTokenMarket,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(100_000, 6),
          sizeDeltaUsd: decimalToFloat(250 * 1000),
          acceptablePrice: expandDecimals(5050, 12),
          orderType: OrderType.MarketIncrease,
          isLong: true,
        },
      });
    }

    const positionKey = getPositionKey(user0.address, ethUsdSingleTokenMarket.marketToken, usdc.address, true);

    for (let i = 0; i < 5; i++) {
      await handleOrder(fixture, {
        create: {
          account: user0,
          receiver: user2,
          market: ethUsdSingleTokenMarket,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: 0,
          sizeDeltaUsd: decimalToFloat(50 * 1000),
          acceptablePrice: expandDecimals(4950, 12),
          orderType: OrderType.MarketDecrease,
          isLong: true,
        },
        execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased.byFiftyPercent] }) },
      });

      if (i === 0) {
        expect(await dataStore.getInt(getRealizedUncappedPnlUsdKey(positionKey))).eq(decimalToFloat(25_000));
        expect(await dataStore.getInt(getRealizedPnlUsdKey(positionKey))).eq(decimalToFloat(7_000));
      }
    }

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await dataStore.getInt(getRealizedUncappedPnlUsdKey(positionKey))).eq(0);
    expect(await dataStore.getInt(getRealizedPnlUsdKey(positionKey))).eq(0);

    expect(await usdc.balanceOf(user2.address)).eq("135000000000"); // 135,000

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

    expect(await usdc.balanceOf(user3.address)).eq("168775000000"); // 168,775
  });

  it("capped pnl - non-round partitioned close matches one-shot close", async () => {
    await dataStore.setUint(
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_TRADERS, ethUsdSingleTokenMarket.marketToken, true),
      decimalToFloat(7, 2)
    ); // 7%

    for (const account of [user0, user1]) {
      await handleOrder(fixture, {
        create: {
          account,
          market: ethUsdSingleTokenMarket,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(100_000, 6),
          sizeDeltaUsd: decimalToFloat(250 * 1000),
          acceptablePrice: expandDecimals(5050, 12),
          orderType: OrderType.MarketIncrease,
          isLong: true,
        },
      });
    }

    for (const sizeDeltaUsd of [70, 80, 100]) {
      await handleOrder(fixture, {
        create: {
          account: user0,
          receiver: user2,
          market: ethUsdSingleTokenMarket,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: 0,
          sizeDeltaUsd: decimalToFloat(sizeDeltaUsd * 1000),
          acceptablePrice: expandDecimals(4950, 12),
          orderType: OrderType.MarketDecrease,
          isLong: true,
        },
        execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased.byFiftyPercent] }) },
      });
    }

    expect(await usdc.balanceOf(user2.address)).eq("135000000000"); // 135,000
  });

  it("capped pnl - partitioned close with realized losses", async () => {
    await dataStore.setUint(
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_TRADERS, ethUsdSingleTokenMarket.marketToken, true),
      decimalToFloat(7, 2)
    ); // 7%

    for (const account of [user0, user1]) {
      await handleOrder(fixture, {
        create: {
          account,
          market: ethUsdSingleTokenMarket,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(200_000, 6),
          sizeDeltaUsd: decimalToFloat(250 * 1000),
          acceptablePrice: expandDecimals(5050, 12),
          orderType: OrderType.MarketIncrease,
          isLong: true,
        },
      });
    }

    const wntHalved = {
      contractName: "wnt",
      precision: 8,
      min: expandDecimals(2500, 4),
      max: expandDecimals(2500, 4),
    };

    await handleOrder(fixture, {
      create: {
        account: user0,
        receiver: user2,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(50 * 1000),
        acceptablePrice: expandDecimals(2450, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
      execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, wntHalved] }) },
    });

    const positionKey = getPositionKey(user0.address, ethUsdSingleTokenMarket.marketToken, usdc.address, true);
    expect(await dataStore.getInt(getRealizedUncappedPnlUsdKey(positionKey))).eq(0);
    expect(await dataStore.getInt(getRealizedPnlUsdKey(positionKey))).eq(0);

    await handleOrder(fixture, {
      create: {
        account: user0,
        receiver: user2,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
      execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased.byFiftyPercent] }) },
    });

    expect(await usdc.balanceOf(user2.address)).eq("206500000000"); // 206,500
  });

  it("capped pnl - profit taken below the cap does not affect later capped decreases", async () => {
    await dataStore.setUint(
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_TRADERS, ethUsdSingleTokenMarket.marketToken, true),
      decimalToFloat(7, 2)
    ); // 7%

    for (const account of [user0, user1]) {
      await handleOrder(fixture, {
        create: {
          account,
          market: ethUsdSingleTokenMarket,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(100_000, 6),
          sizeDeltaUsd: decimalToFloat(250 * 1000),
          acceptablePrice: expandDecimals(5050, 12),
          orderType: OrderType.MarketIncrease,
          isLong: true,
        },
      });
    }

    const wntSlightlyIncreased = {
      contractName: "wnt",
      precision: 8,
      min: expandDecimals(5500, 4),
      max: expandDecimals(5500, 4),
    };

    await handleOrder(fixture, {
      create: {
        account: user0,
        receiver: user2,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(50 * 1000),
        acceptablePrice: expandDecimals(5450, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
      execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, wntSlightlyIncreased] }) },
    });

    expect(await usdc.balanceOf(user2.address)).eq("5000000000"); // 5,000

    const positionKey = getPositionKey(user0.address, ethUsdSingleTokenMarket.marketToken, usdc.address, true);
    expect(await dataStore.getInt(getRealizedUncappedPnlUsdKey(positionKey))).eq(0);
    expect(await dataStore.getInt(getRealizedPnlUsdKey(positionKey))).eq(0);

    await handleOrder(fixture, {
      create: {
        account: user0,
        receiver: user2,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(4950, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
      execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased.byFiftyPercent] }) },
    });

    expect(await usdc.balanceOf(user2.address)).eq("136033333333"); // 5,000 + 31,033.33 + 100,000
  });

  it("capped pnl - partitioned short close matches one-shot close", async () => {
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(2_000_000, 6),
      },
    });

    await dataStore.setUint(
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_TRADERS, ethUsdMarket.marketToken, false),
      decimalToFloat(7, 2)
    ); // 7%

    for (const account of [user0, user1]) {
      await handleOrder(fixture, {
        create: {
          account,
          market: ethUsdMarket,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(100_000, 6),
          sizeDeltaUsd: decimalToFloat(250 * 1000),
          acceptablePrice: expandDecimals(4950, 12),
          orderType: OrderType.MarketIncrease,
          isLong: false,
        },
      });
    }

    const wntHalved = {
      contractName: "wnt",
      precision: 8,
      min: expandDecimals(2500, 4),
      max: expandDecimals(2500, 4),
    };

    const positionKey = getPositionKey(user0.address, ethUsdMarket.marketToken, usdc.address, false);

    for (let i = 0; i < 5; i++) {
      await handleOrder(fixture, {
        create: {
          account: user0,
          receiver: user2,
          market: ethUsdMarket,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: 0,
          sizeDeltaUsd: decimalToFloat(50 * 1000),
          acceptablePrice: expandDecimals(2550, 12),
          orderType: OrderType.MarketDecrease,
          isLong: false,
        },
        execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, wntHalved] }) },
      });

      if (i === 0) {
        expect(await dataStore.getInt(getRealizedUncappedPnlUsdKey(positionKey))).eq(decimalToFloat(25_000));
        expect(await dataStore.getInt(getRealizedPnlUsdKey(positionKey))).eq(decimalToFloat(14_000));
      }
    }

    // 5 * 14,000 of capped pnl and the 100,000 collateral
    expect(await usdc.balanceOf(user2.address)).eq("170000000000"); // 170,000

    // the pool paid out 70,000, so the max pnl is 7% * 1,930,000 = 135,100 which exceeds
    // the remaining 125,000 of pnl, so user1 is paid without capping
    await handleOrder(fixture, {
      create: {
        account: user1,
        receiver: user3,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(250 * 1000),
        acceptablePrice: expandDecimals(2550, 12),
        orderType: OrderType.MarketDecrease,
        isLong: false,
      },
      execute: { ...getExecuteParams(fixture, { prices: [prices.usdc, wntHalved] }) },
    });

    expect(await usdc.balanceOf(user3.address)).eq("225000000000"); // 225,000
  });
});
