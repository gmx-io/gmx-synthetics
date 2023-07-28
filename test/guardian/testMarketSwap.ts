import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, getOrderCount, handleOrder } from "../../utils/order";
import { getAccountPositionCount } from "../../utils/position";
import { getPoolAmount } from "../../utils/market";
import * as keys from "../../utils/keys";
import { errorsContract } from "../../utils/error";

describe("Guardian.MktSwapOrder", () => {
  let fixture;
  let user0, user1;
  let dataStore, ethUsdMarket, ethUsdSpotOnlyMarket, solUsdMarket, wnt, usdc, wbtc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc, wbtc, solUsdMarket } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(50000, 6),
      },
    });
  });

  it("Swap with same market repeated several times in swap path is cancelled", async () => {
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq("50000000000");

    await handleOrder(fixture, {
      create: {
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken, ethUsdMarket.marketToken, ethUsdMarket.marketToken],
      },
      execute: {
        tokens: [wnt.address, usdc.address],
        prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        expectedCancellationReason: "DuplicatedMarketInSwapPath",
      },
    });
  });

  it("Swap with multiple different markets in swap path", async () => {
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq("50000000000");

    await handleDeposit(fixture, {
      create: {
        market: solUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
      },
      execute: {
        tokens: [wnt.address, usdc.address, solUsdMarket.indexToken],
        precisions: [8, 18, 8],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(100, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(100, 4)],
        longTokenAmount: expandDecimals(10, 18),
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: ethUsdSpotOnlyMarket,
        shortTokenAmount: expandDecimals(50_000, 6),
      },
    });

    // ETH -> USDC, USDC -> ETH, ETH -> USDC
    await handleOrder(fixture, {
      create: {
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken, solUsdMarket.marketToken, ethUsdSpotOnlyMarket.marketToken],
      },
      execute: {
        tokens: [wnt.address, usdc.address, solUsdMarket.indexToken],
        precisions: [8, 18, 8],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(100, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(100, 4)],
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getOrderCount(dataStore)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq("50000000000");

    // ETHUSD market
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0);
    // SOLUSD market
    expect(await getPoolAmount(dataStore, solUsdMarket.marketToken, wnt.address)).eq(0);
    expect(await getPoolAmount(dataStore, solUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50_000, 6));
    // ETHUSD spot market
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18));
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(0);
  });

  it("Swap with wrong token provided to the market", async () => {
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    // Revert with InvalidTokenIn
    await handleOrder(fixture, {
      create: {
        initialCollateralToken: wbtc,
        initialCollateralDeltaAmount: expandDecimals(10, 8),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
      },
      execute: {
        tokens: [wnt.address, usdc.address],
        prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        expectedCancellationReason: "InvalidTokenIn",
      },
    });
  });

  it("Swap larger than liquidity in pool doesn't go through", async () => {
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50_000, 6));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);

    // Revert with UsdDeltaExceedsPoolValue
    await handleOrder(fixture, {
      create: {
        initialCollateralToken: wnt,
        receiver: user0,
        initialCollateralDeltaAmount: expandDecimals(50, 18), // Swap for $250,000 USDC but pool only has $50,000
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
      },
      execute: {
        tokens: [wnt.address, usdc.address],
        prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        expectedCancellationReason: "UsdDeltaExceedsPoolValue",
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getOrderCount(dataStore)).eq(0);

    // Pool amount should not have changed
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50_000, 6));

    expect(await usdc.balanceOf(user0.address)).eq(0);
    // Funds returned on cancel
    expect(await wnt.balanceOf(user0.address)).eq(expandDecimals(50, 18));
  });

  it("Swap with no tokens", async () => {
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50_000, 6));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);

    await expect(
      handleOrder(fixture, {
        create: {
          initialCollateralToken: wnt,
          receiver: user0,
          initialCollateralDeltaAmount: 0,
          acceptablePrice: 0,
          orderType: OrderType.MarketSwap,
          swapPath: [ethUsdMarket.marketToken],
        },
        execute: {
          tokens: [wnt.address, usdc.address],
          prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        },
      })
    ).to.be.revertedWithCustomError(errorsContract, "EmptyOrder");

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getOrderCount(dataStore)).eq(0);

    // Pool amount should not have changed
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50_000, 6));

    expect(await usdc.balanceOf(user0.address)).eq(0);
    expect(await wnt.balanceOf(user0.address)).eq(0);
  });

  it("Swap with unmet minOutputAmount", async () => {
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50_000, 6));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);

    // Reverted with InsufficientSwapOutputAmount
    await handleOrder(fixture, {
      create: {
        initialCollateralToken: wnt,
        receiver: user0,
        initialCollateralDeltaAmount: expandDecimals(10, 18), // $50,000
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
        minOutputAmount: expandDecimals(50_001, 6), // Min output 50,001 USDC
      },
      execute: {
        tokens: [wnt.address, usdc.address],
        prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        expectedCancellationReason: "InsufficientSwapOutputAmount",
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getOrderCount(dataStore)).eq(0);

    // Pool amount should not have changed
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50_000, 6));

    expect(await usdc.balanceOf(user0.address)).eq(0);
    expect(await wnt.balanceOf(user0.address)).eq(expandDecimals(10, 18));
  });

  it("Swap with PI", async () => {
    // set price impact to 0.1% for every $50,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 50,000 => 2 * (10 ** -8)
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(2, 8));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    // Add some money to the impact pool.
    // User1 will experience some -PI since the imbalance is increased
    await handleDeposit(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(50000, 6),
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(99_850, 6));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);

    // Decrease imbalance from $99,925 to $49,925 (increase WNT by $25,000 and decrease USDC by $25,000)
    await handleOrder(fixture, {
      create: {
        initialCollateralToken: wnt,
        receiver: user0,
        initialCollateralDeltaAmount: expandDecimals(5, 18), // $25,000
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
      },
      execute: {
        tokens: [wnt.address, usdc.address],
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getOrderCount(dataStore)).eq(0);

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(5, 18));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(74_850, 6));

    // ~$75 of +PI experienced
    expect(await usdc.balanceOf(user0.address)).eq("25149699999");
    expect(await wnt.balanceOf(user0.address)).eq(0);
  });
});
