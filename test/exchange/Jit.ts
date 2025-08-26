import { expect } from "chai";

import { getGlvShiftCount, handleGlvDeposit } from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { decimalToFloat, expandDecimals } from "../../utils/math";
import * as keys from "../../utils/keys";
import { expectBalances } from "../../utils/validation";
import { getOrderCount, OrderType, createOrder } from "../../utils/order";
import { executeJitOrder } from "../../utils/jit";
import { errorsContract } from "../../utils/error";

describe("Jit", () => {
  let fixture;
  let user1;
  let dataStore, ethUsdMarket, solUsdMarket, ethUsdGlvAddress, wnt, executionFee, jitOrderHandler;
  let orderParams;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user1 } = fixture.accounts);

    ({ dataStore, ethUsdMarket, solUsdMarket, ethUsdGlvAddress, wnt, jitOrderHandler } = fixture.contracts);
    ({ executionFee } = fixture.props);

    await dataStore.setUint(keys.glvShiftMaxLossFactorKey(ethUsdGlvAddress), decimalToFloat(1, 2)); // 1%
    await dataStore.setUint(keys.reserveFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 0)); // 100%
    await dataStore.setUint(keys.reserveFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 0)); // 100%
    await dataStore.setUint(keys.reserveFactorKey(solUsdMarket.marketToken, true), decimalToFloat(1, 0)); // 100%
    await dataStore.setUint(keys.reserveFactorKey(solUsdMarket.marketToken, false), decimalToFloat(1, 0)); // 100%
    await dataStore.setUint(keys.openInterestReserveFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 0)); // 100%
    await dataStore.setUint(keys.openInterestReserveFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 0)); // 100%
    await dataStore.setUint(keys.openInterestReserveFactorKey(solUsdMarket.marketToken, true), decimalToFloat(1, 0)); // 100%
    await dataStore.setUint(keys.openInterestReserveFactorKey(solUsdMarket.marketToken, false), decimalToFloat(1, 0)); // 100%

    orderParams = {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 17), // 0.1 ETH
      swapPath: [ethUsdMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(6_000), // ETH market only has $5000 worth of WETH in the pool
      acceptablePrice: expandDecimals(5001, 12),
      executionFee,
      orderType: OrderType.MarketIncrease,
      minOutputAmount: 0,
      isLong: true,
      shouldUnwrapNativeToken: false,
      gasUsageLabel: "createOrder",
      cancellationReceiver: user1,
    };
  });

  it("shift liquidity and execute order", async () => {
    await handleGlvDeposit(fixture, {
      create: {
        glv: ethUsdGlvAddress,
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5_000, 6),
      },
    });

    await handleGlvDeposit(fixture, {
      create: {
        glv: ethUsdGlvAddress,
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5_000, 6),
        market: solUsdMarket,
      },
    });

    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(10_000, 18),
        [solUsdMarket.marketToken]: expandDecimals(10_000, 18),
      },
    });

    expect(await getOrderCount(dataStore)).eq(0);
    await createOrder(fixture, orderParams);

    expect(await getOrderCount(dataStore)).eq(1);

    expect(await getGlvShiftCount(dataStore)).eq(0);

    await executeJitOrder(fixture, {
      gasUsageLabel: "executeOrder",
      glvShifts: [
        {
          marketTokenAmount: expandDecimals(1, 18),
        },
      ],
      expectedCancellationReason: "InsufficientReserve",
    } as Parameters<typeof executeJitOrder>[1]);
    expect(await getOrderCount(dataStore)).eq(0);

    await createOrder(fixture, orderParams);

    await executeJitOrder(fixture, {
      gasUsageLabel: "executeOrder",
      glvShifts: [
        {
          marketTokenAmount: expandDecimals(1999, 18),
        },
      ],
    } as Parameters<typeof executeJitOrder>[1]);

    // order was executed
    expect(await getOrderCount(dataStore)).eq(0);
    expect(await getGlvShiftCount(dataStore)).eq(0);

    // and liquidity was shifted
    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(12_000, 18),
        [solUsdMarket.marketToken]: expandDecimals(8_000, 18),
      },
    });
  });

  describe("JitUnsupportedOrderType", () => {
    const orderTypeNames = Object.fromEntries(Object.entries(OrderType).map(([key, value]) => [value, key]));
    for (const [orderType, shouldRevert] of [
      [OrderType.MarketSwap, true],
      [OrderType.LimitSwap, true],
      [OrderType.MarketIncrease, false],
      [OrderType.LimitIncrease, false],
      [OrderType.MarketDecrease, true],
      [OrderType.LimitDecrease, true],
      [OrderType.StopLossDecrease, true],
      [OrderType.StopIncrease, false],
    ] as const) {
      it(`OrderType ${orderTypeNames[orderType]}`, async () => {
        await createOrder(fixture, {
          ...orderParams,
          market: [OrderType.LimitSwap, OrderType.MarketSwap].includes(orderType) ? undefined : ethUsdMarket,
          orderType,
        });

        if (shouldRevert) {
          await expect(
            executeJitOrder(fixture, {
              gasUsageLabel: "executeOrder",
              glvShifts: [],
            } as Parameters<typeof executeJitOrder>[1])
          ).to.be.revertedWithCustomError(errorsContract, "JitUnsupportedOrderType");
        } else {
          await expect(
            executeJitOrder(fixture, {
              gasUsageLabel: "executeOrder",
              glvShifts: [],
            } as Parameters<typeof executeJitOrder>[1])
          ).to.not.be.revertedWithCustomError(errorsContract, "JitUnsupportedOrderType");
        }
      });
    }
  });

  it("JitEmptyShiftParams", async () => {
    await createOrder(fixture, orderParams);
    await expect(
      executeJitOrder(fixture, {
        gasUsageLabel: "executeOrder",
        glvShifts: [],
      } as Parameters<typeof executeJitOrder>[1])
    ).to.be.revertedWithCustomError(errorsContract, "JitEmptyShiftParams");
  });

  it("Unauthorized", async () => {
    await expect(
      executeJitOrder(fixture, {
        gasUsageLabel: "executeOrder",
        orderKey: "0x0000000000000000000000000000000000000000000000000000000000000000",
        glvShifts: [],
        sender: user1,
      } as Parameters<typeof executeJitOrder>[1])
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");
  });

  it("DisabledFeature", async () => {
    await dataStore.setBool(keys.jitFeatureDisabledKey(jitOrderHandler.address), true);

    await expect(
      executeJitOrder(fixture, {
        gasUsageLabel: "executeOrder",
        orderKey: "0x0000000000000000000000000000000000000000000000000000000000000000",
        glvShifts: [],
      } as Parameters<typeof executeJitOrder>[1])
    ).to.be.revertedWithCustomError(errorsContract, "DisabledFeature");
  });

  it("JitInvalidToMarket", async () => {
    await createOrder(fixture, orderParams);
    await expect(
      executeJitOrder(fixture, {
        gasUsageLabel: "executeOrder",
        glvShifts: [
          {
            toMarket: solUsdMarket.marketToken,
          },
        ],
      } as Parameters<typeof executeJitOrder>[1])
    ).to.be.revertedWithCustomError(errorsContract, "JitInvalidToMarket");
  });

  it.skip("InsufficientExecutionGas");
});
