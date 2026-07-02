import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat, FLOAT_PRECISION } from "../../utils/math";
import { OrderType, getOrderCount, handleOrder } from "../../utils/order";
import { handleDeposit } from "../../utils/deposit";
import { getPositionCount, getPositionKeys } from "../../utils/position";
import * as keys from "../../utils/keys";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { grantRole } from "../../utils/role";
import { executeLiquidation } from "../../utils/liquidation";
import { getSyntheticTokenAddress } from "../../utils/token";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import { getPoolAmount } from "../../utils/market";
import { errorsContract } from "../../utils/error";
import hre from "hardhat";

describe("Guardian.Liquidation", () => {
  const { provider } = ethers;

  let fixture;
  let user1, wallet;
  let dataStore,
    reader,
    referralStorage,
    solUsdMarket,
    solAddr,
    ethUsdMarket,
    ethUsdSpotOnlyMarket,
    wnt,
    usdc,
    roleStore;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ wallet, user1 } = fixture.accounts);
    ({ dataStore, reader, referralStorage, solUsdMarket, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc, roleStore } =
      fixture.contracts);

    await grantRole(roleStore, wallet.address, "LIQUIDATION_KEEPER");

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
        market: solUsdMarket,
        longTokenAmount: expandDecimals(10000000, 18), // ETH
        shortTokenAmount: expandDecimals(10000000 * 5000, 6), // USDC
      },
      execute: {
        tokens: [wnt.address, usdc.address, solAddr],
        precisions: [8, 18, 8],
        minPrices: [expandDecimals(2500, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(2500, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
      },
    });
  });

  it("Cannot liquidate a user who has sufficient collateral", async () => {
    const initialUSDCBalance = expandDecimals(50 * 1000, 6); // 50,000 USDC
    expect(await getOrderCount(dataStore)).eq(0);

    const params = {
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
      create: params,
      execute: {
        tokens: [wnt.address, usdc.address],
        prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    await mine();

    // Position has been made, now attempt to liquidate it
    // The liquidation should revert as the position is perfectly backed

    await expect(
      executeLiquidation(fixture, {
        account: user1.address,
        market: ethUsdMarket,
        collateralToken: usdc,
        isLong: true,
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      })
    ).to.be.revertedWithCustomError(errorsContract, "PositionShouldNotBeLiquidated");

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);
  });

  it("User can get liquidated if they invalidate the minCollateralUsdForLeverage", async () => {
    const etherBalInitial = await provider.getBalance(user1.address);
    const initialWNTBalance = expandDecimals(1, 18); // 1 WNT e.g. $5,000
    expect(await getOrderCount(dataStore)).eq(0);

    const params = {
      account: user1,
      market: solUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(450 * 1000), // 90x leverage -- position size is 30000 SOL @ $15/SOL
      acceptablePrice: expandDecimals(16, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
      executionFee: "0",
    };

    await handleOrder(fixture, {
      create: params,
      execute: {
        tokens: [wnt.address, usdc.address, solAddr],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);
    await mine();

    // Now the price of their collateral token decreases 50%

    await expect(
      executeLiquidation(fixture, {
        account: user1.address,
        market: solUsdMarket,
        collateralToken: wnt,
        isLong: true,
        tokens: [wnt.address, usdc.address, solAddr],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
      })
    ).to.be.revertedWithCustomError(errorsContract, "PositionShouldNotBeLiquidated");

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    await executeLiquidation(fixture, {
      account: user1.address,
      market: solUsdMarket,
      collateralToken: wnt,
      tokens: [wnt.address, usdc.address, solAddr],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
      precisions: [8, 18, 8],
      isLong: true,
      minPrices: [expandDecimals(2500, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
      maxPrices: [expandDecimals(2500, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    // Our user receives their 1 WNT back after their position is liquidated
    expect((await provider.getBalance(user1.address)).sub(etherBalInitial)).to.eq(initialWNTBalance);
  });

  it("User can get liquidated if they invalidate the minCollateralUsdForLeverage", async () => {
    const etherBalInitial = await provider.getBalance(user1.address);
    const initialWNTBalance = expandDecimals(1, 18); // 1 WNT e.g. $5,000
    expect(await getOrderCount(dataStore)).eq(0);

    const params = {
      account: user1,
      market: solUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(450 * 1000), // 90x leverage -- position size is 30000 SOL @ $15/SOL
      acceptablePrice: expandDecimals(16, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
      executionFee: "0",
    };

    await handleOrder(fixture, {
      create: params,
      execute: {
        tokens: [wnt.address, usdc.address, solAddr],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);
    await mine();

    await expect(
      executeLiquidation(fixture, {
        account: user1.address,
        market: solUsdMarket,
        collateralToken: wnt,
        isLong: true,
        tokens: [wnt.address, usdc.address, solAddr],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
      })
    ).to.be.revertedWithCustomError(errorsContract, "PositionShouldNotBeLiquidated");

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    // Now the price of their collateral token decreases 50%

    await executeLiquidation(fixture, {
      account: user1.address,
      market: solUsdMarket,
      collateralToken: wnt,
      tokens: [wnt.address, usdc.address, solAddr],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
      precisions: [8, 18, 8],
      isLong: true,
      minPrices: [expandDecimals(2500, 4), expandDecimals(1, 6), expandDecimals(1499, 2)], // SOL loses $0.01
      maxPrices: [expandDecimals(2500, 4), expandDecimals(1, 6), expandDecimals(1499, 2)],
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    // Trader's position size is 30,000 SOL -- cost is 450k
    // 30,000 * $14.99 = 449,700
    // PnL = 449,700 - 450,000 = -300
    // 300 / 2500 = .12 WNT lost
    // Our user receives their .88 WNT back after their position is liquidated
    expect((await provider.getBalance(user1.address)).sub(etherBalInitial)).to.eq(ethers.utils.parseEther(".88"));
  });

  it("Liquidate short position because collateral depreciates", async () => {
    const etherBalInitial = await provider.getBalance(user1.address);
    const initialWNTBalance = expandDecimals(1, 18); // 1 WNT e.g. $5,000
    expect(await getOrderCount(dataStore)).eq(0);

    const params = {
      account: user1,
      market: solUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(450 * 1000), // 90x leverage -- position size is 30000 SOL @ $15/SOL
      acceptablePrice: expandDecimals(14, 12),
      orderType: OrderType.MarketIncrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
      executionFee: "0",
    };

    await handleOrder(fixture, {
      create: params,
      execute: {
        tokens: [wnt.address, usdc.address, solAddr],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);
    await mine();

    await expect(
      executeLiquidation(fixture, {
        account: user1.address,
        market: solUsdMarket,
        collateralToken: wnt,
        isLong: false,
        tokens: [wnt.address, usdc.address, solAddr],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
        minPrices: [expandDecimals(4501, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(4501, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
      })
    ).to.be.revertedWithCustomError(errorsContract, "PositionShouldNotBeLiquidated");

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    await executeLiquidation(fixture, {
      account: user1.address,
      market: solUsdMarket,
      collateralToken: wnt,
      tokens: [wnt.address, usdc.address, solAddr],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
      precisions: [8, 18, 8],
      isLong: false,
      minPrices: [expandDecimals(4499, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
      maxPrices: [expandDecimals(4499, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    // Trader receives their collateral back, 1 ETH
    expect((await provider.getBalance(user1.address)).sub(etherBalInitial)).to.eq(ethers.utils.parseEther("1"));
  });

  it("Liquidate short position because index token price increases", async () => {
    const etherBalInitial = await provider.getBalance(user1.address);
    const initialWNTBalance = expandDecimals(1, 18); // 1 WNT e.g. $5,000
    expect(await getOrderCount(dataStore)).eq(0);

    const params = {
      account: user1,
      market: solUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(450 * 1000), // 90x leverage -- position size is 30000 SOL @ $15/SOL
      acceptablePrice: expandDecimals(14, 12),
      orderType: OrderType.MarketIncrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
      executionFee: "0",
    };

    await handleOrder(fixture, {
      create: params,
      execute: {
        tokens: [wnt.address, usdc.address, solAddr],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);
    await mine();

    await expect(
      executeLiquidation(fixture, {
        account: user1.address,
        market: solUsdMarket,
        collateralToken: wnt,
        isLong: false,
        tokens: [wnt.address, usdc.address, solAddr],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
      })
    ).to.be.revertedWithCustomError(errorsContract, "PositionShouldNotBeLiquidated");

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    // Position size 450k
    // 100x is 4.5k Collateral
    // E.g. liquidatable @ $500 of losses
    // 500 / 30000 = -0.016666 per SOL

    await expect(
      executeLiquidation(fixture, {
        account: user1.address,
        market: solUsdMarket,
        collateralToken: wnt,
        isLong: false,
        tokens: [wnt.address, usdc.address, solAddr],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15016, 1)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15016, 1)],
      })
    ).to.be.revertedWithCustomError(errorsContract, "PositionShouldNotBeLiquidated");

    await executeLiquidation(fixture, {
      account: user1.address,
      market: solUsdMarket,
      collateralToken: wnt,
      tokens: [wnt.address, usdc.address, solAddr],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
      precisions: [8, 18, 8],
      isLong: false,
      minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15017, 1)], // SOL gains $.017
      maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15017, 1)],
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    // Trader's position size is 30,000 SOL -- cost is 450k
    // 30,000 * $15.017 = $450,510
    // PnL = 450,000 - 450,510 = -510
    // 510 / 5000 = 0.102 WNT lost
    // Our user receives their 1 - .102 = .898 WNT back after their position is liquidated
    expect((await provider.getBalance(user1.address)).sub(etherBalInitial)).to.eq(ethers.utils.parseEther(".898"));
  });

  it("Liquidate short position because index token price increases a lot", async () => {
    const etherBalInitial = await provider.getBalance(user1.address);
    const initialWNTBalance = expandDecimals(1, 18); // 1 WNT e.g. $5,000
    expect(await getOrderCount(dataStore)).eq(0);

    const params = {
      account: user1,
      market: solUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(450 * 1000), // 90x leverage -- position size is 30000 SOL @ $15/SOL
      acceptablePrice: expandDecimals(14, 12),
      orderType: OrderType.MarketIncrease,
      isLong: false,
      shouldUnwrapNativeToken: false,
      executionFee: "0",
    };

    await handleOrder(fixture, {
      create: params,
      execute: {
        tokens: [wnt.address, usdc.address, solAddr],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
      },
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);
    await mine();

    await expect(
      executeLiquidation(fixture, {
        account: user1.address,
        market: solUsdMarket,
        collateralToken: wnt,
        isLong: false,
        tokens: [wnt.address, usdc.address, solAddr],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
      })
    ).to.be.revertedWithCustomError(errorsContract, "PositionShouldNotBeLiquidated");

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(1);

    // Position size 450k
    // 100x is 4.5k Collateral
    // E.g. liquidatable @ $500 of losses
    // 500 / 30000 = -0.016666 per SOL
    // But instead price increases a lot more

    await expect(
      executeLiquidation(fixture, {
        account: user1.address,
        market: solUsdMarket,
        collateralToken: wnt,
        isLong: false,
        tokens: [wnt.address, usdc.address, solAddr],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15016, 1)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15016, 1)],
      })
    ).to.be.revertedWithCustomError(errorsContract, "PositionShouldNotBeLiquidated");

    await executeLiquidation(fixture, {
      account: user1.address,
      market: solUsdMarket,
      collateralToken: wnt,
      tokens: [wnt.address, usdc.address, solAddr],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
      precisions: [8, 18, 8],
      isLong: false,
      minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(150, 4)], // SOL 10x's
      maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(150, 4)],
    });

    expect(await getOrderCount(dataStore)).to.eq(0);
    expect(await getPositionCount(dataStore)).to.eq(0);

    // Trader's receives no collateral back
    expect((await provider.getBalance(user1.address)).sub(etherBalInitial)).to.eq(ethers.utils.parseEther("0"));
  });

  it("Liquidate someone with more losses than collateral", async () => {
    const initialWNTBalance = expandDecimals(1, 18); // 1 WNT e.g. $5,000
    expect(await getOrderCount(dataStore)).eq(0);

    const params = {
      account: user1,
      market: solUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(450 * 1000), // 90x leverage -- position size is 30000 SOL @ $15/SOL
      acceptablePrice: expandDecimals(16, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
      executionFee: "0",
    };

    await handleOrder(fixture, {
      create: params,
      execute: {
        tokens: [wnt.address, usdc.address, solAddr],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
      },
    });

    await mine();

    const userWNTBalBefore = await wnt.balanceOf(user1.address);
    const userNativeBalBefore = await ethers.provider.getBalance(user1.address);
    const userUSDCBalBefore = await usdc.balanceOf(user1.address);
    const poolBalBefore = await getPoolAmount(dataStore, solUsdMarket.marketToken, wnt.address);

    await executeLiquidation(fixture, {
      account: user1.address,
      market: solUsdMarket,
      collateralToken: wnt,
      isLong: true,
      tokens: [wnt.address, usdc.address, solAddr],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
      precisions: [8, 18, 8],
      minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(1, 4)], // SOL goes to $1
      maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(1, 4)],
    });

    // Pool gets all the collateral & user gets nothing
    expect((await getPoolAmount(dataStore, solUsdMarket.marketToken, wnt.address)).sub(poolBalBefore)).to.eq(
      initialWNTBalance
    );
    expect((await ethers.provider.getBalance(user1.address)).sub(userNativeBalBefore)).to.eq(0);
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(0);
    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(0);
  });

  it("Liquidate someone in profit & they receive their native tokens", async () => {
    const initialWNTBalance = expandDecimals(1, 18); // 1 WNT e.g. $5,000
    expect(await getOrderCount(dataStore)).eq(0);

    const params = {
      account: user1,
      market: solUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialWNTBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(450 * 1000), // 90x leverage -- position size is 30000 SOL @ $15/SOL
      acceptablePrice: expandDecimals(16, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
      executionFee: "0",
    };

    await handleOrder(fixture, {
      create: params,
      execute: {
        tokens: [wnt.address, usdc.address, solAddr],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
      },
    });

    await mine();

    const userWNTBalBefore = await wnt.balanceOf(user1.address);
    const userNativeBalBefore = await ethers.provider.getBalance(user1.address);
    const userUSDCBalBefore = await usdc.balanceOf(user1.address);
    const poolBalBefore = await getPoolAmount(dataStore, solUsdMarket.marketToken, wnt.address);

    await executeLiquidation(fixture, {
      account: user1.address,
      market: solUsdMarket,
      collateralToken: wnt,
      isLong: true,
      tokens: [wnt.address, usdc.address, solAddr],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
      precisions: [8, 18, 8],
      minPrices: [expandDecimals(4000, 4), expandDecimals(1, 6), expandDecimals(1501, 2)], // SOL goes to $15.01 & ETH goes to $4000
      maxPrices: [expandDecimals(4000, 4), expandDecimals(1, 6), expandDecimals(1501, 2)],
    });

    // Profit amount = $0.01 / SOL * 30000 SOL = $300
    // $4000 collateral + $300 = $4300
    // $450,000 Position => >100x leverage => liquidated
    // pnlAmount that pool pays => $300 / $4000 = 0.075 ETH
    // Collateral amount transferred to the user => 1 ETH
    const pnlAmount = ethers.utils.parseEther("0.075");
    const collateralAmount = ethers.utils.parseEther("1");

    expect(poolBalBefore.sub(await getPoolAmount(dataStore, solUsdMarket.marketToken, wnt.address))).to.eq(pnlAmount);
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(0);
    expect((await ethers.provider.getBalance(user1.address)).sub(userNativeBalBefore)).to.eq(
      pnlAmount.add(collateralAmount)
    );
    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(0);
  });

  it("Liquidate someone in profit & their pnl is swapped to collateral tokens as output", async () => {
    const initialUSDCBalance = expandDecimals(5_000, 6); // 5,000 USDC
    expect(await getOrderCount(dataStore)).eq(0);

    const params = {
      account: user1,
      market: solUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(450 * 1000), // 90x leverage -- position size is 30000 SOL @ $15/SOL
      acceptablePrice: expandDecimals(16, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
      executionFee: "0",
    };

    await handleOrder(fixture, {
      create: params,
      execute: {
        tokens: [wnt.address, usdc.address, solAddr],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
      },
    });

    await mine();

    const userWNTBalBefore = await wnt.balanceOf(user1.address);
    const userNativeBalBefore = await ethers.provider.getBalance(user1.address);
    const userUSDCBalBefore = await usdc.balanceOf(user1.address);
    const poolBalBefore = await getPoolAmount(dataStore, solUsdMarket.marketToken, wnt.address);

    expect(await getPositionCount(dataStore)).to.eq(1);

    await executeLiquidation(fixture, {
      account: user1.address,
      market: solUsdMarket,
      collateralToken: usdc,
      isLong: true,
      tokens: [wnt.address, usdc.address, solAddr],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
      precisions: [8, 18, 8],
      minPrices: [expandDecimals(4000, 4), expandDecimals(8, 5), expandDecimals(1501, 2)], // SOL goes to $15.01 & USDC goes to $0.80
      maxPrices: [expandDecimals(4000, 4), expandDecimals(8, 5), expandDecimals(1501, 2)],
    });

    expect(await getPositionCount(dataStore)).to.eq(0);

    // Profit amount = $0.01 / SOL * 30000 SOL = $300
    // $4000 collateral + $300 = $4300
    // $450,000 Position => >100x leverage => liquidated

    // Profit amount of $300 is swapped to collateral tokens
    // Receive 300 / .8 = 375 USDC for profit
    expect(poolBalBefore.sub(await getPoolAmount(dataStore, solUsdMarket.marketToken, wnt.address))).to.eq(0);
    expect((await wnt.balanceOf(user1.address)).sub(userWNTBalBefore)).to.eq(0);
    expect((await ethers.provider.getBalance(user1.address)).sub(userNativeBalBefore)).to.eq(0);
    expect((await usdc.balanceOf(user1.address)).sub(userUSDCBalBefore)).to.eq(
      initialUSDCBalance.add(expandDecimals(375, 6))
    );
  });

  it("liquidate from the minCollateralUsd", async () => {
    const initialUSDCBalance = expandDecimals(15, 5); // 1.5 USDC
    expect(await getOrderCount(dataStore)).eq(0);

    const params = {
      account: user1,
      market: solUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: initialUSDCBalance,
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(1), // 2/3x leverage
      acceptablePrice: expandDecimals(16, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
      executionFee: "0",
    };

    await handleOrder(fixture, {
      create: params,
      execute: {
        tokens: [wnt.address, usdc.address, solAddr],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(15, 4)],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18, 8],
      },
    });

    await mine();
    expect(await getPositionCount(dataStore)).to.eq(1);

    await executeLiquidation(fixture, {
      account: user1.address,
      market: solUsdMarket,
      collateralToken: usdc,
      isLong: true,
      tokens: [wnt.address, solAddr, usdc.address],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
      precisions: [8, 8, 18],
      minPrices: [expandDecimals(5000, 4), expandDecimals(15, 4), expandDecimals(5, 5)], // USDC goes to 0.50
      maxPrices: [expandDecimals(5000, 4), expandDecimals(15, 4), expandDecimals(5, 5)],
    });

    expect(await getPositionCount(dataStore)).to.eq(0);
  });

  describe("positive pnl is valued at its realizable amount across the oracle spread", () => {
    const usdcPrice = { min: expandDecimals(1, 24), max: expandDecimals(1, 24) };
    const wntMin = expandDecimals(5500, 12); // index rose to $5,500
    const wntMax = expandDecimals(11000, 12); // doubled, so realized pnl is halved
    const wntMaxForLiquidation = expandDecimals(7000, 12);
    const sizeInUsd = decimalToFloat(100 * 1000);
    const sizeInTokens = expandDecimals(20, 18); // 20 WNT at the $5,000 open price, no price impact
    const pnlUsd = sizeInTokens.mul(wntMin).sub(sizeInUsd);
    const creditedNoSpread = pnlUsd.div(wntMin).mul(wntMin);
    const creditedWithSpread = pnlUsd.div(wntMax).mul(wntMin);

    const pricesNoSpread = {
      indexTokenPrice: { min: wntMin, max: wntMin },
      longTokenPrice: { min: wntMin, max: wntMin },
      shortTokenPrice: usdcPrice,
    };
    const pricesWithSpread = {
      indexTokenPrice: { min: wntMin, max: wntMax },
      longTokenPrice: { min: wntMin, max: wntMax },
      shortTokenPrice: usdcPrice,
    };
    const pricesWithSpreadForLiquidation = {
      indexTokenPrice: { min: wntMin, max: wntMaxForLiquidation },
      longTokenPrice: { min: wntMin, max: wntMaxForLiquidation },
      shortTokenPrice: usdcPrice,
    };

    beforeEach(async () => {
      // disable price impact so the realized pnl is the only spread dependent term
      await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), 0);
      await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), 0);
    });

    // set the leverage threshold between the discounted and full remaining collateral so the
    // position is liquidatable only when the pnl is valued at its realizable amount
    const setThresholdBetween = async (remainingWithSpread, remainingNoSpread) => {
      const target = remainingWithSpread.add(remainingNoSpread).div(2);
      const factor = target.mul(FLOAT_PRECISION).div(sizeInUsd);
      await dataStore.setUint(keys.minCollateralFactorForLiquidationKey(ethUsdMarket.marketToken), factor);
    };

    const openLong = async (collateralToken, collateralDeltaAmount) => {
      await handleOrder(fixture, {
        create: {
          account: user1,
          market: ethUsdMarket,
          initialCollateralToken: collateralToken,
          initialCollateralDeltaAmount: collateralDeltaAmount,
          sizeDeltaUsd: sizeInUsd,
          acceptablePrice: expandDecimals(5001, 12),
          orderType: OrderType.MarketIncrease,
          isLong: true,
        },
        execute: {
          tokens: [wnt.address, usdc.address],
          prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
          precisions: [8, 18],
        },
      });
    };

    it("credits the realizable pnl when the pnl token is the collateral token", async () => {
      await openLong(wnt, expandDecimals(1, 18));
      const positionKey = (await getPositionKeys(dataStore, 0, 1))[0];

      const [, , infoNoSpread] = await reader.isPositionLiquidatable(
        dataStore.address,
        referralStorage.address,
        positionKey,
        ethUsdMarket,
        pricesNoSpread,
        false,
        true
      );
      const [, , infoWithSpread] = await reader.isPositionLiquidatable(
        dataStore.address,
        referralStorage.address,
        positionKey,
        ethUsdMarket,
        pricesWithSpread,
        false,
        true
      );

      expect(infoNoSpread.remainingCollateralUsd.sub(infoWithSpread.remainingCollateralUsd)).to.eq(
        creditedNoSpread.sub(creditedWithSpread)
      );

      await setThresholdBetween(infoWithSpread.remainingCollateralUsd, infoNoSpread.remainingCollateralUsd);

      const [liquidatableNoSpread] = await reader.isPositionLiquidatable(
        dataStore.address,
        referralStorage.address,
        positionKey,
        ethUsdMarket,
        pricesNoSpread,
        false,
        true
      );
      const [liquidatableWithSpread] = await reader.isPositionLiquidatable(
        dataStore.address,
        referralStorage.address,
        positionKey,
        ethUsdMarket,
        pricesWithSpread,
        false,
        true
      );

      expect(liquidatableNoSpread).to.eq(false);
      expect(liquidatableWithSpread).to.eq(true);
    });

    it("discounts using the pnl token price, not the collateral token price", async () => {
      // collateral is USDC and has no spread, the pnl token WNT carries the spread
      await openLong(usdc, expandDecimals(5500, 6));
      const positionKey = (await getPositionKeys(dataStore, 0, 1))[0];

      const [, , infoNoSpread] = await reader.isPositionLiquidatable(
        dataStore.address,
        referralStorage.address,
        positionKey,
        ethUsdMarket,
        pricesNoSpread,
        false,
        true
      );
      const [, , infoWithSpread] = await reader.isPositionLiquidatable(
        dataStore.address,
        referralStorage.address,
        positionKey,
        ethUsdMarket,
        pricesWithSpread,
        false,
        true
      );

      expect(infoNoSpread.remainingCollateralUsd.sub(infoWithSpread.remainingCollateralUsd)).to.eq(
        creditedNoSpread.sub(creditedWithSpread)
      );

      await setThresholdBetween(infoWithSpread.remainingCollateralUsd, infoNoSpread.remainingCollateralUsd);

      const [liquidatableNoSpread] = await reader.isPositionLiquidatable(
        dataStore.address,
        referralStorage.address,
        positionKey,
        ethUsdMarket,
        pricesNoSpread,
        false,
        true
      );
      const [liquidatableWithSpread] = await reader.isPositionLiquidatable(
        dataStore.address,
        referralStorage.address,
        positionKey,
        ethUsdMarket,
        pricesWithSpread,
        false,
        true
      );

      expect(liquidatableNoSpread).to.eq(false);
      expect(liquidatableWithSpread).to.eq(true);
    });

    it("liquidates a profitable position only once the pnl is discounted", async () => {
      await openLong(wnt, expandDecimals(1, 18));
      const positionKey = (await getPositionKeys(dataStore, 0, 1))[0];

      const [, , infoNoSpread] = await reader.isPositionLiquidatable(
        dataStore.address,
        referralStorage.address,
        positionKey,
        ethUsdMarket,
        pricesNoSpread,
        false,
        true
      );
      const [, , infoWithSpread] = await reader.isPositionLiquidatable(
        dataStore.address,
        referralStorage.address,
        positionKey,
        ethUsdMarket,
        pricesWithSpreadForLiquidation,
        false,
        true
      );
      await setThresholdBetween(infoWithSpread.remainingCollateralUsd, infoNoSpread.remainingCollateralUsd);

      await mine();

      // without the spread the position is above the maintenance threshold
      await expect(
        executeLiquidation(fixture, {
          account: user1.address,
          market: ethUsdMarket,
          collateralToken: wnt,
          isLong: true,
          minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
          maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        })
      ).to.be.revertedWithCustomError(errorsContract, "PositionShouldNotBeLiquidated");

      // with the spread the realizable pnl drops below the threshold
      await executeLiquidation(fixture, {
        account: user1.address,
        market: ethUsdMarket,
        collateralToken: wnt,
        isLong: true,
        minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(7000, 4), expandDecimals(1, 6)],
      });

      expect(await getPositionCount(dataStore)).to.eq(0);
    });
  });

  describe("negative pending impact is counted in the liquidation check", () => {
    const sizeInUsd = decimalToFloat(100 * 1000);
    const priceMin = expandDecimals(5000, 12);
    const priceMax = expandDecimals(5100, 12);
    const prices = {
      indexTokenPrice: { min: priceMin, max: priceMax },
      longTokenPrice: { min: priceMin, max: priceMax },
      shortTokenPrice: { min: expandDecimals(1, 24), max: expandDecimals(1, 24) },
    };

    const maxNegativeImpactUsd = sizeInUsd.mul(decimalToFloat(5, 3)).div(FLOAT_PRECISION).mul(-1);

    const isLiquidatable = async (positionKey) => {
      const [liquidatable, , info] = await reader.isPositionLiquidatable(
        dataStore.address,
        referralStorage.address,
        positionKey,
        ethUsdMarket,
        prices,
        false,
        true
      );
      return { liquidatable, info };
    };

    const openLongWithNegativePendingImpact = async (impactFactor, acceptablePrice) => {
      await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), impactFactor);
      await dataStore.setUint(
        keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken, false),
        decimalToFloat(2, 0)
      );

      await handleOrder(fixture, {
        create: {
          account: user1,
          market: ethUsdMarket,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(5000, 6),
          sizeDeltaUsd: sizeInUsd,
          acceptablePrice,
          orderType: OrderType.MarketIncrease,
          isLong: true,
        },
        execute: {
          tokens: [wnt.address, usdc.address],
          prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
          precisions: [8, 18],
        },
      });

      await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), 0);
      await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), 0);
    };

    const getMaskedAndCountedInfo = async (positionKey) => {
      await dataStore.setUint(keys.maxPositionImpactFactorKey(ethUsdMarket.marketToken, false), 0);
      const { info: infoMasked } = await isLiquidatable(positionKey);

      await dataStore.setUint(keys.maxPositionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(5, 3));
      const { info: infoCounted } = await isLiquidatable(positionKey);

      return { infoMasked, infoCounted };
    };

    it("counts the pending impact below the cap and can trigger liquidation", async () => {
      await openLongWithNegativePendingImpact(decimalToFloat(1, 8), expandDecimals(5050, 12));

      const positionKey = (await getPositionKeys(dataStore, 0, 1))[0];
      const position = await reader.getPosition(dataStore.address, positionKey);
      expect(position.numbers.pendingImpactAmount).lt(0);

      const pendingImpactUsd = position.numbers.pendingImpactAmount.mul(priceMax);
      expect(pendingImpactUsd).gt(maxNegativeImpactUsd);

      const { infoMasked, infoCounted } = await getMaskedAndCountedInfo(positionKey);
      expect(infoCounted.remainingCollateralUsd.sub(infoMasked.remainingCollateralUsd)).to.eq(pendingImpactUsd);

      const target = infoMasked.remainingCollateralUsd.add(infoCounted.remainingCollateralUsd).div(2);
      await dataStore.setUint(
        keys.minCollateralFactorForLiquidationKey(ethUsdMarket.marketToken),
        target.mul(FLOAT_PRECISION).div(sizeInUsd)
      );

      await dataStore.setUint(keys.maxPositionImpactFactorKey(ethUsdMarket.marketToken, false), 0);
      const { liquidatable: liquidatableMasked } = await isLiquidatable(positionKey);

      await dataStore.setUint(keys.maxPositionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(5, 3));
      const { liquidatable: liquidatableCounted } = await isLiquidatable(positionKey);

      expect(liquidatableMasked).to.eq(false);
      expect(liquidatableCounted).to.eq(true);
    });

    it("caps the counted pending impact at the max negative factor", async () => {
      await openLongWithNegativePendingImpact(decimalToFloat(1, 6), expandDecimals(6000, 12));

      const positionKey = (await getPositionKeys(dataStore, 0, 1))[0];
      const position = await reader.getPosition(dataStore.address, positionKey);

      const pendingImpactUsd = position.numbers.pendingImpactAmount.mul(priceMax);
      expect(pendingImpactUsd).lt(maxNegativeImpactUsd);

      const { infoMasked, infoCounted } = await getMaskedAndCountedInfo(positionKey);
      expect(infoCounted.remainingCollateralUsd.sub(infoMasked.remainingCollateralUsd)).to.eq(maxNegativeImpactUsd);
    });
  });
});
