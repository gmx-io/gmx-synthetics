import { expect } from "chai";
import { ethers } from "hardhat";

import { handleGlvDeposit } from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { decimalToFloat, expandDecimals } from "../../utils/math";
import * as keys from "../../utils/keys";
import { expectBalances } from "../../utils/validation";
import { getOrderCount, OrderType, createOrder } from "../../utils/order";
import { shiftLiquidityAndExecuteOrder } from "../../utils/jit";

describe("Jit", () => {
  const { provider } = ethers;

  let fixture;
  let user1;
  let dataStore, ethUsdMarket, solUsdMarket, ethUsdGlvAddress, wnt, executionFee;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user1 } = fixture.accounts);

    ({ dataStore, ethUsdMarket, solUsdMarket, ethUsdGlvAddress, wnt } = fixture.contracts);
    ({ executionFee } = fixture.props);
  });

  it("shift liquidity and execute order", async () => {
    await handleGlvDeposit(fixture, {
      create: {
        glv: ethUsdGlvAddress,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(50_000, 6),
      },
    });

    await handleGlvDeposit(fixture, {
      create: {
        glv: ethUsdGlvAddress,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(50_000, 6),
        market: solUsdMarket,
      },
    });

    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(100_000, 18),
        [solUsdMarket.marketToken]: expandDecimals(100_000, 18),
      },
    });

    expect(await getOrderCount(dataStore)).eq(0);
    await dataStore.setUint(keys.MAX_DATA_LENGTH, 256);
    const dataList = [ethers.utils.formatBytes32String("customData")];
    const params = {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      swapPath: [ethUsdMarket.marketToken],
      orderType: OrderType.MarketIncrease,
      sizeDeltaUsd: decimalToFloat(2 * 1000),
      acceptablePrice: expandDecimals(5001, 12),
      executionFee,
      minOutputAmount: 0,
      isLong: true,
      shouldUnwrapNativeToken: false,
      gasUsageLabel: "createOrder",
      cancellationReceiver: user1,
      dataList,
    };

    await createOrder(fixture, params);

    expect(await getOrderCount(dataStore)).eq(1);

    await dataStore.setUint(keys.glvShiftMaxPriceImpactFactorKey(ethUsdGlvAddress), decimalToFloat(1, 2)); // 1%
    await shiftLiquidityAndExecuteOrder(fixture, {
      gasUsageLabel: "shiftLiquidityAndExecuteOrder",
      glvShift: {
        marketTokenAmount: expandDecimals(1000, 18),
      },
    } as Parameters<typeof shiftLiquidityAndExecuteOrder>[1]);

    // order was executed
    expect(await getOrderCount(dataStore)).eq(0);

    // and liquidity was shifted
    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(101_000, 18),
        [solUsdMarket.marketToken]: expandDecimals(99_000, 18),
      },
    });
  });
});
