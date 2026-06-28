import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { printGasUsage } from "../../utils/gas";
import { handleDeposit } from "../../utils/deposit";
import {
  OrderType,
  DecreasePositionSwapType,
  getOrderCount,
  getOrderKeys,
  getAutoCancelOrderKeys,
  createOrder,
  executeOrder,
  handleOrder,
} from "../../utils/order";
import { errorsContract } from "../../utils/error";
import { getPositionKey } from "../../utils/position";
import * as keys from "../../utils/keys";
import { parseLogs, getEventData } from "../../utils/event";

describe("Exchange.UpdateOrder", () => {
  const { provider } = ethers;

  let fixture;
  let user0, user1;
  let reader, dataStore, exchangeRouter, orderHandler, orderVault, ethUsdMarket, wnt, usdc;
  let executionFee;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ reader, dataStore, exchangeRouter, orderHandler, orderVault, ethUsdMarket, wnt, usdc } = fixture.contracts);
    ({ executionFee } = fixture.props);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });
  });

  it("updateOrder validations", async () => {
    expect(await getOrderCount(dataStore)).eq(0);
    const params = {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [ethUsdMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      triggerPrice: expandDecimals(5000, 12),
      acceptablePrice: expandDecimals(5001, 12),
      executionFee,
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await createOrder(fixture, params);

    expect(await getOrderCount(dataStore)).eq(1);

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    const _updateOrderFeatureDisabledKey = keys.updateOrderFeatureDisabledKey(
      orderHandler.address,
      OrderType.MarketIncrease
    );

    await dataStore.setBool(_updateOrderFeatureDisabledKey, true);

    const validFromTime = 100;

    await expect(
      exchangeRouter.connect(user1).updateOrder(
        orderKeys[0],
        decimalToFloat(250 * 1000),
        expandDecimals(4950, 12),
        expandDecimals(5050, 12),
        expandDecimals(52000, 6),
        validFromTime,
        DecreasePositionSwapType.NoSwap,
        false // autoCancel
      )
    )
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user1.address, "account for updateOrder");

    await expect(
      exchangeRouter.connect(user0).updateOrder(
        orderKeys[0],
        decimalToFloat(250 * 1000),
        expandDecimals(4950, 12),
        expandDecimals(5050, 12),
        expandDecimals(52000, 6),
        validFromTime,
        DecreasePositionSwapType.NoSwap,
        false // autoCancel
      )
    )
      .to.be.revertedWithCustomError(errorsContract, "DisabledFeature")
      .withArgs(_updateOrderFeatureDisabledKey);

    await dataStore.setBool(_updateOrderFeatureDisabledKey, false);

    await expect(
      exchangeRouter.connect(user0).updateOrder(
        orderKeys[0],
        decimalToFloat(250 * 1000),
        expandDecimals(4950, 12),
        expandDecimals(5050, 12),
        expandDecimals(52000, 6),
        validFromTime,
        DecreasePositionSwapType.NoSwap,
        false // autoCancel
      )
    )
      .to.be.revertedWithCustomError(errorsContract, "OrderNotUpdatable")
      .withArgs(OrderType.MarketIncrease);
  });

  it("updateOrder", async () => {
    expect(await getOrderCount(dataStore)).eq(0);
    const params = {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [ethUsdMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      triggerPrice: expandDecimals(5000, 12),
      acceptablePrice: expandDecimals(5001, 12),
      executionFee,
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.StopLossDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await createOrder(fixture, params);

    expect(await getOrderCount(dataStore)).eq(1);

    const orderKeys = await getOrderKeys(dataStore, 0, 1);
    let order = await reader.getOrder(dataStore.address, orderKeys[0]);

    expect(order.addresses.account).eq(user0.address);
    expect(order.addresses.market).eq(ethUsdMarket.marketToken);
    expect(order.addresses.initialCollateralToken).eq(wnt.address);
    expect(order.addresses.swapPath).eql([ethUsdMarket.marketToken]);
    expect(order.numbers.orderType).eq(OrderType.StopLossDecrease);
    expect(order.numbers.decreasePositionSwapType).eq(DecreasePositionSwapType.NoSwap);
    expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(200 * 1000));
    expect(order.numbers.initialCollateralDeltaAmount).eq(expandDecimals(10, 18));
    expect(order.numbers.acceptablePrice).eq(expandDecimals(5001, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(5000, 12));
    expect(order.numbers.executionFee).eq(expandDecimals(1, 15));
    expect(order.numbers.minOutputAmount).eq(expandDecimals(50000, 6));
    expect(order.flags.isLong).eq(true);
    expect(order.flags.shouldUnwrapNativeToken).eq(false);
    expect(order.flags.autoCancel).eq(false);

    const positionKey = getPositionKey(
      order.addresses.account,
      order.addresses.market,
      order.addresses.initialCollateralToken,
      order.flags.isLong
    );

    expect(await getAutoCancelOrderKeys(dataStore, positionKey, 0, 10)).eql([]);

    // mint wnt to top up execution fee
    await wnt.mint(orderVault.address, "700");

    const validFromTime = 100;

    const txn = await exchangeRouter.connect(user0).updateOrder(
      orderKeys[0],
      decimalToFloat(250 * 1000),
      expandDecimals(4950, 12),
      expandDecimals(5050, 12),
      expandDecimals(52000, 6),
      validFromTime,
      DecreasePositionSwapType.SwapPnlTokenToCollateralToken,
      true // autoCancel
    );

    await printGasUsage(provider, txn, "updateOrder");
    const txReceipt = await provider.getTransactionReceipt(txn.hash);
    const logs = parseLogs(fixture, txReceipt);
    const event = getEventData(logs, "OrderUpdated");
    expect(event.decreasePositionSwapType).eq(DecreasePositionSwapType.SwapPnlTokenToCollateralToken);

    order = await reader.getOrder(dataStore.address, orderKeys[0]);
    expect(order.addresses.account).eq(user0.address);
    expect(order.addresses.market).eq(ethUsdMarket.marketToken);
    expect(order.addresses.initialCollateralToken).eq(wnt.address);
    expect(order.addresses.swapPath).eql([ethUsdMarket.marketToken]);
    expect(order.numbers.orderType).eq(OrderType.StopLossDecrease);
    expect(order.numbers.decreasePositionSwapType).eq(DecreasePositionSwapType.SwapPnlTokenToCollateralToken);
    expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(250 * 1000));
    expect(order.numbers.initialCollateralDeltaAmount).eq(expandDecimals(10, 18));
    expect(order.numbers.acceptablePrice).eq(expandDecimals(4950, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(5050, 12));
    expect(order.numbers.executionFee).eq("1000000000000700");
    expect(order.numbers.minOutputAmount).eq(expandDecimals(52000, 6));
    expect(order.numbers.validFromTime).eq(validFromTime);
    expect(order.flags.isLong).eq(true);
    expect(order.flags.shouldUnwrapNativeToken).eq(false);
    expect(order.flags.autoCancel).eq(true);

    expect(await getAutoCancelOrderKeys(dataStore, positionKey, 0, 10)).eql([orderKeys[0]]);

    const newValidFromTime = 200;

    await exchangeRouter.connect(user0).updateOrder(
      orderKeys[0],
      decimalToFloat(250 * 1000),
      expandDecimals(4950, 12),
      expandDecimals(5050, 12),
      expandDecimals(52000, 6),
      newValidFromTime,
      DecreasePositionSwapType.NoSwap,
      false // autoCancel
    );

    order = await reader.getOrder(dataStore.address, orderKeys[0]);
    expect(order.flags.autoCancel).eq(false);
    expect(order.numbers.validFromTime).eq(newValidFromTime);
    expect(order.numbers.decreasePositionSwapType).eq(DecreasePositionSwapType.NoSwap);

    expect(await getAutoCancelOrderKeys(dataStore, positionKey, 0, 10)).eql([]);
  });

  it("executes the updated decreasePositionSwapType", async () => {
    const initialCollateralAmount = expandDecimals(50_000, 6);
    const positionSizeUsd = decimalToFloat(200_000);
    const entryPrice = decimalToFloat(5_000);
    const exitPrice = decimalToFloat(5_500);

    // PnL is $200k * ($5500 - $5000) / $5000 = $20k, paid in WNT with NoSwap.
    const expectedPnlUsd = positionSizeUsd.mul(exitPrice.sub(entryPrice)).div(entryPrice);
    const expectedWntPnlAmount = expectedPnlUsd.mul(expandDecimals(1, 18)).div(exitPrice);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(1_000_000, 6),
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        minOutputAmount: 0,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: initialCollateralAmount,
        swapPath: [],
        sizeDeltaUsd: positionSizeUsd,
        acceptablePrice: expandDecimals(5001, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      },
    });

    const createResult = await createOrder(fixture, {
      account: user0,
      receiver: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: 0,
      swapPath: [],
      sizeDeltaUsd: positionSizeUsd,
      triggerPrice: expandDecimals(5490, 12),
      acceptablePrice: expandDecimals(5499, 12),
      orderType: OrderType.LimitDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
      decreasePositionSwapType: DecreasePositionSwapType.SwapPnlTokenToCollateralToken,
    });

    let order = await reader.getOrder(dataStore.address, createResult.key);
    expect(order.numbers.decreasePositionSwapType).eq(DecreasePositionSwapType.SwapPnlTokenToCollateralToken);

    await exchangeRouter.connect(user0).updateOrder(
      createResult.key,
      positionSizeUsd,
      expandDecimals(5499, 12),
      expandDecimals(5490, 12),
      0,
      0,
      DecreasePositionSwapType.NoSwap,
      false // autoCancel
    );

    order = await reader.getOrder(dataStore.address, createResult.key);
    expect(order.numbers.decreasePositionSwapType).eq(DecreasePositionSwapType.NoSwap);

    expect(await usdc.balanceOf(user1.address)).eq(0);
    expect(await wnt.balanceOf(user1.address)).eq(0);

    await executeOrder(fixture, {
      orderKey: createResult.key,
      tokens: [wnt.address, usdc.address],
      minPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(5500, 4), expandDecimals(1, 6)],
      precisions: [8, 18],
    });

    expect(await usdc.balanceOf(user1.address)).eq(initialCollateralAmount);
    expect(await wnt.balanceOf(user1.address)).eq(expectedWntPnlAmount);
  });
});
