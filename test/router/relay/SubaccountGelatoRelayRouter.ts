import { expect } from "chai";
import {
  impersonateAccount,
  stopImpersonatingAccount,
  setBalance,
  time,
} from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { logGasUsage } from "../../../utils/gas";
import { hashString } from "../../../utils/hash";
import { OrderType, DecreasePositionSwapType, getOrderKeys } from "../../../utils/order";
import { errorsContract } from "../../../utils/error";
import { expectBalance } from "../../../utils/validation";
import * as keys from "../../../utils/keys";
import { sendCreateOrder } from "../../../utils/relay/subaccountGelatoRelay";
import { GELATO_RELAY_ADDRESS } from "../../../utils/relay/addresses";
import { getTokenPermit } from "../../../utils/relay/tokenPermit";

describe("SubaccountGelatoRelayRouter", () => {
  let fixture;
  let user0, user1, user2, user3;
  let reader, dataStore, router, subaccountGelatoRelayRouter, ethUsdMarket, wnt, usdc;
  let relaySigner;
  let chainId;
  const referralCode = hashString("referralCode");

  let defaultParams;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({ reader, dataStore, router, subaccountGelatoRelayRouter, ethUsdMarket, wnt, usdc } = fixture.contracts);

    defaultParams = {
      addresses: {
        receiver: user1.address,
        cancellationReceiver: user1.address,
        callbackContract: user2.address,
        uiFeeReceiver: user3.address,
        market: ethUsdMarket.marketToken,
        initialCollateralToken: ethUsdMarket.longToken,
        swapPath: [ethUsdMarket.marketToken],
      },
      numbers: {
        sizeDeltaUsd: decimalToFloat(1000),
        initialCollateralDeltaAmount: 0,
        triggerPrice: decimalToFloat(4800),
        acceptablePrice: decimalToFloat(4900),
        executionFee: 0,
        callbackGasLimit: "200000",
        minOutputAmount: 700,
        validFromTime: 0,
      },
      orderType: OrderType.LimitIncrease,
      decreasePositionSwapType: DecreasePositionSwapType.SwapCollateralTokenToPnlToken,
      isLong: true,
      shouldUnwrapNativeToken: true,
      referralCode,
    };

    await impersonateAccount(GELATO_RELAY_ADDRESS);
    await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(100, 18));
    await usdc.mint(user1.address, expandDecimals(1, 30)); // very large amount
    await wnt.connect(user1).deposit({ value: expandDecimals(1000, 18) });

    relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);
    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);
  });

  describe("createOrder", () => {
    let createOrderParams;

    beforeEach(async () => {
      createOrderParams = {
        sender: relaySigner,
        // signer is subaccount
        signer: user0,
        // subaccountApprovalSigner is the main account
        subaccountApprovalSigner: user1,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: expandDecimals(2, 15), // 0.002 ETH
          feeSwapPath: [],
        },
        tokenPermits: [],
        collateralDeltaAmount: expandDecimals(1, 17),
        account: user1.address,
        // TODO use different subaccount wallet
        subaccount: user0.address,
        params: defaultParams,
        userNonce: 0,
        deadline: 9999999999,
        relayRouter: subaccountGelatoRelayRouter,
        chainId,
        relayFeeToken: wnt.address,
        relayFeeAmount: expandDecimals(1, 15),
      };
    });

    it("InsufficientRelayFee", async () => {
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
      createOrderParams.feeParams.feeAmount = 1;
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientRelayFee"
      );
    });

    it("SubaccountApprovalDeadlinePassed", async () => {
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
      await time.setNextBlockTimestamp(9999999100);
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          subaccountApproval: {
            subaccount: user0.address,
            expiresAt: 9999999999,
            maxAllowedCount: 10,
            actionType: keys.SUBACCOUNT_ORDER_ACTION,
            deadline: 9999999099,
            nonce: 0,
          },
        })
      ).to.be.revertedWithCustomError(errorsContract, "SubaccountApprovalDeadlinePassed");

      await time.setNextBlockTimestamp(9999999200);
      await sendCreateOrder({
        ...createOrderParams,
        subaccountApproval: {
          subaccount: user0.address,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          deadline: 9999999201,
          nonce: 0,
        },
      });
    });

    it("InvalidSubaccountApprovalNonce", async () => {
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          subaccountApproval: {
            subaccount: user0.address,
            expiresAt: 9999999999,
            maxAllowedCount: 10,
            actionType: keys.SUBACCOUNT_ORDER_ACTION,
            deadline: 0,
            nonce: 1,
          },
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSubaccountApprovalNonce");

      await sendCreateOrder({
        ...createOrderParams,
        subaccountApproval: {
          subaccount: user0.address,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          deadline: 0,
          nonce: 0,
        },
      });

      await sendCreateOrder({
        ...createOrderParams,
        subaccountApproval: {
          subaccount: user0.address,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          deadline: 0,
          nonce: 1,
        },
        userNonce: 1,
      });

      await expect(
        sendCreateOrder({
          ...createOrderParams,
          subaccountApproval: {
            subaccount: user0.address,
            expiresAt: 9999999999,
            maxAllowedCount: 10,
            actionType: keys.SUBACCOUNT_ORDER_ACTION,
            deadline: 0,
            nonce: 1,
          },
          userNonce: 2,
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSubaccountApprovalNonce");
    });

    it("updates subaccount approval", async () => {
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));

      const subaccountListKey = keys.subaccountListKey(user1.address);
      expect(await dataStore.getAddressCount(subaccountListKey)).to.eq(0);

      expect(
        await dataStore.getUint(
          keys.maxAllowedSubaccountActionCountKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION)
        )
      ).to.eq(0);
      expect(
        await dataStore.getUint(keys.subaccountExpiresAtKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION))
      ).to.eq(0);

      await sendCreateOrder({
        ...createOrderParams,
        subaccountApproval: {
          subaccount: user0.address,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          deadline: 0,
          nonce: 0,
        },
      });

      expect(await dataStore.getAddressCount(subaccountListKey)).to.eq(1);
      expect(await dataStore.getAddressValuesAt(subaccountListKey, 0, 1)).to.deep.eq([user0.address]);
      expect(
        await dataStore.getUint(
          keys.maxAllowedSubaccountActionCountKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION)
        )
      ).to.eq(10);
      expect(
        await dataStore.getUint(keys.subaccountExpiresAtKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION))
      ).to.eq(9999999999);
    });

    it("creates order and sends relayer fee", async () => {
      const collateralDeltaAmount = createOrderParams.collateralDeltaAmount;
      const gelatoRelayFee = createOrderParams.relayFeeAmount;

      const tokenPermit = await getTokenPermit(
        wnt,
        user1,
        router.address,
        expandDecimals(1, 18),
        0,
        9999999999,
        chainId
      );

      expect(await wnt.allowance(user0.address, router.address)).to.eq(0);
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);
      const tx = await sendCreateOrder({
        ...createOrderParams,
        tokenPermits: [tokenPermit],
      });

      // allowance was set
      expect(await wnt.allowance(user1.address, router.address)).to.eq(
        expandDecimals(1, 18).sub(collateralDeltaAmount).sub(gelatoRelayFee).sub(expandDecimals(1, 15))
      );
      // relay fee was sent
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, gelatoRelayFee);

      // same nonce should revert
      await expect(
        sendCreateOrder({
          ...createOrderParams,
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidUserNonce");

      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      const order = await reader.getOrder(dataStore.address, orderKeys[0]);

      expect(order.addresses.account).eq(user1.address);
      expect(order.addresses.receiver).eq(user1.address);
      expect(order.addresses.callbackContract).eq(user2.address);
      expect(order.addresses.uiFeeReceiver).eq(user3.address);
      expect(order.addresses.market).eq(ethUsdMarket.marketToken);
      expect(order.addresses.initialCollateralToken).eq(ethUsdMarket.longToken);
      expect(order.addresses.swapPath).deep.eq([ethUsdMarket.marketToken]);
      expect(order.numbers.orderType).eq(OrderType.LimitIncrease);
      expect(order.numbers.decreasePositionSwapType).eq(DecreasePositionSwapType.SwapCollateralTokenToPnlToken);
      expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(1000));
      expect(order.numbers.initialCollateralDeltaAmount).eq(collateralDeltaAmount);
      expect(order.numbers.triggerPrice).eq(decimalToFloat(4800));
      expect(order.numbers.acceptablePrice).eq(decimalToFloat(4900));
      expect(order.numbers.executionFee).eq(expandDecimals(1, 15));
      expect(order.numbers.callbackGasLimit).eq("200000");
      expect(order.numbers.minOutputAmount).eq(700);

      expect(order.flags.isLong).eq(true);
      expect(order.flags.shouldUnwrapNativeToken).eq(true);
      expect(order.flags.isFrozen).eq(false);

      await stopImpersonatingAccount(GELATO_RELAY_ADDRESS);

      await logGasUsage({
        tx,
        label: "gelatoRelayRouter.createOrder",
      });
    });
  });
});
