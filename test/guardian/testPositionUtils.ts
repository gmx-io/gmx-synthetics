import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { getPositionCount } from "../../utils/position";
import { getBalanceOf, getSyntheticTokenAddress } from "../../utils/token";
import { executeLiquidation } from "../../utils/liquidation";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import hre from "hardhat";

describe("Guardian.PositionUtils", () => {
  let fixture;
  let user0;
  let dataStore, wnt, usdc, ethUsdMarket, solUsdMarket, ethUsdSingleTokenMarket;
  const sol = getSyntheticTokenAddress(hre.network.config.chainId, "SOL");

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, wnt, usdc, solUsdMarket, ethUsdSingleTokenMarket } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(20, 18),
        shortTokenAmount: expandDecimals(100_000, 6),
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
        market: ethUsdSingleTokenMarket,
        longTokenAmount: expandDecimals(200_000, 6),
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: solUsdMarket,
        longTokenAmount: expandDecimals(20, 18),
        shortTokenAmount: expandDecimals(100_000, 6),
      },
      execute: {
        precisions: [8, 8, 18],
        tokens: [sol, wnt.address, usdc.address],
        minPrices: [expandDecimals(10, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(10, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });
  });

  it("Capped PnL Typical Market", async () => {
    // User0 MarketIncrease long position with long collateral for $50K
    // $50,000 / $10 = 5000 SOL tokens

    const initialCollateral = expandDecimals(10, 18);
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: solUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: initialCollateral, // $50,000 Collateral
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(50_000), // $50,000 Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        precisions: [8, 8, 18],
        tokens: [sol, wnt.address, usdc.address],
        minPrices: [expandDecimals(10, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(10, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    // SOL 10x's to $100
    // 5000 SOL * $100 = $500,000
    // $500,000 - $50,000 = $450,000 profit
    // Pool amount remains 20 ETH * $5000 = $100,000
    // Max PnL = 50% * $100,000 = $50,000

    // Total Position PnL = $450,000 (position PnL) * $50,000 (capped PnL) / $450,000 (pool PnL) = $50,000
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: solUsdMarket,
        initialCollateralToken: wnt,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(50_000),
        acceptablePrice: expandDecimals(100, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        precisions: [8, 8, 18],
        tokens: [sol, wnt.address, usdc.address],
        minPrices: [expandDecimals(100, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(100, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    expect(await getPositionCount(dataStore)).to.eq(0);
    // Because the PnL will be capped to $50,000, the user will receive $50,000 / $5,000 = 10 WNT in profit
    const profit = expandDecimals(10, 18);
    expect(await getBalanceOf(wnt.address, user0.address)).to.eq(profit.add(initialCollateral));
  });

  it("Capped PnL Single Token Market", async () => {
    // User0 MarketIncrease long position with long collateral for $50K
    // $50,000 / $5,000 = 10 ETH tokens

    const initialCollateral = expandDecimals(50_000, 6);
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: initialCollateral, // $50,000 Collateral
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(50_000), // $50,000 Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    // ETH 10x's to $50,000
    // 10 ETH * $50,000 = $500,000
    // $500,000 - $50,000 = $450,000 profit
    // Pool amount remains (200,000/2) USDC * $1 = $100,000
    // Max PnL = 50% * $100,000 = $50,000

    // Total Position PnL = $450,000 (position PnL) * $50,000 (capped PnL) / $450,000 (pool PnL) = $50,000
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdSingleTokenMarket,
        initialCollateralToken: usdc,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(50_000),
        acceptablePrice: expandDecimals(50_000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(50_000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(50_000, 4), expandDecimals(1, 6)],
      },
    });

    expect(await getPositionCount(dataStore)).to.eq(0);
    // Because the PnL will be capped to $50,000, the user will receive $50,000 / $1 = 50,000 USDC in profit
    const profit = expandDecimals(50_000, 6);
    expect(await getBalanceOf(usdc.address, user0.address)).to.eq(profit.add(initialCollateral));
  });

  it("willPositionCollateralBeSufficient fails: remainingCollateralUsd < 0", async () => {
    // User0 MarketIncrease long position with long collateral for $5K
    // $50,000 / $10 = 5000 SOL tokens
    const initialCollateral = expandDecimals(5000, 6);
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: solUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: initialCollateral, // $5000 Collateral
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(50_000), // $50,000 Position
        acceptablePrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        precisions: [8, 8, 18],
        tokens: [sol, wnt.address, usdc.address],
        minPrices: [expandDecimals(10, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(10, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    // User attempts to close half their position size.
    // Realized PnL will be $25,000 / 2 = $12,500 which exceeds collateral of $5,000
    // As a result, remainingCollateralUsd < 0 and the collateral will not be sufficient.
    // Execution will continue until the PnL cost needs to be paid, but there won't be enough funds to cover the cost.
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: solUsdMarket,
        initialCollateralToken: usdc,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(25 * 1000),
        acceptablePrice: expandDecimals(1, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        precisions: [8, 8, 18],
        tokens: [sol, wnt.address, usdc.address],
        minPrices: [expandDecimals(5, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
        expectedCancellationReason: "InsufficientFundsToPayForCosts",
      },
    });

    expect(await getPositionCount(dataStore)).to.eq(1);

    await executeLiquidation(fixture, {
      account: user0.address,
      market: solUsdMarket,
      collateralToken: usdc,
      isLong: true,
      precisions: [8, 8, 18],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
      tokens: [sol, wnt.address, usdc.address],
      minPrices: [expandDecimals(5, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(5, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
    });

    expect(await getPositionCount(dataStore)).to.eq(0);
  });
});
