import { expect } from "chai";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, getOrderCount, getOrderKeys, createOrder, executeOrder, handleOrder } from "../../utils/order";
import { getPositionCount, getAccountPositionCount } from "../../utils/position";
import { getEventData } from "../../utils/event";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("Exchange.LimitIncreaseOrder", () => {
  const { provider } = ethers;

  let fixture;
  let user0;
  let reader, dataStore, ethUsdMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ reader, dataStore, ethUsdMarket, wnt, usdc } = fixture.contracts);

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
          tokens: [wnt.address, usdc.address],
          minPrices: [expandDecimals(4995, 4), expandDecimals(1, 6)],
          maxPrices: [expandDecimals(4995, 4), expandDecimals(1, 6)],
          precisions: [8, 18],
          oracleBlocks: [block0, block1],
        },
      })
    ).to.be.revertedWithCustomError(errorsContract, "OracleBlockNumbersAreSmallerThanRequired");

    await expect(
      handleOrder(fixture, {
        create: {
          ...params,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(5000, 6),
        },
        execute: {
          tokens: [wnt.address, usdc.address],
          minPrices: [expandDecimals(5005, 4), expandDecimals(1, 6)],
          maxPrices: [expandDecimals(5005, 4), expandDecimals(1, 6)],
          precisions: [8, 18],
          oracleBlocks: [block0, block1],
        },
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "InvalidOrderPrices")
      .withArgs("5005000000000000", "5005000000000000", "5000000000000000", OrderType.LimitIncrease);

    await expect(
      handleOrder(fixture, {
        create: {
          ...params,
          initialCollateralToken: usdc,
          initialCollateralDeltaAmount: expandDecimals(5000, 6),
          isLong: false,
        },
        execute: {
          tokens: [wnt.address, usdc.address],
          minPrices: [expandDecimals(4995, 4), expandDecimals(1, 6)],
          maxPrices: [expandDecimals(4995, 4), expandDecimals(1, 6)],
          precisions: [8, 18],
          oracleBlocks: [block0, block1],
        },
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "InvalidOrderPrices")
      .withArgs("4995000000000000", "4995000000000000", "5000000000000000", OrderType.LimitIncrease);
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
      tokens: [wnt.address, usdc.address],
      minPrices: [expandDecimals(4995, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(4995, 4), expandDecimals(1, 6)],
      precisions: [8, 18],
      oracleBlocks: [block0, block1],
      gasUsageLabel: "executeOrder",
    });

    expect(await getOrderCount(dataStore)).eq(0);
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    expect(await getPositionCount(dataStore)).eq(1);
  });

  it("uses execution price with price impact", async () => {
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    const params = {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(5002, 12),
      triggerPrice: expandDecimals(5000, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.LimitIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await createOrder(fixture, params);

    await mine(5);

    const block1 = await provider.getBlock();
    const block0 = await provider.getBlock(block1.number - 1);

    const orderKeys = await getOrderKeys(dataStore, 0, 1);
    let order = await reader.getOrder(dataStore.address, orderKeys[0]);

    expect(order.flags.isFrozen).eq(false);

    await executeOrder(fixture, {
      tokens: [wnt.address, usdc.address],
      minPrices: [expandDecimals(4995, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(4995, 4), expandDecimals(1, 6)],
      precisions: [8, 18],
      oracleBlocks: [block0, block1],
      gasUsageLabel: "executeOrder",
      expectedFrozenReason: "OrderNotFulfillableAtAcceptablePrice",
    });

    order = await reader.getOrder(dataStore.address, orderKeys[0]);
    expect(order.flags.isFrozen).eq(true);

    // check that order is frozen
    await await executeOrder(fixture, {
      tokens: [wnt.address, usdc.address],
      minPrices: [expandDecimals(4980, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(4980, 4), expandDecimals(1, 6)],
      precisions: [8, 18],
      oracleBlocks: [block1, block1],
      gasUsageLabel: "executeOrder",
      afterExecution: ({ logs }) => {
        const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
        expect(positionIncreaseEvent.executionPrice).eq("4989979959919839"); // ~4989.97
      },
    });
  });
});
