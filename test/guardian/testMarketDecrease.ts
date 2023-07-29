import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { OrderType, getOrderCount, handleOrder, DecreasePositionSwapType } from "../../utils/order";
import { handleDeposit } from "../../utils/deposit";
import { getPositionCount } from "../../utils/position";
import { expect } from "chai";
import { getSyntheticTokenAddress } from "../../utils/token";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import hre from "hardhat";

describe("Guardian.MarketDecrease", () => {
  let fixture;
  let user1;
  let reader, dataStore, solUsdMarket, solAddr, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc, ethUsdtMarket, usdt;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user1 } = fixture.accounts);
    ({ reader, dataStore, solUsdMarket, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc, usdt, ethUsdtMarket } =
      fixture.contracts);

    solAddr = getSyntheticTokenAddress(hre.network.config.chainId, "SOL");

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10000000, 18),
        shortTokenAmount: expandDecimals(10000000 * 5000, 6),
      },
    });
    await handleDeposit(fixture, {
      create: {
        market: ethUsdSpotOnlyMarket,
        longTokenAmount: expandDecimals(10000000, 18),
        shortTokenAmount: expandDecimals(10000000 * 5000, 6),
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: ethUsdtMarket,
        longTokenAmount: expandDecimals(10000000, 18),
        shortTokenAmount: expandDecimals(10000000 * 5000, 6),
      },
      execute: {
        tokens: [wnt.address, usdt.address, solAddr],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 18],
        minPrices: [expandDecimals(2500, 4), expandDecimals(1, 6), expandDecimals(15, 6)],
        maxPrices: [expandDecimals(2500, 4), expandDecimals(1, 6), expandDecimals(15, 6)],
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: solUsdMarket,
        longTokenAmount: expandDecimals(10000000, 18), // ETH
        shortTokenAmount: expandDecimals(10000000 * 5000, 6), // USDC
      },
      execute: {
        tokens: [wnt.address, usdc.address, solAddr],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 18],
        minPrices: [expandDecimals(2500, 4), expandDecimals(1, 6), expandDecimals(15, 6)],
        maxPrices: [expandDecimals(2500, 4), expandDecimals(1, 6), expandDecimals(15, 6)],
      },
    });
  });

  it("MarketDecrease with a swapPath with several tokens -- prices stay the same", async () => {
    const initialUSDCBalance = expandDecimals(50 * 1000, 6); // 50,000 USDC
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    let userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    let userPosition = userPositions[0];

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(200 * 1000));

    const userUSDCBalBefore = await usdc.balanceOf(user1.address);
    const userWNTBalBefore = await wnt.balanceOf(user1.address);

    let decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: 0, // Don't withdraw any collateral
      swapPath: [ethUsdMarket.marketToken, solUsdMarket.marketToken, ethUsdSpotOnlyMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(100 * 1000), // Close 50% of the position
      acceptablePrice: expandDecimals(4999, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    userPosition = userPositions[0];

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(100 * 1000));
    expect(userPosition.numbers.collateralAmount).to.eq(initialUSDCBalance);

    // User realizes no profits & withdraws no collateral
    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(0);
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(0);

    decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance.div(2),
      swapPath: [ethUsdMarket.marketToken, solUsdMarket.marketToken, ethUsdSpotOnlyMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(0), // Do not decrease size
      acceptablePrice: expandDecimals(4999, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    userPosition = (await reader.getAccountPositions(dataStore.address, user1.address, 0, 1))[0];

    expect(userPosition.numbers.collateralAmount).to.eq(initialUSDCBalance.div(2));
    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(100 * 1000));

    // User realizes no profits & withdraws half their collateral
    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(initialUSDCBalance.div(2));
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(0);

    // Now user closes their position

    decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance.div(2), // Attempt to close via collateral as well as size
      swapPath: [ethUsdMarket.marketToken, solUsdMarket.marketToken, ethUsdSpotOnlyMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(100 * 1000), // Close rest of size
      acceptablePrice: expandDecimals(4999, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 1);
    expect(userPositions.length).to.eq(0);

    // User realizes no profits & withdraws all their collateral
    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(initialUSDCBalance);
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(0);
  });

  it("MarketDecrease with a swapPath with several tokens -- prices change", async () => {
    const initialUSDCBalance = expandDecimals(50 * 1000, 6); // 50,000 USDC
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    let userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    let userPosition = userPositions[0];

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(200 * 1000));

    let userUSDCBalBefore = await usdc.balanceOf(user1.address);
    let userWNTBalBefore = await wnt.balanceOf(user1.address);

    let decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: 0, // Don't withdraw any collateral
      swapPath: [ethUsdMarket.marketToken, solUsdMarket.marketToken, ethUsdSpotOnlyMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(100 * 1000), // Close 50% of the position
      acceptablePrice: expandDecimals(4499, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)], // ETH goes down 10%
        maxPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    userPosition = userPositions[0];

    // Position size 40 ETH
    // Decrease by 20 ETH $500 loss per ETH
    // PnL is $10,000

    const remainingCollateral = initialUSDCBalance.sub(expandDecimals(10 * 1000, 6));

    // Losses are subtracted from the user's collateral
    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(100 * 1000));
    expect(userPosition.numbers.collateralAmount).to.eq(remainingCollateral);

    // User realizes no profits & withdraws no collateral
    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(0);
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(0);

    userUSDCBalBefore = await usdc.balanceOf(user1.address);
    userWNTBalBefore = await wnt.balanceOf(user1.address);

    decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance.div(2),
      swapPath: [ethUsdMarket.marketToken, solUsdMarket.marketToken, ethUsdSpotOnlyMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(100 * 1000), // Decrease rest of position
      acceptablePrice: expandDecimals(5499, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)], // ETH goes up to 10% gain from entry price
        maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 1);
    expect(userPositions.length).to.eq(0);

    // 20 ETH valued at $5,500 / ETH
    // $500 profit per ETH
    // $10,000 Profit / $5,500 per WNT
    // ~ 1.818181818181818181 ETH
    const profitAmount = ethers.utils.parseEther("1.818181818181818181");

    // User realizes profits & withdraws all their collateral
    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(remainingCollateral);
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(profitAmount);
  });

  it("MarketDecrease withdraw collateral in profit and then close position", async () => {
    const initialUSDCBalance = expandDecimals(50 * 1000, 6); // 50,000 USDC
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    const userUSDCBalBefore = await usdc.balanceOf(user1.address);
    const userWNTBalBefore = await wnt.balanceOf(user1.address);

    let decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance.div(2), // Decreases half collateral
      swapPath: [],
      sizeDeltaUsd: 0, // Doesn't decrease any size
      acceptablePrice: expandDecimals(5499, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)], // ETH goes up 10%
        maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    let userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    const userPosition = userPositions[0];

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(200 * 1000)); // OG size is still there
    expect(userPosition.numbers.collateralAmount).to.eq(initialUSDCBalance.div(2)); // Half collateral removed

    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(initialUSDCBalance.div(2)); // User gets half collateral back
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(0); // User realizes no profits

    decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance.div(2), // Decreases other half of collateral (should get set to 0 in execution)
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // Close my position
      acceptablePrice: expandDecimals(5999, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(6000, 4), expandDecimals(1, 6)], // ETH goes up to 6000
        maxPrices: [expandDecimals(6000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);
    userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(0);

    // Position size 40 ETH
    // Position cost $200,000
    // Position value @ $6,000 / ETH = $240,000
    // Profit $40,000 / $6,000 = ~6.6667 ETH

    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(initialUSDCBalance); // User receives all collateral back
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(
      ethers.utils.parseEther("6.666666666666666666")
    ); // User realizes profits
  });

  it("MarketDecrease withdraw collateral losses are applied, then close position realize losses", async () => {
    const initialUSDCBalance = expandDecimals(50 * 1000, 6); // 50,000 USDC
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    const userUSDCBalBefore = await usdc.balanceOf(user1.address);
    const userWNTBalBefore = await wnt.balanceOf(user1.address);

    let decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance.div(2), // Decreases half collateral
      swapPath: [],
      sizeDeltaUsd: 0, // Doesn't decrease any size
      acceptablePrice: expandDecimals(4499, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)], // ETH goes down 10%
        maxPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    let userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(1);
    const userPosition = userPositions[0];

    // Losses are $500 per ETH
    // Position size in tokens is 40 ETH
    // Losses are $20,000 from collateral
    // But none of that is realized at this point

    expect(userPosition.numbers.sizeInUsd).to.eq(decimalToFloat(200 * 1000)); // OG size is still there
    expect(userPosition.numbers.collateralAmount).to.eq(initialUSDCBalance.div(2)); // Half collateral removed

    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(initialUSDCBalance.div(2)); // User gets half collateral back
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(0); // User realizes no profits

    decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance.div(2), // Decreases other half of collateral (should get set to 0 in execution)
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // Close my position
      acceptablePrice: expandDecimals(3999, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)], // ETH stays at 4500
        maxPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);
    userPositions = await reader.getAccountPositions(dataStore.address, user1.address, 0, 5);
    expect(userPositions.length).to.eq(0);

    // Position size 40 ETH
    // Losses $500 / ETH
    // 20k in losses

    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(
      initialUSDCBalance.sub(expandDecimals(20_000, 6))
    ); // User receives all collateral back minus losses
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(0); // User realizes no profits
  });

  it("MarketDecrease with current market as swapPath", async () => {
    const initialWNTBalance = ethers.utils.parseEther("10"); // 10 ETH e.g. $50k
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    const userUSDCBalBefore = await usdc.balanceOf(user1.address);
    const userWNTBalBefore = await wnt.balanceOf(user1.address);

    const decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: 0,
      swapPath: [ethUsdMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(200_000), // Close out position in profit
      acceptablePrice: expandDecimals(5499, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)], // ETH goes up 10%
        maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    // User profits $500 per ETH
    // 40 ETH * $500 = $20,000
    // Swaps ETH to USDC should receive 20,000 USDC for profit

    // Collateral of 10 ETH appreciates to $55k as well

    const profitAmount = expandDecimals(20_000, 6);
    const collateralAmount = expandDecimals(55_000, 6);

    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(
      collateralAmount.add(profitAmount).sub(1)
    ); // Notice rounding error of 1 wei
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(0);
  });

  it("MarketDecrease with swapCollateralToPnl", async () => {
    const initialUSDCBalance = expandDecimals(50_000, 6); // $50k USDC
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    const userUSDCBalBefore = await usdc.balanceOf(user1.address);
    const userWNTBalBefore = await wnt.balanceOf(user1.address);

    // Position Collateral is USDC, it should get swapped to WNT

    const decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: 0,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200_000), // Close out position in profit
      acceptablePrice: expandDecimals(5499, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
      decreasePositionSwapType: DecreasePositionSwapType.SwapCollateralTokenToPnlToken,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)], // ETH goes up 10%
        maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    // Position size 40 ETH -> $500 profit per ETH
    // $20,000 profit / $5,500 = ~3.636363636363 ETH profit
    // Collateral 50,000 USDC is swapped to ETH
    // $50,000 / $5,500 = ~9.090909090909 ETH

    const profitAmount = ethers.utils.parseEther("3.636363636363636363");
    const collateralAmount = ethers.utils.parseEther("9.090909090909090909");

    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(0); // Collateral has been swapped
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(profitAmount.add(collateralAmount));
  });

  it("MarketDecrease with swapCollateralToPnl and a swapPath at the end", async () => {
    const initialUSDCBalance = expandDecimals(50_000, 6); // $50k USDC
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    const userUSDCBalBefore = await usdc.balanceOf(user1.address);
    const userWNTBalBefore = await wnt.balanceOf(user1.address);

    // Position PNL token is WNT, it should get swapped to USDC

    const decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: 0,
      swapPath: [ethUsdMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(200_000), // Close out position in profit
      acceptablePrice: expandDecimals(5499, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
      decreasePositionSwapType: DecreasePositionSwapType.SwapCollateralTokenToPnlToken,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)], // ETH goes up 10%
        maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    // Position size 40 ETH -> $500 profit per ETH
    // $20,000 profit
    // Collateral 50,000 USDC

    const profitAmount = expandDecimals(20_000, 6);
    const collateralAmount = expandDecimals(50_000, 6);

    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(
      profitAmount.add(collateralAmount).sub(1)
    ); // Swapped to USDC, notice 1 wei precision error
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(0); // Was swapped out of WNT
  });

  it("MarketDecrease with swapPnLToCollateral", async () => {
    const initialUSDCBalance = expandDecimals(50_000, 6); // $50k USDC
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    const userUSDCBalBefore = await usdc.balanceOf(user1.address);
    const userWNTBalBefore = await wnt.balanceOf(user1.address);

    // Position PNL Token is WNT, it should get swapped to USDC

    const decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: 0,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200_000), // Close out position in profit
      acceptablePrice: expandDecimals(5499, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
      decreasePositionSwapType: DecreasePositionSwapType.SwapPnlTokenToCollateralToken,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)], // ETH goes up 10%
        maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    // Position size 40 ETH -> $500 profit per ETH
    // $20,000 profit
    // Collateral 50,000 USDC

    const profitAmount = expandDecimals(20_000, 6);
    const collateralAmount = expandDecimals(50_000, 6);

    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(
      profitAmount.add(collateralAmount).sub(1)
    ); // Swapped to USDC
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(0);
  });

  it("MarketDecrease to realize losses on a short position -- collateralToken == pnlToken", async () => {
    const initialUSDCBalance = expandDecimals(50_000, 6); // $50k USDC
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(4999, 12),
      orderType: OrderType.MarketIncrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    const userUSDCBalBefore = await usdc.balanceOf(user1.address);
    const userWNTBalBefore = await wnt.balanceOf(user1.address);

    const decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: 0,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200_000), // Close out position in profit
      acceptablePrice: expandDecimals(5501, 12),
      orderType: OrderType.MarketDecrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)], // ETH goes up 10%
        maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    // Position size 40 ETH -> $500 loss per ETH
    // $20,000 loss
    // Collateral 50,000 USDC

    const lossAmount = expandDecimals(20_000, 6);
    const collateralAmount = expandDecimals(50_000, 6);

    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(collateralAmount.sub(lossAmount));
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(0);
  });

  it("MarketDecrease to realize gains on a short -- collateralToken == pnlToken", async () => {
    const initialUSDCBalance = expandDecimals(50_000, 6); // $50k USDC
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(4999, 12),
      orderType: OrderType.MarketIncrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    const userUSDCBalBefore = await usdc.balanceOf(user1.address);
    const userWNTBalBefore = await wnt.balanceOf(user1.address);

    const decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: 0,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200_000), // Close out position in profit
      acceptablePrice: expandDecimals(4501, 12),
      orderType: OrderType.MarketDecrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)], // ETH goes up 10%
        maxPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    // Position size 40 ETH -> $500 gain per ETH
    // $20,000 gain
    // Collateral 50,000 USDC
    const profitAmount = expandDecimals(20_000, 6);
    const collateralAmount = expandDecimals(50_000, 6);

    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(collateralAmount.add(profitAmount));
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(0);
  });

  it("MarketDecrease to realize losses on a short position -- collateralToken != pnlToken", async () => {
    const initialWNTBalance = ethers.utils.parseEther("10"); // 10 ETH e.g. $50k
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(4999, 12),
      orderType: OrderType.MarketIncrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    const userUSDCBalBefore = await usdc.balanceOf(user1.address);
    const userWNTBalBefore = await wnt.balanceOf(user1.address);

    const decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: 0,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200_000), // Close out position in profit
      acceptablePrice: expandDecimals(5501, 12),
      orderType: OrderType.MarketDecrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)], // ETH goes up 10%
        maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    // Position size 40 ETH -> $500 loss per ETH
    // $20,000 loss / $5,500 = ~3.636363636 ETH
    // Collateral 10 ETH

    const lossAmount = ethers.utils.parseEther("3.636363636363636364");

    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(0);
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(initialWNTBalance.sub(lossAmount));
  });

  it("MarketDecrease to realize gains on a short -- collateralToken != pnlToken", async () => {
    const initialWNTBalance = ethers.utils.parseEther("10"); // 10 ETH e.g. $50k
    expect(await getOrderCount(dataStore)).eq(0);

    const increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(4999, 12),
      orderType: OrderType.MarketIncrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    const userUSDCBalBefore = await usdc.balanceOf(user1.address);
    const userWNTBalBefore = await wnt.balanceOf(user1.address);

    const decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: 0,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200_000), // Close out position in profit
      acceptablePrice: expandDecimals(4501, 12),
      orderType: OrderType.MarketDecrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)], // ETH goes up 10%
        maxPrices: [expandDecimals(4500, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    // Position size 40 ETH -> $500 gain per ETH
    // $20,000 gain, received in USDC
    // Collateral 10 ETH received back
    const profitAmount = expandDecimals(20_000, 6);

    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(profitAmount);
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(initialWNTBalance);
  });
});
