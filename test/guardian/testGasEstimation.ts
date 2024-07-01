import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, getOrderCount, createOrder } from "../../utils/order";
import { grantRole } from "../../utils/role";
import * as keys from "../../utils/keys";
import { encodeData } from "../../utils/hash";
import { getDepositCount, createDeposit } from "../../utils/deposit";
import { createWithdrawal, getWithdrawalCount } from "../../utils/withdrawal";
import { errorsContract } from "../../utils/error";

describe("Guardian.GasEstimation", () => {
  let fixture;
  let wallet;
  let roleStore, dataStore, ethUsdMarket, solUsdMarket, wnt, usdc, config;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet } = fixture.accounts);
    ({ roleStore, dataStore, ethUsdMarket, solUsdMarket, wnt, usdc, config } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(5_000_000, 6),
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: solUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
      execute: {
        tokens: [solUsdMarket.indexToken, wnt.address, usdc.address],
        precisions: [8, 8, 18],
        minPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });
  });

  it("Estimates gas properly for deposits with a single token", async () => {
    // Create a deposit for a single token
    const singleTokenDepositGasLimitKey = keys.depositGasLimitKey(true);
    const baseGasLimitKey = keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1;
    const gasPerOraclePriceKey = keys.ESTIMATED_GAS_FEE_PER_ORACLE_PRICE;
    const gasMultiplierKey = keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR;

    await dataStore.setUint(baseGasLimitKey, 50_000);
    await dataStore.setUint(gasPerOraclePriceKey, 16_600);
    await dataStore.setUint(singleTokenDepositGasLimitKey, 200_000);
    await dataStore.setUint(gasMultiplierKey, expandDecimals(15, 29)); // 1.5x

    // Gas required is around 0.0004 ETH, create fails
    await expect(
      createDeposit(fixture, {
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(500_000, 6),
        executionFee: expandDecimals(3, 14), // 0.0003 ETH
      })
    ).to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee");

    expect(await getDepositCount(dataStore)).to.eq(0);

    // Sufficient executionFee passes
    await createDeposit(fixture, {
      market: ethUsdMarket,
      shortTokenAmount: expandDecimals(500_000, 6),
      executionFee: expandDecimals(41, 13), // 0.00041 ETH
    });

    expect(await getDepositCount(dataStore)).to.eq(1);
  });

  it("Estimates gas properly for deposits with two tokens", async () => {
    // Create a deposit for a single token
    const doubleTokenDepositGasLimitKey = keys.depositGasLimitKey(false);
    const baseGasLimitKey = keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1;
    const gasPerOraclePriceKey = keys.ESTIMATED_GAS_FEE_PER_ORACLE_PRICE;
    const gasMultiplierKey = keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR;

    await dataStore.setUint(baseGasLimitKey, 50_000);
    await dataStore.setUint(gasPerOraclePriceKey, 16_600);
    await dataStore.setUint(doubleTokenDepositGasLimitKey, 300_000);
    await dataStore.setUint(gasMultiplierKey, expandDecimals(15, 29)); // 1.5x

    // Gas required is around 0.00055 ETH, create fails
    await expect(
      createDeposit(fixture, {
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(500_000, 6),
        longTokenAmount: expandDecimals(500_000, 6),
        executionFee: expandDecimals(54, 13), // 0.00054 ETH
      })
    ).to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee");

    expect(await getDepositCount(dataStore)).to.eq(0);

    // Sufficient executionFee passes
    await createDeposit(fixture, {
      market: ethUsdMarket,
      shortTokenAmount: expandDecimals(500_000, 6),
      longTokenAmount: expandDecimals(500_000, 6),
      executionFee: expandDecimals(56, 13), // 0.00056 ETH
    });

    expect(await getDepositCount(dataStore)).to.eq(1);
  });

  it("Estimates gas properly for deposits with swapPaths", async () => {
    await grantRole(roleStore, wallet.address, "CONFIG_KEEPER");

    await config.connect(wallet).setUint(keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1, "0x", 50_000);
    await config.connect(wallet).setUint(keys.ESTIMATED_GAS_FEE_PER_ORACLE_PRICE, "0x", 7_000);
    await config.connect(wallet).setUint(keys.DEPOSIT_GAS_LIMIT, encodeData(["bool"], [false]), 300_000);
    await config.connect(wallet).setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, "0x", expandDecimals(15, 29)); // 1.5x
    await config.connect(wallet).setUint(keys.SINGLE_SWAP_GAS_LIMIT, "0x", 25_000);

    // Gas required is around 50_000 + 7_000 * 7 prices + (4 swaps * 25_000 + 300_000) * 1.5 = 0.0007 ETH, create fails
    await expect(
      createDeposit(fixture, {
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(500_000, 6),
        longTokenAmount: expandDecimals(500_000, 6),
        longTokenSwapPath: [ethUsdMarket.marketToken, ethUsdMarket.marketToken, ethUsdMarket.marketToken],
        shortTokenSwapPath: [ethUsdMarket.marketToken],
        executionFee: expandDecimals(69, 13), // 0.00069 ETH
      })
    ).to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee");

    expect(await getDepositCount(dataStore)).to.eq(0);

    // Sufficient executionFee passes
    await createDeposit(fixture, {
      market: ethUsdMarket,
      shortTokenAmount: expandDecimals(500_000, 6),
      longTokenAmount: expandDecimals(500_000, 6),
      longTokenSwapPath: [ethUsdMarket.marketToken, ethUsdMarket.marketToken, ethUsdMarket.marketToken],
      shortTokenSwapPath: [ethUsdMarket.marketToken],
      executionFee: expandDecimals(71, 13), // 0.00071 ETH
    });

    expect(await getDepositCount(dataStore)).to.eq(1);
  });

  it("Estimates gas properly for withdrawals with swapPaths", async () => {
    await grantRole(roleStore, wallet.address, "CONFIG_KEEPER");

    await config.connect(wallet).setUint(keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1, "0x", 50_000);
    await config.connect(wallet).setUint(keys.ESTIMATED_GAS_FEE_PER_ORACLE_PRICE, "0x", 7_000);
    await config.connect(wallet).setUint(keys.WITHDRAWAL_GAS_LIMIT, "0x", 300_000);
    await config.connect(wallet).setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, "0x", expandDecimals(15, 29)); // 1.5x
    await config.connect(wallet).setUint(keys.SINGLE_SWAP_GAS_LIMIT, "0x", 25_000);

    // Gas required is around 50_000 + 7_000 * 7 prices + (4 swaps * 25_000 + 300_000) * 1.5 = 0.0007 ETH, create fails
    await expect(
      createWithdrawal(fixture, {
        market: ethUsdMarket,
        marketTokenAmount: expandDecimals(30000, 18),
        longTokenSwapPath: [ethUsdMarket.marketToken, ethUsdMarket.marketToken, ethUsdMarket.marketToken],
        shortTokenSwapPath: [ethUsdMarket.marketToken],
        executionFee: expandDecimals(69, 13), // 0.00069 ETH
      })
    ).to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee");

    expect(await getWithdrawalCount(dataStore)).to.eq(0);

    // Sufficient executionFee passes
    await createWithdrawal(fixture, {
      market: ethUsdMarket,
      marketTokenAmount: expandDecimals(30000, 18),
      longTokenSwapPath: [ethUsdMarket.marketToken, ethUsdMarket.marketToken, ethUsdMarket.marketToken],
      shortTokenSwapPath: [ethUsdMarket.marketToken],
      executionFee: expandDecimals(71, 13), // 0.00071 ETH
    });

    expect(await getWithdrawalCount(dataStore)).to.eq(1);
  });

  it("Estimates gas properly for increase orders with swaps", async () => {
    await grantRole(roleStore, wallet.address, "CONFIG_KEEPER");

    await config.connect(wallet).setUint(keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1, "0x", 50_000);
    await config.connect(wallet).setUint(keys.ESTIMATED_GAS_FEE_PER_ORACLE_PRICE, "0x", 7_000);
    await config.connect(wallet).setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, "0x", expandDecimals(15, 29)); // 1.5x
    await config.connect(wallet).setUint(keys.SINGLE_SWAP_GAS_LIMIT, "0x", 25_000);
    await config.connect(wallet).setUint(keys.INCREASE_ORDER_GAS_LIMIT, "0x", 300_000);

    // Gas required is around 50_000 + 7_000 * 7 prices + (4 swaps * 25_000 + 300_000) * 1.5 = 0.0007 ETH, create fails
    await expect(
      createOrder(fixture, {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(1, 18),
        sizeDeltaUsd: decimalToFloat(10_000),
        acceptablePrice: expandDecimals(4800, 12),
        swapPath: [
          ethUsdMarket.marketToken,
          ethUsdMarket.marketToken,
          ethUsdMarket.marketToken,
          ethUsdMarket.marketToken,
        ],
        triggerPrice: expandDecimals(4700, 12),
        orderType: OrderType.LimitIncrease,
        executionFee: expandDecimals(69, 13), // 0.00069 ETH
        isLong: true,
      })
    ).to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee");

    expect(await getOrderCount(dataStore)).to.eq(0);

    // Sufficient executionFee passes
    await createOrder(fixture, {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(4800, 12),
      swapPath: [
        ethUsdMarket.marketToken,
        ethUsdMarket.marketToken,
        ethUsdMarket.marketToken,
        ethUsdMarket.marketToken,
      ],
      triggerPrice: expandDecimals(4700, 12),
      orderType: OrderType.LimitIncrease,
      executionFee: expandDecimals(71, 13), // 0.00071 ETH
      isLong: true,
    });

    expect(await getOrderCount(dataStore)).to.eq(1);
  });

  it("Estimates gas properly for decrease orders with swaps", async () => {
    await grantRole(roleStore, wallet.address, "CONFIG_KEEPER");

    await config.connect(wallet).setUint(keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1, "0x", 50_000);
    await config.connect(wallet).setUint(keys.ESTIMATED_GAS_FEE_PER_ORACLE_PRICE, "0x", 7_000);
    await config.connect(wallet).setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, "0x", expandDecimals(15, 29)); // 1.5x
    await config.connect(wallet).setUint(keys.SINGLE_SWAP_GAS_LIMIT, "0x", 25_000);
    await config.connect(wallet).setUint(keys.DECREASE_ORDER_GAS_LIMIT, "0x", 300_000);

    // Gas required is around 50_000 + 7_000 * 7 prices + (4 swaps * 25_000 + 300_000) * 1.5 = 0.0007 ETH, create fails
    await expect(
      createOrder(fixture, {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(1, 18),
        sizeDeltaUsd: decimalToFloat(10_000),
        acceptablePrice: expandDecimals(4800, 12),
        swapPath: [
          ethUsdMarket.marketToken,
          ethUsdMarket.marketToken,
          ethUsdMarket.marketToken,
          ethUsdMarket.marketToken,
        ],
        orderType: OrderType.StopLossDecrease,
        executionFee: expandDecimals(69, 13), // 0.00069 ETH
        isLong: true,
      })
    ).to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee");

    expect(await getOrderCount(dataStore)).to.eq(0);

    // Sufficient executionFee passes
    await createOrder(fixture, {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      swapPath: [
        ethUsdMarket.marketToken,
        ethUsdMarket.marketToken,
        ethUsdMarket.marketToken,
        ethUsdMarket.marketToken,
      ],
      sizeDeltaUsd: decimalToFloat(10_000),
      orderType: OrderType.StopLossDecrease,
      executionFee: expandDecimals(71, 13), // 0.00071 ETH
      isLong: true,
    });

    expect(await getOrderCount(dataStore)).to.eq(1);
  });

  it("Estimates gas properly for swap orders", async () => {
    await grantRole(roleStore, wallet.address, "CONFIG_KEEPER");

    await config.connect(wallet).setUint(keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1, "0x", 50_000);
    await config.connect(wallet).setUint(keys.ESTIMATED_GAS_FEE_PER_ORACLE_PRICE, "0x", 7_000);
    await config.connect(wallet).setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, "0x", expandDecimals(15, 29)); // 1.5x
    await config.connect(wallet).setUint(keys.SINGLE_SWAP_GAS_LIMIT, "0x", 25_000);
    await config.connect(wallet).setUint(keys.SWAP_ORDER_GAS_LIMIT, "0x", 300_000);

    // Gas required is around 50_000 + 7_000 * 7 prices + (4 swaps * 25_000 + 300_000) * 1.5 = 0.0007 ETH, create fails
    await expect(
      createOrder(fixture, {
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(1, 18),
        swapPath: [
          ethUsdMarket.marketToken,
          ethUsdMarket.marketToken,
          ethUsdMarket.marketToken,
          ethUsdMarket.marketToken,
        ],
        orderType: OrderType.LimitSwap,
        executionFee: expandDecimals(69, 13), // 0.00069 ETH
        isLong: true,
      })
    ).to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee");

    expect(await getOrderCount(dataStore)).to.eq(0);

    // Sufficient executionFee passes
    await createOrder(fixture, {
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      swapPath: [
        ethUsdMarket.marketToken,
        ethUsdMarket.marketToken,
        ethUsdMarket.marketToken,
        ethUsdMarket.marketToken,
      ],
      orderType: OrderType.LimitSwap,
      executionFee: expandDecimals(71, 13), // 0.00071 ETH
      isLong: true,
    });

    expect(await getOrderCount(dataStore)).to.eq(1);
  });
});
