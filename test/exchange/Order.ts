import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { bigNumberify, expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, getOrderCount, getOrderKeys, createOrder, executeOrder, handleOrder } from "../../utils/order";
import { getPositionCount, getAccountPositionCount } from "../../utils/position";
import { hashString } from "../../utils/hash";
import * as keys from "../../utils/keys";

describe("Exchange.Order", () => {
  const { provider } = ethers;
  const { AddressZero, HashZero } = ethers.constants;

  let fixture;
  let user0, user1;
  let reader, dataStore, orderHandler, orderUtils, referralStorage, ethUsdMarket, wnt, usdc;
  let executionFee;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ reader, dataStore, orderHandler, orderUtils, referralStorage, ethUsdMarket, wnt, usdc } = fixture.contracts);
    ({ executionFee } = fixture.props);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });
  });

  it("createOrder validations", async () => {
    const params = {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: bigNumberify(0),
      swapPath: [ethUsdMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(5001, 12),
      executionFee: bigNumberify(0),
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
      gasUsageLabel: "createOrder",
    };

    const _createOrderFeatureDisabledKey = keys.createOrderFeatureDisabledKey(
      orderHandler.address,
      OrderType.MarketIncrease
    );

    await dataStore.setBool(_createOrderFeatureDisabledKey, true);

    await expect(createOrder(fixture, { ...params, sender: user0 }))
      .to.be.revertedWithCustomError(orderHandler, "Unauthorized")
      .withArgs(user0.address, "CONTROLLER");

    await expect(createOrder(fixture, params))
      .to.be.revertedWithCustomError(orderHandler, "DisabledFeature")
      .withArgs(_createOrderFeatureDisabledKey);

    await dataStore.setBool(_createOrderFeatureDisabledKey, false);

    await expect(createOrder(fixture, { ...params, account: { address: AddressZero } })).to.be.revertedWithCustomError(
      orderUtils,
      "EmptyAccount"
    );

    await expect(
      createOrder(fixture, {
        ...params,
        initialCollateralDeltaAmount: 0,
        executionFee: "1000",
        executionFeeToMint: "200",
      })
    ).to.be.revertedWithCustomError(orderUtils, "InsufficientWntAmountForExecutionFee");

    await expect(
      createOrder(fixture, {
        ...params,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: "2000",
        executionFee: "1000",
        executionFeeToMint: "200",
      })
    ).to.be.revertedWithCustomError(orderUtils, "InsufficientWntAmountForExecutionFee");

    // transaction should be reverted if orderType is invalid
    await expect(
      createOrder(fixture, {
        ...params,
        orderType: 100,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: "2000",
        executionFee: "1000",
        executionFeeToMint: "200",
      })
    ).to.be.reverted;
  });

  it("stores referral code", async () => {
    const referralCode = hashString("referralCode");

    const params = {
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(5001, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
      referralCode,
    };

    await referralStorage.connect(user1).registerCode(referralCode);

    expect(await referralStorage.traderReferralCodes(user0.address)).eq(HashZero);

    await createOrder(fixture, params);

    expect(await referralStorage.traderReferralCodes(user0.address)).eq(referralCode);
  });
});
