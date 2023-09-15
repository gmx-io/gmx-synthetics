import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { hashString } from "../../utils/hash";
import { errorsContract } from "../../utils/error";
import { getSubaccounts } from "../../utils/subaccount";
import { OrderType, DecreasePositionSwapType, getOrderKeys } from "../../utils/order";
import { createAccount } from "../../utils/account";
import * as keys from "../../utils/keys";

describe("SubaccountRouter", () => {
  let fixture;
  let user0, user1, user2;
  let reader, dataStore, router, subaccountRouter, orderVault, ethUsdMarket, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    ({ reader, dataStore, router, subaccountRouter, orderVault, ethUsdMarket, usdc } = fixture.contracts);
  });

  it("addSubaccount", async () => {
    expect(await getSubaccounts(dataStore, user0.address, 0, 10)).eql([]);
    await subaccountRouter.connect(user0).addSubaccount(user1.address);
    expect(await getSubaccounts(dataStore, user0.address, 0, 10)).eql([user1.address]);
  });

  it("removeSubaccount", async () => {
    expect(await getSubaccounts(dataStore, user0.address, 0, 10)).eql([]);
    await subaccountRouter.connect(user0).addSubaccount(user1.address);
    expect(await getSubaccounts(dataStore, user0.address, 0, 10)).eql([user1.address]);
    await subaccountRouter.connect(user0).removeSubaccount(user2.address);
    expect(await getSubaccounts(dataStore, user0.address, 0, 10)).eql([user1.address]);
    await subaccountRouter.connect(user0).removeSubaccount(user1.address);
    expect(await getSubaccounts(dataStore, user0.address, 0, 10)).eql([]);
  });

  it("setMaxAllowedSubaccountActionCount", async () => {
    expect(
      await dataStore.getUint(
        keys.maxAllowedSubaccountActionCountKey(user0.address, user1.address, keys.SUBACCOUNT_CREATE_ORDER_ACTION)
      )
    ).eq(0);

    await subaccountRouter
      .connect(user0)
      .setMaxAllowedSubaccountActionCount(user1.address, keys.SUBACCOUNT_CREATE_ORDER_ACTION, 21);

    expect(
      await dataStore.getUint(
        keys.maxAllowedSubaccountActionCountKey(user0.address, user1.address, keys.SUBACCOUNT_CREATE_ORDER_ACTION)
      )
    ).eq(21);
  });

  it("setSubaccountAutoTopUpAmount", async () => {
    expect(await dataStore.getUint(keys.subaccountAutoTopUpAmountKey(user0.address, user1.address))).eq(0);

    await subaccountRouter.connect(user0).setSubaccountAutoTopUpAmount(user1.address, 101);

    expect(await dataStore.getUint(keys.subaccountAutoTopUpAmountKey(user0.address, user1.address))).eq(101);
  });

  it("sets up subaccount", async () => {
    const subaccount = createAccount();

    expect(await subaccount.getBalance()).eq(0);
    expect(await getSubaccounts(dataStore, user0.address, 0, 10)).eql([]);
    expect(
      await dataStore.getUint(
        keys.maxAllowedSubaccountActionCountKey(user0.address, user1.address, keys.SUBACCOUNT_CREATE_ORDER_ACTION)
      )
    ).eq(0);

    expect(await dataStore.getUint(keys.subaccountAutoTopUpAmountKey(user0.address, user1.address))).eq(0);

    await subaccountRouter
      .connect(user0)
      .multicall(
        [
          subaccountRouter.interface.encodeFunctionData("sendNativeToken", [subaccount.address, expandDecimals(1, 18)]),
          subaccountRouter.interface.encodeFunctionData("addSubaccount", [subaccount.address]),
          subaccountRouter.interface.encodeFunctionData("setMaxAllowedSubaccountActionCount", [
            subaccount.address,
            keys.SUBACCOUNT_CREATE_ORDER_ACTION,
            20,
          ]),
          subaccountRouter.interface.encodeFunctionData("setSubaccountAutoTopUpAmount", [
            subaccount.address,
            expandDecimals(1, 17),
          ]),
        ],
        { value: expandDecimals(1, 18) }
      );

    expect(await subaccount.getBalance()).eq(expandDecimals(1, 18));
    expect(await getSubaccounts(dataStore, user0.address, 0, 10)).eql([subaccount.address]);
    expect(
      await dataStore.getUint(
        keys.maxAllowedSubaccountActionCountKey(user0.address, subaccount.address, keys.SUBACCOUNT_CREATE_ORDER_ACTION)
      )
    ).eq(20);
    expect(await dataStore.getUint(keys.subaccountAutoTopUpAmountKey(user0.address, subaccount.address))).eq(
      expandDecimals(1, 17)
    );

    await subaccountRouter.connect(user0).removeSubaccount(subaccount.address);

    await subaccountRouter
      .connect(user0)
      .setMaxAllowedSubaccountActionCount(subaccount.address, keys.SUBACCOUNT_CREATE_ORDER_ACTION, 0);

    const referralCode = hashString("referralCode");
    const params = {
      addresses: {
        receiver: subaccount.address,
        callbackContract: user2.address,
        uiFeeReceiver: user1.address,
        market: ethUsdMarket.marketToken,
        initialCollateralToken: usdc.address,
        swapPath: [ethUsdMarket.marketToken],
      },
      numbers: {
        sizeDeltaUsd: decimalToFloat(1000),
        initialCollateralDeltaAmount: expandDecimals(100, 6),
        triggerPrice: decimalToFloat(4800),
        acceptablePrice: decimalToFloat(4900),
        executionFee: expandDecimals(1, 17),
        callbackGasLimit: "200000",
        minOutputAmount: 700,
      },
      orderType: OrderType.Liquidation,
      decreasePositionSwapType: DecreasePositionSwapType.SwapCollateralTokenToPnlToken,
      isLong: true,
      shouldUnwrapNativeToken: true,
      referralCode,
    };

    await expect(subaccountRouter.connect(subaccount).createOrderForAccount(user0.address, { ...params }))
      .to.be.revertedWithCustomError(errorsContract, "SubaccountNotAuthorized")
      .withArgs(user0.address, subaccount.address);

    await subaccountRouter.connect(user0).addSubaccount(subaccount.address);

    await expect(subaccountRouter.connect(subaccount).createOrderForAccount(user0.address, { ...params }))
      .to.be.revertedWithCustomError(errorsContract, "InvalidReceiverForSubaccountOrder")
      .withArgs(subaccount.address, user0.address);

    await expect(
      subaccountRouter.connect(subaccount).createOrderForAccount(user0.address, {
        ...params,
        addresses: { ...params.addresses, receiver: user0.address },
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "MaxSubaccountActionCountExceeded")
      .withArgs(user0.address, subaccount.address, 1, 0);

    await subaccountRouter
      .connect(user0)
      .setMaxAllowedSubaccountActionCount(subaccount.address, keys.SUBACCOUNT_CREATE_ORDER_ACTION, 1);

    await expect(
      subaccountRouter.connect(subaccount).createOrderForAccount(user0.address, {
        ...params,
        addresses: { ...params.addresses, receiver: user0.address },
      })
    ).to.be.revertedWithCustomError(errorsContract, "OrderTypeCannotBeCreated");

    await expect(
      subaccountRouter.connect(subaccount).createOrderForAccount(user0.address, {
        ...params,
        addresses: { ...params.addresses, receiver: user0.address },
        orderType: OrderType.MarketIncrease,
      })
    ).to.be.revertedWith("ERC20: insufficient allowance");

    await usdc.connect(user0).approve(router.address, expandDecimals(200, 6));

    await expect(
      subaccountRouter.connect(subaccount).createOrderForAccount(user0.address, {
        ...params,
        addresses: { ...params.addresses, receiver: user0.address },
        orderType: OrderType.MarketIncrease,
      })
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

    await usdc.mint(user0.address, expandDecimals(101, 6));

    await expect(
      subaccountRouter.connect(subaccount).createOrderForAccount(user0.address, {
        ...params,
        addresses: { ...params.addresses, receiver: user0.address },
        orderType: OrderType.MarketIncrease,
      })
    ).to.be.revertedWithCustomError(errorsContract, "InsufficientWntAmountForExecutionFee");

    expect(
      await dataStore.getUint(
        keys.subaccountActionCountKey(user0.address, subaccount.address, keys.SUBACCOUNT_CREATE_ORDER_ACTION)
      )
    ).eq(0);

    await subaccountRouter.connect(subaccount).multicall(
      [
        subaccountRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, expandDecimals(1, 17)]),
        subaccountRouter.interface.encodeFunctionData("createOrderForAccount", [
          user0.address,
          {
            ...params,
            addresses: { ...params.addresses, receiver: user0.address },
            orderType: OrderType.MarketIncrease,
          },
        ]),
      ],
      { value: expandDecimals(1, 17) }
    );

    const orderKeys = await getOrderKeys(dataStore, 0, 1);
    const order = await reader.getOrder(dataStore.address, orderKeys[0]);
    expect(order.addresses.account).eq(user0.address);
    expect(order.addresses.receiver).eq(user0.address);
    expect(order.numbers.initialCollateralDeltaAmount).eq(expandDecimals(100, 6));

    expect(
      await dataStore.getUint(
        keys.subaccountActionCountKey(user0.address, subaccount.address, keys.SUBACCOUNT_CREATE_ORDER_ACTION)
      )
    ).eq(1);
  });
});
