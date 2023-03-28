import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { printGasUsage } from "../../utils/gas";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, getOrderCount, getOrderKeys, createOrder } from "../../utils/order";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("Exchange.UpdateOrder", () => {
  const { provider } = ethers;

  let fixture;
  let user0, user1;
  let reader, dataStore, exchangeRouter, orderHandler, orderVault, ethUsdMarket, wnt;
  let executionFee;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ reader, dataStore, exchangeRouter, orderHandler, orderVault, ethUsdMarket, wnt } = fixture.contracts);
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

    await expect(
      exchangeRouter
        .connect(user1)
        .updateOrder(
          orderKeys[0],
          decimalToFloat(250 * 1000),
          expandDecimals(4950, 12),
          expandDecimals(5050, 12),
          expandDecimals(52000, 6)
        )
    )
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user1.address, "account for updateOrder");

    await expect(
      exchangeRouter
        .connect(user0)
        .updateOrder(
          orderKeys[0],
          decimalToFloat(250 * 1000),
          expandDecimals(4950, 12),
          expandDecimals(5050, 12),
          expandDecimals(52000, 6)
        )
    )
      .to.be.revertedWithCustomError(errorsContract, "DisabledFeature")
      .withArgs(_updateOrderFeatureDisabledKey);

    await dataStore.setBool(_updateOrderFeatureDisabledKey, false);

    await expect(
      exchangeRouter
        .connect(user0)
        .updateOrder(
          orderKeys[0],
          decimalToFloat(250 * 1000),
          expandDecimals(4950, 12),
          expandDecimals(5050, 12),
          expandDecimals(52000, 6)
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
      orderType: OrderType.LimitIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await createOrder(fixture, params);

    expect(await getOrderCount(dataStore)).eq(1);

    let block = await provider.getBlock();

    const orderKeys = await getOrderKeys(dataStore, 0, 1);
    let order = await reader.getOrder(dataStore.address, orderKeys[0]);

    expect(order.addresses.account).eq(user0.address);
    expect(order.addresses.market).eq(ethUsdMarket.marketToken);
    expect(order.addresses.initialCollateralToken).eq(wnt.address);
    expect(order.addresses.swapPath).eql([ethUsdMarket.marketToken]);
    expect(order.numbers.orderType).eq(OrderType.LimitIncrease);
    expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(200 * 1000));
    expect(order.numbers.initialCollateralDeltaAmount).eq(expandDecimals(10, 18));
    expect(order.numbers.acceptablePrice).eq(expandDecimals(5001, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(5000, 12));
    expect(order.numbers.executionFee).eq(expandDecimals(1, 15));
    expect(order.numbers.minOutputAmount).eq(expandDecimals(50000, 6));
    expect(order.numbers.updatedAtBlock).eq(block.number);
    expect(order.flags.isLong).eq(true);
    expect(order.flags.shouldUnwrapNativeToken).eq(false);

    // mint wnt to top up execution fee
    await wnt.mint(orderVault.address, "700");

    const txn = await exchangeRouter
      .connect(user0)
      .updateOrder(
        orderKeys[0],
        decimalToFloat(250 * 1000),
        expandDecimals(4950, 12),
        expandDecimals(5050, 12),
        expandDecimals(52000, 6)
      );
    block = await provider.getBlock();

    await printGasUsage(provider, txn, "updateOrder");

    order = await reader.getOrder(dataStore.address, orderKeys[0]);
    expect(order.addresses.account).eq(user0.address);
    expect(order.addresses.market).eq(ethUsdMarket.marketToken);
    expect(order.addresses.initialCollateralToken).eq(wnt.address);
    expect(order.addresses.swapPath).eql([ethUsdMarket.marketToken]);
    expect(order.numbers.orderType).eq(OrderType.LimitIncrease);
    expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(250 * 1000));
    expect(order.numbers.initialCollateralDeltaAmount).eq(expandDecimals(10, 18));
    expect(order.numbers.acceptablePrice).eq(expandDecimals(4950, 12));
    expect(order.numbers.triggerPrice).eq(expandDecimals(5050, 12));
    expect(order.numbers.executionFee).eq("1000000000000700");
    expect(order.numbers.minOutputAmount).eq(expandDecimals(52000, 6));
    expect(order.numbers.updatedAtBlock).eq(block.number);
    expect(order.flags.isLong).eq(true);
    expect(order.flags.shouldUnwrapNativeToken).eq(false);
  });
});
