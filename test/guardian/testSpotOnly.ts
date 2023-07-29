import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder, createOrder } from "../../utils/order";
import { getPoolAmount } from "../../utils/market";
import { ethers } from "hardhat";
import { errorsContract } from "../../utils/error";

describe("Guardian.SpotOnlyMarkets", () => {
  let fixture;
  let user0;
  let dataStore, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdSpotOnlyMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(50_000, 6),
      },
    });
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(50_000, 6),
      },
    });
  });

  it("Can swap in spot-only market regardless of swap path length", async () => {
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(
      ethers.utils.parseEther("10")
    );
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq("50000000000");

    await handleOrder(fixture, {
      create: {
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdSpotOnlyMarket.marketToken],
      },
      execute: {
        tokens: [wnt.address, usdc.address],
        prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    expect(await usdc.balanceOf(user0.address)).eq("50000000000");
    expect(await wnt.balanceOf(user0.address)).eq("0");
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(expandDecimals(20, 18));
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(0);

    await handleOrder(fixture, {
      create: {
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(50_000, 6),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdSpotOnlyMarket.marketToken, ethUsdMarket.marketToken],
      },
      execute: {
        tokens: [wnt.address, usdc.address],
        prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    // Received 50,000 USDC
    expect(await usdc.balanceOf(user0.address)).eq("100000000000");
    expect(await wnt.balanceOf(user0.address)).eq(0);
    // 10 ETH still in the pool
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq("10000000000000000000");

    // - 50,000 USDC leaves => 50,000 USDC in the pool
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq("50000000000");
  });

  it("Can't increase position in spot-only market", async () => {
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50_000, 6));

    await expect(
      createOrder(fixture, {
        market: ethUsdSpotOnlyMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(1, 18),
        sizeDeltaUsd: decimalToFloat(25_000), // 5x position
        acceptablePrice: expandDecimals(5000, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidPositionMarket");
  });
});
