import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { errorsContract } from "../../utils/error";
import { OrderType, getOrderCount, getOrderKeys, createTwapOrder } from "../../utils/order";

describe("Exchange.TwapOrder", () => {
  let fixture;
  let user0;
  let reader, dataStore, ethUsdMarket, wnt, usdc;
  let executionFee;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ reader, dataStore, ethUsdMarket, wnt, usdc } = fixture.contracts);
    ({ executionFee } = fixture.props);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });
  });

  it("createTwapOrder: fail to create twap order with invalid parameters", async () => {
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

    await expect(createTwapOrder(fixture, { ...params, twapCount: 0, interval: 300 })).to.be.revertedWithCustomError(
      errorsContract,
      "InvalidTwapCount"
    );
    await expect(createTwapOrder(fixture, { ...params, twapCount: 1, interval: 300 })).to.be.revertedWithCustomError(
      errorsContract,
      "InvalidTwapCount"
    );
    await expect(createTwapOrder(fixture, { ...params, twapCount: 2, interval: 0 })).to.be.revertedWithCustomError(
      errorsContract,
      "InvalidInterval"
    );
  });

  it("createTwapOrder: initial collateral amount is adjusted by the number of twap orders", async () => {
    const params = {
      market: ethUsdMarket,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: expandDecimals(100 * 1000, 6),
      swapPath: [ethUsdMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      triggerPrice: expandDecimals(5000, 12),
      acceptablePrice: expandDecimals(5001, 12),
      executionFee,
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.LimitIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
      initialCollateralToMint: expandDecimals(100 * 1000, 6), // less than the indicated initial collateral delta amount which is twapCount * initialCollateralDeltaAmount
      interval: 300,
    };
    const twapCount = 2;

    await createTwapOrder(fixture, { ...params, twapCount }); // passes since the initial collateral mint amount is determined by amount sent to the order vault
    const orderKeys = await getOrderKeys(dataStore, 0, twapCount);
    for (let i = 0; i < twapCount; i++) {
      const order = await reader.getOrder(dataStore.address, orderKeys[i]);
      expect(order.numbers.initialCollateralDeltaAmount).eq(expandDecimals(50 * 1000, 6));
    }
  });

  it("createTwapOrder: can create twap order with less than the indicated initial collateral", async () => {
    const params = {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(20, 18),
      swapPath: [ethUsdMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      triggerPrice: expandDecimals(5000, 12),
      acceptablePrice: expandDecimals(5001, 12),
      executionFee,
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.LimitIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
      initialCollateralToMint: expandDecimals(18, 18), // less than the indicated initial collateral delta amount which is twapCount * initialCollateralDeltaAmount
      interval: 300,
    };
    const twapCount = 2;

    await createTwapOrder(fixture, { ...params, twapCount }); // passes since the initial collateral mint amount is determined by amount sent to the order vault
    const orderKeys = await getOrderKeys(dataStore, 0, twapCount);
    for (let i = 0; i < twapCount; i++) {
      const order = await reader.getOrder(dataStore.address, orderKeys[i]);
      expect(order.numbers.initialCollateralDeltaAmount).eq(expandDecimals(9, 18));
    }
  });

  it("createTwapOrder: fail to create twap order if execution fee is not enough", async () => {
    const params = {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      swapPath: [ethUsdMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      triggerPrice: expandDecimals(5000, 12),
      acceptablePrice: expandDecimals(5001, 12),
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.LimitIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
      twapCount: 3,
      executionFee: expandDecimals(1, 15),
      executionFeeToMint: expandDecimals(1, 15),
      interval: 300,
    };
    await expect(createTwapOrder(fixture, params)).to.be.revertedWithCustomError(
      errorsContract,
      "InsufficientWntAmountForExecutionFee"
    );
    params.initialCollateralToken = usdc;
    await expect(createTwapOrder(fixture, params)).to.be.revertedWithCustomError(
      errorsContract,
      "InsufficientWntAmountForExecutionFee"
    );
  });

  it("createTwapOrder: from order handler", async () => {
    expect(await getOrderCount(dataStore)).eq(0);
    const twapCount = 10;
    const interval = 300; // interval of 5 minutes between orders
    const refTime = (await ethers.provider.getBlock()).timestamp;
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
      validFromTime: refTime,
      twapCount,
      interval,
    };

    await createTwapOrder(fixture, params);

    expect(await getOrderCount(dataStore)).eq(twapCount);

    const orderKeys = await getOrderKeys(dataStore, 0, twapCount);
    for (let i = 0; i < twapCount; i++) {
      const order = await reader.getOrder(dataStore.address, orderKeys[i]);
      expect(order.addresses.account).eq(user0.address);
      expect(order.addresses.market).eq(ethUsdMarket.marketToken);
      expect(order.addresses.initialCollateralToken).eq(wnt.address);
      expect(order.addresses.swapPath).eql([ethUsdMarket.marketToken]);
      expect(order.addresses.cancellationReceiver).eq(user0.address);
      expect(order.numbers.orderType).eq(OrderType.LimitIncrease);
      expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(200 * 1000));
      expect(order.numbers.initialCollateralDeltaAmount).eq(expandDecimals(10, 18));
      expect(order.numbers.acceptablePrice).eq(expandDecimals(5001, 12));
      expect(order.numbers.triggerPrice).eq(expandDecimals(5000, 12));
      expect(order.numbers.executionFee).eq(expandDecimals(1, 15));
      expect(order.numbers.minOutputAmount).eq(expandDecimals(50000, 6));
      expect(order.flags.isLong).eq(true);
      expect(order.flags.shouldUnwrapNativeToken).eq(false);
      expect(order.numbers.validFromTime).eq(refTime + i * interval);
    }
  });
});
