import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { getBalanceOf } from "../../utils/token";
import { getPoolAmount, getSwapImpactPoolAmount } from "../../utils/market";
import { getDepositCount, handleDeposit, createDeposit } from "../../utils/deposit";
import { getExecuteParams } from "../../utils/exchange";
import { createOrder, executeOrder, getOrderCount, handleOrder, OrderType } from "../../utils/order";
import { getAccountPositionCount } from "../../utils/position";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { getEventData } from "../../utils/event";
import { errorsContract } from "../../utils/error";

describe("Guardian.Swap", () => {
  const { provider } = ethers;

  let fixture;
  let user0, user1;
  let dataStore,
    depositVault,
    ethUsdMarket,
    ethUsdtMarket,
    ethUsdSpotOnlyMarket,
    ethUsdSingleTokenMarket,
    btcUsdMarket,
    wnt,
    usdc,
    usdt,
    wbtc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1 } = fixture.accounts);
    ({
      dataStore,
      depositVault,
      ethUsdMarket,
      ethUsdtMarket,
      ethUsdSpotOnlyMarket,
      ethUsdSingleTokenMarket,
      btcUsdMarket,
      wnt,
      usdc,
      usdt,
      wbtc,
    } = fixture.contracts);

    // initial liquidity for markets
    await handleDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(10 * 5000, 6),
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: ethUsdSingleTokenMarket,
        // long == short, only one is required
        longTokenAmount: expandDecimals(10 * 5000, 6),
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: ethUsdSpotOnlyMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(10 * 5000, 6),
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: ethUsdtMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(10 * 5000, 6),
      },
      execute: {
        ...getExecuteParams(fixture, { tokens: [wnt, usdt] }),
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: btcUsdMarket,
        longTokenAmount: expandDecimals(10, 8),
        shortTokenAmount: expandDecimals(10 * 50000, 6),
      },
      execute: {
        ...getExecuteParams(fixture, { tokens: [wbtc, usdc] }),
      },
    });
  });

  describe("Deposit", () => {
    it("fails on single token market swap path during deposit", async () => {
      // initial liquidity for markets
      await handleDeposit(fixture, {
        create: {
          market: ethUsdSingleTokenMarket,
          // long == short, only one is required
          longTokenAmount: expandDecimals(10 * 5000, 6),
        },
      });

      await expect(
        createDeposit(fixture, {
          longTokenAmount: expandDecimals(5000, 6),
          initialShortToken: usdc.address,
          shortTokenAmount: expandDecimals(1, 18),
          shortTokenSwapPath: [ethUsdSingleTokenMarket.marketToken],
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSwapMarket");
    });

    it("fails on duplicated market in a swap path during deposit", async () => {
      // duplicated swap
      await handleDeposit(fixture, {
        create: {
          initialLongToken: usdc.address,
          longTokenAmount: expandDecimals(9 * 5000, 6),
          initialShortToken: wbtc.address,
          shortTokenAmount: expandDecimals(10, 18),
          longTokenSwapPath: [ethUsdMarket.marketToken, ethUsdMarket.marketToken],
          shortTokenSwapPath: [ethUsdMarket.marketToken, ethUsdMarket.marketToken],
        },
        execute: {
          ...getExecuteParams(fixture, { tokens: [wnt, usdc, wbtc] }),
          expectedCancellationReason: "DuplicatedMarketInSwapPath",
        },
      });
    });

    it("multiswaps through a regular market during deposit", async () => {
      // multiswap deposit
      await handleDeposit(fixture, {
        create: {
          initialLongToken: wbtc.address,
          receiver: user1,
          longTokenAmount: expandDecimals(2, 7), // 0.2 BTC - $10000
          initialShortToken: usdt.address,
          shortTokenAmount: expandDecimals(10000, 6),
          longTokenSwapPath: [btcUsdMarket.marketToken, ethUsdMarket.marketToken],
          shortTokenSwapPath: [ethUsdtMarket.marketToken, ethUsdMarket.marketToken],
        },
        execute: {
          ...getExecuteParams(fixture, { tokens: [wnt, usdc, usdt, wbtc] }),
        },
      });

      expect(await getDepositCount(dataStore)).eq(0);
      expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq(expandDecimals(20_000, 18));

      expect(await wnt.balanceOf(depositVault.address)).eq(0);
      expect(await wbtc.balanceOf(depositVault.address)).eq(0);
      expect(await usdc.balanceOf(depositVault.address)).eq(0);
      expect(await usdt.balanceOf(depositVault.address)).eq(0);

      // verify that no unexpected tokens were sent during swap
      expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(12, 18));
      expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(60_000, 6));
      expect(await wbtc.balanceOf(ethUsdMarket.marketToken)).eq(0);
      expect(await usdt.balanceOf(ethUsdMarket.marketToken)).eq(0);

      // verify all pools changed by expected amount
      expect(await getPoolAmount(dataStore, btcUsdMarket.marketToken, wbtc.address)).eq(expandDecimals(102, 7));
      expect(await getPoolAmount(dataStore, btcUsdMarket.marketToken, usdc.address)).eq(expandDecimals(490_000, 6));

      expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(12, 18));
      expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(60_000, 6));

      expect(await getPoolAmount(dataStore, ethUsdtMarket.marketToken, wnt.address)).eq(expandDecimals(8, 18));
      expect(await getPoolAmount(dataStore, ethUsdtMarket.marketToken, usdt.address)).eq(expandDecimals(60_000, 6));

      // because no impact fees were set, expect impact pool to be empty
      expect(await getSwapImpactPoolAmount(dataStore, btcUsdMarket.marketToken, wbtc.address)).eq(0);
      expect(await getSwapImpactPoolAmount(dataStore, btcUsdMarket.marketToken, usdc.address)).eq(0);

      expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);
      expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0);

      expect(await getSwapImpactPoolAmount(dataStore, ethUsdtMarket.marketToken, wnt.address)).eq(0);
      expect(await getSwapImpactPoolAmount(dataStore, ethUsdtMarket.marketToken, usdt.address)).eq(0);
    });

    it("multiswaps through a spot only market during deposit", async () => {
      // multiswap deposit
      await handleDeposit(fixture, {
        create: {
          receiver: user1,
          initialLongToken: usdt.address,
          longTokenAmount: expandDecimals(5000, 6),
          shortTokenAmount: expandDecimals(5000, 6),
          longTokenSwapPath: [ethUsdtMarket.marketToken, ethUsdSpotOnlyMarket.marketToken, ethUsdMarket.marketToken],
        },
        execute: {
          ...getExecuteParams(fixture, { tokens: [wnt, usdc, usdt] }),
        },
      });

      expect(await getDepositCount(dataStore)).eq(0);
      expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq(expandDecimals(10_000, 18));

      expect(await wnt.balanceOf(depositVault.address)).eq(0);
      expect(await wbtc.balanceOf(depositVault.address)).eq(0);
      expect(await usdc.balanceOf(depositVault.address)).eq(0);
      expect(await usdt.balanceOf(depositVault.address)).eq(0);

      // verify that no unexpected tokens were sent during swap
      // last swap ended in the same pool, so the WNT was sent to it, receiving USDC collateral
      expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
      expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(12 * 5000, 6));
      expect(await wbtc.balanceOf(ethUsdMarket.marketToken)).eq(0);
      expect(await usdt.balanceOf(ethUsdMarket.marketToken)).eq(0);

      // verify all pools changed by expected amount
      expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18));
      expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(12 * 5000, 6));

      expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(expandDecimals(11, 18));
      expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(
        expandDecimals(9 * 5000, 6)
      );

      expect(await getPoolAmount(dataStore, ethUsdtMarket.marketToken, wnt.address)).eq(expandDecimals(9, 18));
      expect(await getPoolAmount(dataStore, ethUsdtMarket.marketToken, usdt.address)).eq(expandDecimals(11 * 5000, 6));

      // because no impact fees were set, expect impact pool to be empty
      expect(await getSwapImpactPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(0);
      expect(await getSwapImpactPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(0);

      expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);
      expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0);

      expect(await getSwapImpactPoolAmount(dataStore, ethUsdtMarket.marketToken, wnt.address)).eq(0);
      expect(await getSwapImpactPoolAmount(dataStore, ethUsdtMarket.marketToken, usdt.address)).eq(0);
    });
  });

  describe("Order", () => {
    it("fails on single token market swap path during order execution", async () => {
      // duplicated swap order
      await expect(
        createOrder(fixture, {
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(4000, 6),
          acceptablePrice: 0,
          orderType: OrderType.MarketSwap,
          swapPath: [ethUsdSingleTokenMarket.marketToken, ethUsdMarket.marketToken],
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSwapMarket");

      expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
      expect(await getOrderCount(dataStore)).eq(0);
    });

    it("fails on duplicated market in a swap path during order execution", async () => {
      // duplicated swap order
      await handleOrder(fixture, {
        create: {
          initialCollateralToken: wnt,
          initialCollateralDeltaAmount: expandDecimals(1, 18),
          acceptablePrice: 0,
          orderType: OrderType.MarketSwap,
          swapPath: [ethUsdMarket.marketToken, ethUsdMarket.marketToken],
        },
        execute: {
          // thrown in MarketUtils.validateSwapMarket(), if longToken == shortToken
          expectedCancellationReason: "DuplicatedMarketInSwapPath",
        },
      });

      expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
      expect(await getOrderCount(dataStore)).eq(0);
    });

    it("multiswaps through a regular market during order execution", async () => {
      // multiswap order
      await createOrder(fixture, {
        market: ethUsdMarket,
        initialCollateralToken: wbtc,
        initialCollateralDeltaAmount: expandDecimals(1, 7), // 0.1 BTC - $5000
        sizeDeltaUsd: decimalToFloat(20 * 1000), // 4x leverage
        acceptablePrice: expandDecimals(5000, 12),
        triggerPrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: expandDecimals(50000, 6),
        orderType: OrderType.LimitIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
        swapPath: [btcUsdMarket.marketToken, ethUsdMarket.marketToken],
      });

      await mine(5);

      const block1 = await provider.getBlock();
      const block0 = await provider.getBlock(block1.number - 1);

      const prices = [
        expandDecimals(4995, 4), // WNT
        expandDecimals(1, 6), // USDC
        expandDecimals(1, 6), // USDT
        expandDecimals(50000, 2), // WBTC
      ];

      await executeOrder(fixture, {
        tokens: [wnt.address, usdc.address, usdt.address, wbtc.address],
        minPrices: prices,
        maxPrices: prices,
        precisions: [8, 18, 18, 20],
        oracleBlocks: [block0, block0, block0, block0],
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("4995000000000000"); // $4995
          expect(positionIncreaseEvent.sizeDeltaUsd).eq("20000000000000000000000000000000000"); // 20,000 * 1e30
          expect(positionIncreaseEvent.sizeDeltaInTokens).eq("4004004004004004004"); // 4x leverage
          // (5000 * 1e18) / (4995) = 1001001001001001001 - we put $5000 worth of BTC and swap to $5000  worth of WNT, which is at $4995
          expect(positionIncreaseEvent.collateralAmount).eq("1001001001001001001");
        },
      });

      expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
      expect(await getOrderCount(dataStore)).eq(0);
      expect(await getDepositCount(dataStore)).eq(0);

      // verify that no unexpected tokens were sent during swap
      expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
      expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(55_000, 6));
      expect(await wbtc.balanceOf(ethUsdMarket.marketToken)).eq(0);
      expect(await usdt.balanceOf(ethUsdMarket.marketToken)).eq(0);

      // verify all pools changed by expected amount
      expect(await getPoolAmount(dataStore, btcUsdMarket.marketToken, wbtc.address)).eq(expandDecimals(101, 7)); // 10.1 BTC
      expect(await getPoolAmount(dataStore, btcUsdMarket.marketToken, usdc.address)).eq(expandDecimals(9.9 * 50000, 6));

      // 1001001001001001001 of the pool is reserved by the increase order position
      expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq("8998998998998998999");
      expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(55_000, 6));

      // because no impact fees were set, expect impact pool to be empty
      expect(await getSwapImpactPoolAmount(dataStore, btcUsdMarket.marketToken, wbtc.address)).eq(0);
      expect(await getSwapImpactPoolAmount(dataStore, btcUsdMarket.marketToken, usdc.address)).eq(0);

      expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);
      expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0);
    });

    it("multiswaps through a spot only market during order execution", async () => {
      // multiswap order
      await createOrder(fixture, {
        market: ethUsdMarket,
        initialCollateralToken: usdt,
        initialCollateralDeltaAmount: expandDecimals(5000, 6),
        sizeDeltaUsd: expandDecimals(20 * 1000, 30),
        acceptablePrice: expandDecimals(5001, 12),
        triggerPrice: expandDecimals(5000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: expandDecimals(50000, 6),
        orderType: OrderType.LimitIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
        swapPath: [ethUsdtMarket.marketToken, ethUsdSpotOnlyMarket.marketToken, ethUsdMarket.marketToken],
      });

      await mine(5);

      const block1 = await provider.getBlock();
      const block0 = await provider.getBlock(block1.number - 1);

      const prices = [
        expandDecimals(5000, 4), // WNT
        expandDecimals(1, 6), // USDC
        expandDecimals(1, 6), // USDT
      ];

      await executeOrder(fixture, {
        tokens: [wnt.address, usdc.address, usdt.address],
        minPrices: prices,
        maxPrices: prices,
        precisions: [8, 18, 18],
        oracleBlocks: [block0, block0, block0],
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("5000000000000000"); // $5000
          expect(positionIncreaseEvent.sizeDeltaUsd).eq("20000000000000000000000000000000000"); // 20,000 * 1e30
          expect(positionIncreaseEvent.sizeDeltaInTokens).eq("4000000000000000000");
          expect(positionIncreaseEvent.collateralAmount).eq("1000000000000000000");
        },
      });

      expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
      expect(await getOrderCount(dataStore)).eq(0);
      expect(await getDepositCount(dataStore)).eq(0);

      // verify that no unexpected tokens were sent during swap
      // last swap was in this market, so the amount didn't decrease
      expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
      expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(55_000, 6));
      expect(await usdt.balanceOf(ethUsdMarket.marketToken)).eq(0);

      // verify all pools changed by expected amount
      expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(9, 18));
      expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(55_000, 6));

      expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(expandDecimals(11, 18));
      expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(
        expandDecimals(45_000, 6)
      );

      expect(await getPoolAmount(dataStore, ethUsdtMarket.marketToken, wnt.address)).eq(expandDecimals(9, 18));
      expect(await getPoolAmount(dataStore, ethUsdtMarket.marketToken, usdt.address)).eq(expandDecimals(55_000, 6));

      // because no impact fees were set, expect impact pool to be empty
      expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);
      expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0);
    });
  });
});
