import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, getOrderCount, handleOrder } from "../../utils/order";
import { getAccountPositionCount } from "../../utils/position";
import { getPoolAmount } from "../../utils/market";
import { getExecuteParams } from "../../utils/exchange";
import { prices } from "../../utils/prices";
import { getEventData } from "../../utils/event";
import * as keys from "../../utils/keys";

describe("Exchange.SwapOrder", () => {
  let fixture;
  let user0;
  let dataStore, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(50_000, 6),
      },
    });
  });

  it("executeOrder", async () => {
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    await handleOrder(fixture, {
      create: {
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
        gasUsageLabel: "orderHandler.createOrder",
      },
      execute: {
        gasUsageLabel: "orderHandler.executeOrder",
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getOrderCount(dataStore)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq("50000000000");
  });

  it("executeOrder reverts when a normal swap adds tokenIn above maxPoolAmount", async () => {
    await dataStore.setUint(keys.maxPoolAmountKey(ethUsdMarket.marketToken, wnt.address), expandDecimals(1, 18));

    await handleOrder(fixture, {
      create: {
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
        gasUsageLabel: "orderHandler.createOrder",
      },
      execute: {
        gasUsageLabel: "orderHandler.executeOrder",
        expectedCancellationReason: "MaxPoolAmountExceeded",
      },
    });
  });

  it("executeOrder, spot only market", async () => {
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdSpotOnlyMarket,
        shortTokenAmount: expandDecimals(50000, 6),
      },
    });

    await handleOrder(fixture, {
      create: {
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdSpotOnlyMarket.marketToken],
        gasUsageLabel: "orderHandler.createOrder",
      },
      execute: {
        gasUsageLabel: "orderHandler.executeOrder",
      },
    });

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
    expect(await getOrderCount(dataStore)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq("50000000000");
  });

  it("price impact", async () => {
    // set positive price impact to 0.1% for every $1000 of token imbalance
    // set negative price impact to 0.2% for every $1000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 1000 => 1 * (10 ** -6)
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 6));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 6));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50_000, 6));

    expect(await dataStore.getUint(keys.swapImpactPoolAmountKey(ethUsdMarket.marketToken, wnt.address))).eq(0);
    expect(await dataStore.getUint(keys.swapImpactPoolAmountKey(ethUsdMarket.marketToken, usdc.address))).eq(0);

    // since the pool has 50,000 USDC, this order should have a positive price impact
    // but since there was no price impact for the initial deposit, the impact pool
    // should be empty and the priceImpactAmount should be zero
    await handleOrder(fixture, {
      create: {
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(5, 18),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
        gasUsageLabel: "orderHandler.createOrder",
      },
      execute: {
        gasUsageLabel: "orderHandler.executeOrder",
        afterExecution: ({ logs }) => {
          const swapInfoEvent = getEventData(logs, "SwapInfo");
          // since the pool balance is improved by 50,000 USD, the positive price impact should be
          //
          // 50,000 ^ 2 * (10 ** -6) => 2500
          expect(swapInfoEvent.priceImpactUsd).eq("2499999999999999953675116958000000"); // ~2500
          expect(swapInfoEvent.priceImpactAmount).eq(0);
          expect(swapInfoEvent.amountOut).eq(expandDecimals(25_000, 6));
        },
      },
    });

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(5, 18));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(25_000, 6));

    expect(await dataStore.getUint(keys.swapImpactPoolAmountKey(ethUsdMarket.marketToken, wnt.address))).eq(0);
    expect(await dataStore.getUint(keys.swapImpactPoolAmountKey(ethUsdMarket.marketToken, usdc.address))).eq(0);

    // since the pool is mostly balanced, this order should have a negative price impact
    await handleOrder(fixture, {
      create: {
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(1, 18),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
        gasUsageLabel: "orderHandler.createOrder",
      },
      execute: {
        gasUsageLabel: "orderHandler.executeOrder",
        afterExecution: ({ logs }) => {
          const swapInfoEvent = getEventData(logs, "SwapInfo");
          expect(swapInfoEvent.priceImpactUsd).eq("-199999999999999996247043298000000"); // -200
          expect(swapInfoEvent.priceImpactAmount).eq("-40000000000000000"); // -0.04 ETH, -200 USD
          expect(swapInfoEvent.amountOut).eq(expandDecimals(4800, 6));
        },
      },
    });

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq("5960000000000000000"); // 5.96 ETH, 29,800
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(20_200, 6));

    expect(await dataStore.getUint(keys.swapImpactPoolAmountKey(ethUsdMarket.marketToken, wnt.address))).eq(
      "40000000000000000"
    );
    expect(await dataStore.getUint(keys.swapImpactPoolAmountKey(ethUsdMarket.marketToken, usdc.address))).eq(0);

    // this order should have a positive price impact
    await handleOrder(fixture, {
      create: {
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(5000, 6),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
        gasUsageLabel: "orderHandler.createOrder",
      },
      execute: {
        gasUsageLabel: "orderHandler.executeOrder",
        afterExecution: ({ logs }) => {
          const swapInfoEvent = getEventData(logs, "SwapInfo");
          expect(swapInfoEvent.priceImpactUsd).eq("91839999999999998574976675000000"); // 91.84 USD
          expect(swapInfoEvent.priceImpactAmount).eq("18367999999999999"); // 0.018367999999999999 ETH, 91.84 USD
          expect(swapInfoEvent.amountOut).eq("1018367999999999999"); // 1.018367999999999999 ETH, 5091.84 USD
        },
      },
    });
  });

  it("positive and negative impact fees", async () => {
    // set positive swap fees to 0.05%
    // set negative swap fees to 0.5%
    await dataStore.setUint(keys.swapFeeFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 4));
    await dataStore.setUint(keys.swapFeeFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(5, 3));

    // set positive price impact to 0.1% for every $1000 of token imbalance
    // set negative price impact to 0.2% for every $1000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 1000 => 1 * (10 ** -6)
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 6));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 6));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50_000, 6));

    expect(await dataStore.getUint(keys.swapImpactPoolAmountKey(ethUsdMarket.marketToken, wnt.address))).eq(0);
    expect(await dataStore.getUint(keys.swapImpactPoolAmountKey(ethUsdMarket.marketToken, usdc.address))).eq(0);

    // since the pool has 50,000 USDC, this order should have a positive price impact
    // but since there was no price impact for the initial deposit, the impact pool
    // should be empty and the priceImpactAmount should be zero
    await handleOrder(fixture, {
      create: {
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(5, 18),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
        gasUsageLabel: "orderHandler.createOrder",
      },
      execute: {
        gasUsageLabel: "orderHandler.executeOrder",
        afterExecution: ({ logs }) => {
          const swapInfoEvent = getEventData(logs, "SwapInfo");
          // since the pool balance is improved by 50,000 USD, the positive price impact should be
          //
          // 50,000 ^ 2 * (10 ** -6) = 2500
          // fees: 0.05% * 25,000 = 12.5
          // 25,000 - 12.5 = 24,987.5
          expect(swapInfoEvent.priceImpactUsd).eq("2499999999999999953675116958000000"); // ~2500
          expect(swapInfoEvent.priceImpactAmount).eq(0);
          expect(swapInfoEvent.amountOut).eq("24987500000"); // 24,987.5
        },
      },
    });

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(5, 18));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq("25012500000"); // 25,012.5

    expect(await dataStore.getUint(keys.swapImpactPoolAmountKey(ethUsdMarket.marketToken, wnt.address))).eq(0);
    expect(await dataStore.getUint(keys.swapImpactPoolAmountKey(ethUsdMarket.marketToken, usdc.address))).eq(0);

    // since the pool is mostly balanced, this order should have a negative price impact
    await handleOrder(fixture, {
      create: {
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(1, 18),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
        gasUsageLabel: "orderHandler.createOrder",
      },
      execute: {
        gasUsageLabel: "orderHandler.executeOrder",
        afterExecution: ({ logs }) => {
          const swapInfoEvent = getEventData(logs, "SwapInfo");
          expect(swapInfoEvent.priceImpactUsd).eq("-199500156249999996338625122000000"); // -199.5
          expect(swapInfoEvent.priceImpactAmount).eq("-39900031250000000"); // -0.03990003125 ETH, -199.50015625 USD
          // fees: 5000 * 0.5% = 25 USD
          // 5000 - 25 - 199.50015625 = 4775.49984375 USD
          expect(swapInfoEvent.amountOut).eq("4775499843"); // 4775.499843
        },
      },
    });

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq("5960099968750000000"); // 5.96 ETH, 29,800
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq("20237000157"); // 20,237.000157

    expect(await dataStore.getUint(keys.swapImpactPoolAmountKey(ethUsdMarket.marketToken, wnt.address))).eq(
      "39900031250000000"
    );
    expect(await dataStore.getUint(keys.swapImpactPoolAmountKey(ethUsdMarket.marketToken, usdc.address))).eq(0);

    // this order should have a positive price impact
    await handleOrder(fixture, {
      create: {
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(5000, 6),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
        gasUsageLabel: "orderHandler.createOrder",
      },
      execute: {
        gasUsageLabel: "orderHandler.executeOrder",
        afterExecution: ({ logs }) => {
          const swapInfoEvent = getEventData(logs, "SwapInfo");
          expect(swapInfoEvent.priceImpactUsd).eq("91079461211532650093343730000000"); // 91.0794612115 USD
          expect(swapInfoEvent.priceImpactAmount).eq("18215892242306530"); // 0.01821589224230653 ETH, 91.0794612115 USD
          expect(swapInfoEvent.amountOut).eq("1017715892242306530"); // 1.017715892242306530 ETH, 5088.57946121 USD
        },
      },
    });
  });
});

