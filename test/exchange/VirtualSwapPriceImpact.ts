import { expect } from "chai";

import { usingResult } from "../../utils/use";
import { hashString } from "../../utils/hash";
import { deployFixture } from "../../utils/fixture";
import { getEventData } from "../../utils/event";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { getExecuteParams } from "../../utils/exchange";
import * as keys from "../../utils/keys";

describe("Exchange.VirtualSwapPriceImpact", () => {
  let fixture;
  let dataStore, ethUsdcMarket, ethUsdtMarket, wnt, usdt;

  const ethUsdVirtualMarketId = hashString("SPOT:ETH/USD");

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ dataStore, ethUsdtMarket, wnt, usdt } = fixture.contracts);

    ethUsdcMarket = fixture.contracts.ethUsdMarket;

    await dataStore.setBytes32(keys.virtualMarketIdKey(ethUsdcMarket.marketToken), ethUsdVirtualMarketId);
    await dataStore.setBytes32(keys.virtualMarketIdKey(ethUsdtMarket.marketToken), ethUsdVirtualMarketId);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdcMarket,
        longTokenAmount: expandDecimals(100, 18),
        shortTokenAmount: expandDecimals(500_000, 6),
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: ethUsdtMarket,
        longTokenAmount: expandDecimals(100, 18),
        shortTokenAmount: expandDecimals(500_000, 6),
      },
      execute: getExecuteParams(fixture, { tokens: [wnt, usdt] }),
    });
  });

  it("uses virtual inventory for price impact", async () => {
    // set positive price impact to 0.05% for every $100,000 of token imbalance
    // set negative price impact to 0.1% for every $100,000 of token imbalance
    // 0.05% => 0.0005
    // 0.0005 / 100,000 => 5 * (10 ** -9)
    // 0.1% => 0.001
    // 0.001 / 100,000 => 1 * (10 ** -8)
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdcMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdcMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdcMarket.marketToken), decimalToFloat(2, 0));

    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdtMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdtMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdtMarket.marketToken), decimalToFloat(2, 0));

    // check the base price impact for swapping WNT into the ethUsdcMarket
    // the ethUsdcMarket should have an imbalance of more WNT and less USDC after
    await usingResult(
      handleOrder(fixture, {
        create: {
          initialCollateralToken: wnt,
          initialCollateralDeltaAmount: expandDecimals(10, 18),
          acceptablePrice: 0,
          orderType: OrderType.MarketSwap,
          swapPath: [ethUsdcMarket.marketToken],
          gasUsageLabel: "orderHandler.createOrder",
        },
        execute: {
          gasUsageLabel: "orderHandler.executeOrder",
        },
      }),
      async ({ executeResult }) => {
        const { logs } = executeResult;
        const swapInfo = getEventData(logs, "SwapInfo");
        expect(swapInfo.priceImpactUsd).eq("-99999999999999998147004678330000"); // -100
      }
    );

    // the price impact for swapping WNT into the ethUsdtMarket should be higher
    // compared to the previous price impact due to the virtual price impact
    await usingResult(
      handleOrder(fixture, {
        create: {
          initialCollateralToken: wnt,
          initialCollateralDeltaAmount: expandDecimals(10, 18),
          acceptablePrice: 0,
          orderType: OrderType.MarketSwap,
          swapPath: [ethUsdtMarket.marketToken],
          gasUsageLabel: "orderHandler.createOrder",
        },
        execute: {
          gasUsageLabel: "orderHandler.executeOrder",
          ...getExecuteParams(fixture, { tokens: [wnt, usdt] }),
        },
      }),
      async ({ executeResult }) => {
        const { logs } = executeResult;
        const swapInfo = getEventData(logs, "SwapInfo");
        expect(swapInfo.priceImpactUsd).eq("-299599999999999993940174820850000"); // -299.6
      }
    );
  });

  it("price impact is positive if it improves the pool's balance, even if the virtual price impact might be negative", async () => {
    // set positive price impact to 0.05% for every $100,000 of token imbalance
    // set negative price impact to 0.1% for every $100,000 of token imbalance
    // 0.05% => 0.0005
    // 0.0005 / 100,000 => 5 * (10 ** -9)
    // 0.1% => 0.001
    // 0.001 / 100,000 => 1 * (10 ** -8)
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdcMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdcMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdcMarket.marketToken), decimalToFloat(2, 0));

    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdtMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdtMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdtMarket.marketToken), decimalToFloat(2, 0));

    // swap WNT into the ethUsdcMarket
    // the ethUsdcMarket should have an imbalance of more WNT and less USDC after
    await usingResult(
      handleOrder(fixture, {
        create: {
          initialCollateralToken: wnt,
          initialCollateralDeltaAmount: expandDecimals(10, 18),
          acceptablePrice: 0,
          orderType: OrderType.MarketSwap,
          swapPath: [ethUsdcMarket.marketToken],
          gasUsageLabel: "orderHandler.createOrder",
        },
        execute: {
          gasUsageLabel: "orderHandler.executeOrder",
        },
      }),
      async ({ executeResult }) => {
        const { logs } = executeResult;
        const swapInfo = getEventData(logs, "SwapInfo");
        expect(swapInfo.priceImpactUsd).eq("-99999999999999998147004678330000"); // -100
      }
    );

    // swap USDT into the ethUsdtMarket
    // the ethUsdtMarket should have an imbalance of more USDT and less WNT after
    await usingResult(
      handleOrder(fixture, {
        create: {
          initialCollateralToken: usdt,
          initialCollateralDeltaAmount: expandDecimals(50_000, 6),
          acceptablePrice: 0,
          orderType: OrderType.MarketSwap,
          swapPath: [ethUsdtMarket.marketToken],
          gasUsageLabel: "orderHandler.createOrder",
        },
        execute: {
          gasUsageLabel: "orderHandler.executeOrder",
          ...getExecuteParams(fixture, { tokens: [wnt, usdt] }),
        },
      }),
      async ({ executeResult }) => {
        const { logs } = executeResult;
        const swapInfo = getEventData(logs, "SwapInfo");
        expect(swapInfo.priceImpactUsd).eq("-99999999999999998147004678330000"); // -100
      }
    );

    // swap WNT into the ethUsdtMarket
    // the balance of the ethUsdtMarket should improve so the price impact should be positive
    await usingResult(
      handleOrder(fixture, {
        create: {
          initialCollateralToken: wnt,
          initialCollateralDeltaAmount: expandDecimals(10, 18),
          acceptablePrice: 0,
          orderType: OrderType.MarketSwap,
          swapPath: [ethUsdtMarket.marketToken],
          gasUsageLabel: "orderHandler.createOrder",
        },
        execute: {
          gasUsageLabel: "orderHandler.executeOrder",
          ...getExecuteParams(fixture, { tokens: [wnt, usdt] }),
        },
      }),
      async ({ executeResult }) => {
        const { logs } = executeResult;
        const swapInfo = getEventData(logs, "SwapInfo");
        expect(swapInfo.priceImpactUsd).eq("49799799999999999160447621630000"); // 49.7998
      }
    );
  });
});
