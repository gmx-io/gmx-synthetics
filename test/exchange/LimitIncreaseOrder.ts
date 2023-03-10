import { expect } from "chai";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, getOrderCount, createOrder, executeOrder, handleOrder } from "../../utils/order";
import { getPositionCount, getAccountPositionCount } from "../../utils/position";

describe("Exchange.LimitIncreaseOrder", () => {
  const { provider } = ethers;

  let fixture;
  let user0;
  let dataStore, oracle, increaseOrderUtils, ethUsdMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ dataStore, oracle, increaseOrderUtils, ethUsdMarket, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });
  });

  it("executeOrder validations", async () => {
    const params = {
      account: user0,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(1000),
      acceptablePrice: expandDecimals(5001, 12),
      triggerPrice: expandDecimals(5000, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: 0,
      orderType: OrderType.LimitIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await expect(
      handleOrder(fixture, {
        create: {
          ...params,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(5000, 6),
        },
        execute: {
          oracleBlockNumberOffset: 0,
        },
      })
    ).to.be.revertedWithCustomError(oracle, "EmptySecondaryPrice");

    const block1 = await provider.getBlock();
    const block0 = await provider.getBlock(block1.number - 1);

    await expect(
      handleOrder(fixture, {
        create: {
          ...params,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(5000, 6),
        },
        execute: {
          tokens: [wnt.address, wnt.address, usdc.address],
          minPrices: [expandDecimals(5005, 4), expandDecimals(4995, 4), expandDecimals(1, 6)],
          maxPrices: [expandDecimals(5005, 4), expandDecimals(4995, 4), expandDecimals(1, 6)],
          precisions: [8, 8, 18],
          oracleBlocks: [block0, block1, block1],
        },
      })
    ).to.be.revertedWithCustomError(increaseOrderUtils, "OracleBlockNumbersAreSmallerThanRequired");
  });

  it("executeOrder", async () => {
    expect(await getOrderCount(dataStore)).eq(0);

    const params = {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(5001, 12),
      triggerPrice: expandDecimals(5000, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.LimitIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await createOrder(fixture, params);

    expect(await getOrderCount(dataStore)).eq(1);
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getPositionCount(dataStore)).eq(0);

    await mine(5);

    const block1 = await provider.getBlock();
    const block0 = await provider.getBlock(block1.number - 1);

    await executeOrder(fixture, {
      tokens: [wnt.address, wnt.address, usdc.address],
      minPrices: [expandDecimals(5005, 4), expandDecimals(4995, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(5005, 4), expandDecimals(4995, 4), expandDecimals(1, 6)],
      precisions: [8, 8, 18],
      oracleBlocks: [block0, block1, block1],
      gasUsageLabel: "executeOrder",
    });

    expect(await getOrderCount(dataStore)).eq(0);
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    expect(await getPositionCount(dataStore)).eq(1);
  });
});
