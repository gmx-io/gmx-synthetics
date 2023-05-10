import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, getOrderCount, getOrderKeys, createOrder, handleOrder } from "../../utils/order";
import { getAccountPositionCount } from "../../utils/position";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("Exchange.MarketDecreaseOrder", () => {
  const { provider } = ethers;
  let fixture;
  let user0;
  let dataStore, reader, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ dataStore, reader, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });
  });

  // it("createOrder", async () => {
  //   await createOrder(fixture, {
  //     market: ethUsdMarket,
  //     initialCollateralToken: wnt,
  //     initialCollateralDeltaAmount: expandDecimals(5, 18),
  //     swapPath: [ethUsdMarket.marketToken],
  //     orderType: OrderType.MarketDecrease,
  //     sizeDeltaUsd: decimalToFloat(200 * 1000),
  //     acceptablePrice: expandDecimals(5001, 12),
  //     executionFee: expandDecimals(1, 15),
  //     minOutputAmount: expandDecimals(50000, 6),
  //     isLong: true,
  //     gasUsageLabel: "orderHandler.createOrder",
  //   });
  //
  //   const orderKeys = await getOrderKeys(dataStore, 0, 1);
  //   const order = await reader.getOrder(dataStore.address, orderKeys[0]);
  //
  //   expect(order.addresses.account).eq(user0.address);
  //   expect(order.addresses.market).eq(ethUsdMarket.marketToken);
  //   expect(order.addresses.initialCollateralToken).eq(wnt.address);
  //   expect(order.addresses.swapPath).eql([ethUsdMarket.marketToken]);
  //   expect(order.numbers.orderType).eq(OrderType.MarketDecrease);
  //   expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(200 * 1000));
  //   expect(order.numbers.initialCollateralDeltaAmount).eq(expandDecimals(5, 18));
  //   expect(order.numbers.acceptablePrice).eq(expandDecimals(5001, 12));
  //   expect(order.numbers.executionFee).eq(expandDecimals(1, 15));
  //   expect(order.numbers.minOutputAmount).eq(expandDecimals(50000, 6));
  //   expect(order.flags.isLong).eq(true);
  //   expect(order.flags.shouldUnwrapNativeToken).eq(false);
  // });

  it("executeOrder validations", async () => {
    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5001, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
    });

    const params = {
      account: user0,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(1000),
      acceptablePrice: expandDecimals(4995, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: 0,
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await expect(
      createOrder(fixture, {
        ...params,
        market: ethUsdSpotOnlyMarket,
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "InvalidPositionMarket")
      .withArgs(ethUsdSpotOnlyMarket.marketToken);

    await handleOrder(fixture, {
      create: {
        ...params,
        isLong: false,
      },
      execute: {
        expectedCancellationReason: "EmptyPosition",
      },
    });

    const block1 = await provider.getBlock();
    const block0 = await provider.getBlock(block1.number - 1);

    await expect(
      handleOrder(fixture, {
        create: {
          ...params,
        },
        execute: {
          tokens: [wnt.address, usdc.address],
          minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
          maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
          precisions: [8, 18],
          oracleBlocks: [block0, block1],
        },
      })
    ).to.be.revertedWithCustomError(errorsContract, "OracleBlockNumberNotWithinRange");
  });

  // it("executeOrder", async () => {
  //   expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
  //
  //   await handleOrder(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       initialCollateralToken: wnt,
  //       initialCollateralDeltaAmount: expandDecimals(10, 18),
  //       sizeDeltaUsd: decimalToFloat(200 * 1000),
  //       acceptablePrice: expandDecimals(5001, 12),
  //       orderType: OrderType.MarketIncrease,
  //       isLong: true,
  //     },
  //   });
  //
  //   expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
  //   expect(await getOrderCount(dataStore)).eq(0);
  //
  //   await handleOrder(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       initialCollateralToken: wnt,
  //       initialCollateralDeltaAmount: 0,
  //       sizeDeltaUsd: decimalToFloat(200 * 1000),
  //       acceptablePrice: 0,
  //       orderType: OrderType.MarketDecrease,
  //       isLong: true,
  //       gasUsageLabel: "orderHandler.createOrder",
  //     },
  //     execute: {
  //       gasUsageLabel: "orderHandler.executeOrder",
  //     },
  //   });
  //
  //   expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
  //   expect(await getOrderCount(dataStore)).eq(0);
  // });
  //
  // it("executeOrder with price impact", async () => {
  //   // set price impact to 0.1% for every $50,000 of token imbalance
  //   // 0.1% => 0.001
  //   // 0.001 / 50,000 => 2 * (10 ** -8)
  //   await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(2, 8));
  //   await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
  //   await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));
  //
  //   expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
  //
  //   await handleOrder(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       initialCollateralToken: wnt,
  //       initialCollateralDeltaAmount: expandDecimals(10, 18),
  //       sizeDeltaUsd: decimalToFloat(200 * 1000),
  //       acceptablePrice: expandDecimals(5050, 12),
  //       orderType: OrderType.MarketIncrease,
  //       isLong: true,
  //     },
  //   });
  //
  //   expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
  //   expect(await getOrderCount(dataStore)).eq(0);
  //
  //   await handleOrder(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       initialCollateralToken: wnt,
  //       initialCollateralDeltaAmount: 0,
  //       sizeDeltaUsd: decimalToFloat(200 * 1000),
  //       acceptablePrice: expandDecimals(4950, 12),
  //       orderType: OrderType.MarketDecrease,
  //       isLong: true,
  //       gasUsageLabel: "orderHandler.createOrder",
  //     },
  //     execute: {
  //       gasUsageLabel: "orderHandler.executeOrder",
  //     },
  //   });
  //
  //   expect(await getAccountPositionCount(dataStore, user0.address)).eq(0);
  //   expect(await getOrderCount(dataStore)).eq(0);
  // });
});