describe("Exchange.SwapOrder maxPnl partial cure", () => {
  let fixture;
  let user0, user1;
  let reader, dataStore, ethUsdMarket, wnt, usdc, wethPriceFeed;

  // execution prices above the $5,000 entry, so the long position is in profit
  const wntPriceDouble = {
    contractName: "wnt",
    precision: 8,
    min: expandDecimals(10_000, 4),
    max: expandDecimals(10_000, 4),
  };
  const wntPriceFiveX = {
    contractName: "wnt",
    precision: 8,
    min: expandDecimals(25_000, 4),
    max: expandDecimals(25_000, 4),
  };

  const marketPricesAt = (wntUsd) => ({
    indexTokenPrice: { min: expandDecimals(wntUsd, 12), max: expandDecimals(wntUsd, 12) },
    longTokenPrice: { min: expandDecimals(wntUsd, 12), max: expandDecimals(wntUsd, 12) },
    shortTokenPrice: { min: expandDecimals(1, 24), max: expandDecimals(1, 24) },
  });

  const getLongPnlToPoolFactor = (wntUsd) =>
    reader.getPnlToPoolFactor(dataStore.address, ethUsdMarket.marketToken, marketPricesAt(wntUsd), true, true);

  const openLong = async (sizeUsd, collateralWnt) => {
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(collateralWnt, 18),
        sizeDeltaUsd: decimalToFloat(sizeUsd),
        acceptablePrice: expandDecimals(5005, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
    });
  };

  const setLongPnlFactorCaps = async (factor) => {
    await dataStore.setUint(
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_DEPOSITS, ethUsdMarket.marketToken, true),
      factor
    );
    await dataStore.setUint(
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, ethUsdMarket.marketToken, true),
      factor
    );
  };

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ reader, dataStore, ethUsdMarket, wnt, usdc, wethPriceFeed } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(200, 18), // 200 WNT, $1,000,000 at $5,000
        shortTokenAmount: expandDecimals(2_000_000, 6),
      },
    });
  });

  it("allows a swap that strictly improves an already-exceeded side", async () => {
    await openLong(400_000, 40);
    await setLongPnlFactorCaps(decimalToFloat(10, 2)); // 10%
    await wethPriceFeed.setAnswer(expandDecimals(10_000, 8));

    // at $10,000 the long pnl is ~$400,000 against a ~$2,000,000 long pool => ~20% > 10% cap
    const factorBefore = await getLongPnlToPoolFactor(10_000);
    expect(factorBefore).to.gt(decimalToFloat(10, 2));

    expect(await usdc.balanceOf(user1.address)).eq(0);

    // WNT -> USDC adds WNT to the long pool, strictly reducing the long pnlToPoolFactor
    await handleOrder(fixture, {
      create: {
        account: user1,
        receiver: user1,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
      },
      execute: getExecuteParams(fixture, { prices: [wntPriceDouble, prices.usdc] }),
    });

    expect(await usdc.balanceOf(user1.address)).to.gt(0);

    // the long pnlToPoolFactor decreased but is still above the cap: a partial cure
    const factorAfter = await getLongPnlToPoolFactor(10_000);
    expect(factorAfter).to.lt(factorBefore);
    expect(factorAfter).to.gt(decimalToFloat(10, 2));
  });

  it("reverts a swap that worsens an already-exceeded side", async () => {
    await openLong(400_000, 40);
    await setLongPnlFactorCaps(decimalToFloat(10, 2));
    await wethPriceFeed.setAnswer(expandDecimals(10_000, 8));

    expect(await getLongPnlToPoolFactor(10_000)).to.gt(decimalToFloat(10, 2));

    // USDC -> WNT removes WNT from the long pool, raising the already-exceeded long factor
    await handleOrder(fixture, {
      create: {
        account: user1,
        receiver: user1,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(100_000, 6),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [wntPriceDouble, prices.usdc] }),
        expectedCancellationReason: "PnlFactorExceededForLongs",
      },
    });
  });

  it("allows swaps when the side is within the max pnl cap", async () => {
    await openLong(400_000, 40);
    await wethPriceFeed.setAnswer(expandDecimals(10_000, 8));
    // keep the default caps (deposits 60%, withdrawals 30%); ~20% factor is within cap
    expect(await getLongPnlToPoolFactor(10_000)).to.lt(decimalToFloat(30, 2));

    expect(await usdc.balanceOf(user1.address)).eq(0);

    await handleOrder(fixture, {
      create: {
        account: user1,
        receiver: user1,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
      },
      execute: getExecuteParams(fixture, { prices: [wntPriceDouble, prices.usdc] }),
    });

    expect(await usdc.balanceOf(user1.address)).to.gt(0);
  });

  it("reverts a swap that pushes a within-cap side over the max pnl cap", async () => {
    await openLong(350_000, 70);
    await wethPriceFeed.setAnswer(expandDecimals(25_000, 8));
    // at $25,000 the long pnl is ~$1,400,000 against a ~$5,000,000 long pool => ~28%, within the 30% cap
    await dataStore.setUint(
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, ethUsdMarket.marketToken, true),
      decimalToFloat(30, 2)
    );

    const factorBefore = await getLongPnlToPoolFactor(25_000);
    expect(factorBefore).to.gt(decimalToFloat(25, 2));
    expect(factorBefore).to.lt(decimalToFloat(30, 2));

    // a large USDC -> WNT swap removes enough WNT to push the long factor above 30%
    await handleOrder(fixture, {
      create: {
        account: user1,
        receiver: user1,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(500_000, 6),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [wntPriceFiveX, prices.usdc] }),
        expectedCancellationReason: "PnlFactorExceededForLongs",
      },
    });
  });
});
