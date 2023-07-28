import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { getOrderCount, handleOrder, OrderType } from "../../utils/order";
import { getPositionCount, getPositionKey } from "../../utils/position";

describe("Guardian.Scenarios", () => {
  let fixture;
  let user1;
  let reader, dataStore, ethUsdMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user1 } = fixture.accounts);
    ({ reader, dataStore, ethUsdMarket, wnt, usdc } = fixture.contracts);

    // initial liquidity for markets
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(100, 18), // $500,000 of ETH
        shortTokenAmount: expandDecimals(100 * 5000, 6), // $500,000 of USDC
      },
    });
  });

  it("Open a long & short position, price goes up", async () => {
    const collateralAmount = expandDecimals(50_000, 6);

    expect(await getPositionCount(dataStore)).to.eq(0);

    const increaseParams1 = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: collateralAmount,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams1,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getPositionCount(dataStore)).to.eq(1);

    const longPositionKey = await getPositionKey(user1.address, ethUsdMarket.marketToken, usdc.address, true);
    const longPosition = await reader.getPosition(dataStore.address, longPositionKey);

    // Long position has size of $200,000 & size in tokens of 40 ETH
    expect(longPosition.numbers.sizeInUsd).to.eq(expandDecimals(200_000, 30));
    expect(longPosition.numbers.sizeInTokens).to.eq(expandDecimals(40, 18));

    const increaseParams2 = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: collateralAmount,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(4999, 12),
      orderType: OrderType.MarketIncrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams2,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getPositionCount(dataStore)).to.eq(2);

    // ETH Price goes up 10% to $5,500

    // Close long & realize $20,000 profit

    let wntBalBefore = await wnt.balanceOf(user1.address);
    let usdcBalBefore = await usdc.balanceOf(user1.address);

    const decreaseParams1 = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: 0, // Don't withdraw any collateral
      sizeDeltaUsd: decimalToFloat(200 * 1000), // Close the position
      acceptablePrice: expandDecimals(5499, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams1,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    let wntBalAfter = await wnt.balanceOf(user1.address);
    let usdcBalAfter = await usdc.balanceOf(user1.address);

    // Long position profited $500 per ETH for 40 ETH
    // => $500 * 40 = $20,000 profit paid out in ETH
    // Price of ETH is $5,500 => $20,000 / 5,500 ~= 3.63636363636 ETH
    expect(wntBalAfter.sub(wntBalBefore)).to.eq("3636363636363636363");
    expect(usdcBalAfter.sub(usdcBalBefore)).to.eq(collateralAmount);

    // Close short & realize $20,000 loss

    wntBalBefore = await wnt.balanceOf(user1.address);
    usdcBalBefore = await usdc.balanceOf(user1.address);

    const decreaseParams2 = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: 0, // Don't withdraw any collateral
      sizeDeltaUsd: decimalToFloat(200 * 1000), // Close the position
      acceptablePrice: expandDecimals(5501, 12),
      orderType: OrderType.MarketDecrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams2,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    wntBalAfter = await wnt.balanceOf(user1.address);
    usdcBalAfter = await usdc.balanceOf(user1.address);

    // Short position lost $500 per ETH for 40 ETH
    // => -$500 * 40 = -$20,000 loss subtracted from the collateral
    expect(wntBalAfter.sub(wntBalBefore)).to.eq(0);
    expect(usdcBalAfter.sub(usdcBalBefore)).to.eq(expandDecimals(30_000, 6));

    expect(await getPositionCount(dataStore)).to.eq(0);
    expect(await getOrderCount(dataStore)).to.eq(0);
  });

  it("Open a long & short position, price goes down", async () => {
    const collateralAmount = expandDecimals(50_000, 6);

    expect(await getPositionCount(dataStore)).to.eq(0);

    const increaseParams1 = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: collateralAmount,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams1,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getPositionCount(dataStore)).to.eq(1);

    const longPositionKey = await getPositionKey(user1.address, ethUsdMarket.marketToken, usdc.address, true);
    const longPosition = await reader.getPosition(dataStore.address, longPositionKey);

    // Long position has size of $200,000 & size in tokens of 40 ETH
    expect(longPosition.numbers.sizeInUsd).to.eq(expandDecimals(200_000, 30));
    expect(longPosition.numbers.sizeInTokens).to.eq(expandDecimals(40, 18));

    const increaseParams2 = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: collateralAmount,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(4999, 12),
      orderType: OrderType.MarketIncrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams2,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getPositionCount(dataStore)).to.eq(2);

    // ETH Price goes down 10% to $4,500

    // Close long & realize $20,000 loss

    let wntBalBefore = await wnt.balanceOf(user1.address);
    let usdcBalBefore = await usdc.balanceOf(user1.address);

    const decreaseParams1 = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: 0, // Don't withdraw any collateral
      sizeDeltaUsd: decimalToFloat(200 * 1000), // Close the position
      acceptablePrice: expandDecimals(4499, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams1,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    let wntBalAfter = await wnt.balanceOf(user1.address);
    let usdcBalAfter = await usdc.balanceOf(user1.address);

    // Long position lost $500 per ETH for 40 ETH
    // => -$500 * 40 = -$20,000 losses paid from USDC collateral
    expect(wntBalAfter.sub(wntBalBefore)).to.eq(0);
    expect(usdcBalAfter.sub(usdcBalBefore)).to.eq(collateralAmount.sub(expandDecimals(20_000, 6)));

    // Close short & realize $20,000 gain

    wntBalBefore = await wnt.balanceOf(user1.address);
    usdcBalBefore = await usdc.balanceOf(user1.address);

    const decreaseParams2 = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: 0, // Don't withdraw any collateral
      sizeDeltaUsd: decimalToFloat(200 * 1000), // Close the position
      acceptablePrice: expandDecimals(4501, 12),
      orderType: OrderType.MarketDecrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams2,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    wntBalAfter = await wnt.balanceOf(user1.address);
    usdcBalAfter = await usdc.balanceOf(user1.address);

    // Short position gained $500 per ETH for 40 ETH
    // => $500 * 40 = $20,000 gain paid out in USDC
    expect(wntBalAfter.sub(wntBalBefore)).to.eq(0);
    expect(usdcBalAfter.sub(usdcBalBefore)).to.eq(collateralAmount.add(expandDecimals(20_000, 6)));

    expect(await getPositionCount(dataStore)).to.eq(0);
    expect(await getOrderCount(dataStore)).to.eq(0);
  });
});
