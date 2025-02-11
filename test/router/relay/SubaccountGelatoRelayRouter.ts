import { expect } from "chai";
import {
  impersonateAccount,
  stopImpersonatingAccount,
  setBalance,
  time,
  setNextBlockBaseFeePerGas,
} from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat, bigNumberify } from "../../../utils/math";
import { logGasUsage } from "../../../utils/gas";
import { hashString } from "../../../utils/hash";
import { OrderType, DecreasePositionSwapType, getOrderKeys } from "../../../utils/order";
import { errorsContract } from "../../../utils/error";
import { expectBalance } from "../../../utils/validation";
import * as keys from "../../../utils/keys";
import {
  sendCancelOrder,
  sendCreateOrder,
  sendRemoveSubaccount,
  sendUpdateOrder,
} from "../../../utils/relay/subaccountGelatoRelay";
import { GELATO_RELAY_ADDRESS } from "../../../utils/relay/addresses";
import { getTokenPermit } from "../../../utils/relay/tokenPermit";
import { ethers } from "ethers";
import { handleDeposit } from "../../../utils/deposit";

const BAD_SIGNATURE =
  "0x122e3efab9b46c82dc38adf4ea6cd2c753b00f95c217a0e3a0f4dd110839f07a08eb29c1cc414d551349510e23a75219cd70c8b88515ed2b83bbd88216ffdb051f";

describe("SubaccountGelatoRelayRouter", () => {
  let fixture;
  let user0, user1, user2, user3;
  let reader, dataStore, router, subaccountGelatoRelayRouter, ethUsdMarket, wnt, usdc, chainlinkPriceFeedProvider;
  let relaySigner;
  let chainId;
  const referralCode = hashString("referralCode");

  let defaultCreateOrderParams;
  let createOrderParams: Parameters<typeof sendCreateOrder>[0];
  let enableSubaccount: () => Promise<void>;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({ reader, dataStore, router, subaccountGelatoRelayRouter, ethUsdMarket, wnt, usdc, chainlinkPriceFeedProvider } =
      fixture.contracts);

    defaultCreateOrderParams = {
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

    enableSubaccount = async () => {
      await dataStore.addAddress(keys.subaccountListKey(user1.address), user0.address);
      await dataStore.setUint(
        keys.subaccountExpiresAtKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION),
        9999999999
      );
      await dataStore.setUint(
        keys.maxAllowedSubaccountActionCountKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION),
        10
      );
      await wnt.connect(user1).approve(router.address, expandDecimals(100, 18));
    };

    await impersonateAccount(GELATO_RELAY_ADDRESS);
    await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(100, 18));
    await usdc.mint(user1.address, expandDecimals(1, 30)); // very large amount
    await wnt.connect(user1).deposit({ value: expandDecimals(1000, 18) });

    relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);
    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    await dataStore.setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));
    await setNextBlockBaseFeePerGas(expandDecimals(1, 9));

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
      params: defaultCreateOrderParams,
      deadline: 9999999999,
      relayRouter: subaccountGelatoRelayRouter,
      chainId,
      relayFeeToken: wnt.address,
      relayFeeAmount: expandDecimals(1, 15),
    };
  });

  describe("createOrder", () => {
    it("InvalidReceiver", async () => {
      await enableSubaccount();

      createOrderParams.params.addresses.receiver = user2.address;
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(errorsContract, "InvalidReceiver");
    });

    it("InvalidCancellationReceiverForSubaccountOrder", async () => {
      await enableSubaccount();

      createOrderParams.params.addresses.cancellationReceiver = user2.address;
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidCancellationReceiverForSubaccountOrder"
      );
    });

    it("GelatoRelayContext._transferRelayFeeCapped: maxFee", async () => {
      await enableSubaccount();

      createOrderParams.feeParams.feeAmount = 1;
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWith(
        "GelatoRelayContext._transferRelayFeeCapped: maxFee"
      );
    });

    it("InsufficientExecutionFee", async () => {
      await enableSubaccount();

      await dataStore.setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));
      createOrderParams.feeParams.feeAmount = expandDecimals(1, 15);
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientExecutionFee"
      );
    });

    it("ExecutionFeeTooHigh", async () => {
      await enableSubaccount();

      await dataStore.setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));
      createOrderParams.feeParams.feeAmount = expandDecimals(1, 17);
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "ExecutionFeeTooHigh"
      );
    });

    it("InvalidSignature", async () => {
      await enableSubaccount();

      await expect(
        sendCreateOrder({
          ...createOrderParams,
          signature: BAD_SIGNATURE,
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");
    });

    it("onlyGelatoRelay", async () => {
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          sender: user0,
        })
      ).to.be.revertedWith("onlyGelatoRelay");
    });

    it("InvalidUserNonce", async () => {
      await enableSubaccount();

      await expect(
        sendCreateOrder({
          ...createOrderParams,
          userNonce: 100,
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidUserNonce");

      await sendCreateOrder({
        ...createOrderParams,
        userNonce: 0,
      });

      // same nonce should revert
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          userNonce: 0,
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidUserNonce");
    });

    it("DeadlinePassed", async () => {
      await enableSubaccount();

      await expect(
        sendCreateOrder({
          ...createOrderParams,
          deadline: 5,
        })
      ).to.be.revertedWithCustomError(errorsContract, "DeadlinePassed");

      await expect(
        sendCreateOrder({
          ...createOrderParams,
          deadline: 0,
        })
      ).to.be.revertedWithCustomError(errorsContract, "DeadlinePassed");

      await time.setNextBlockTimestamp(9999999100);
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          deadline: 9999999099,
        })
      ).to.be.revertedWithCustomError(errorsContract, "DeadlinePassed");

      await time.setNextBlockTimestamp(9999999200);
      await sendCreateOrder({
        ...createOrderParams,
        deadline: 9999999200,
      });
    });

    it("InvalidPermitSpender", async () => {
      await enableSubaccount();
      const tokenPermit = await getTokenPermit(
        wnt,
        user0,
        user2.address,
        expandDecimals(1, 18),
        0,
        9999999999,
        chainId
      );
      await expect(
        sendCreateOrder({ ...createOrderParams, tokenPermits: [tokenPermit] })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidPermitSpender");
    });

    it("UnexpectedRelayFeeToken", async () => {
      await enableSubaccount();
      await usdc.connect(user1).approve(router.address, expandDecimals(1000, 18));
      createOrderParams.feeParams.feeToken = usdc.address;
      createOrderParams.feeParams.feeAmount = expandDecimals(10, 18);
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "UnexpectedRelayFeeToken"
      );
    });

    it("UnexpectedRelayFeeTokenAfterSwap", async () => {
      await enableSubaccount();
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
      createOrderParams.feeParams.feeSwapPath = [ethUsdMarket.marketToken]; // swap WETH for USDC
      createOrderParams.oracleParams = {
        tokens: [usdc.address, wnt.address],
        providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
        data: ["0x", "0x"],
      };
      await handleDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(10, 18),
          shortTokenAmount: expandDecimals(10 * 5000, 6),
        },
      });
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "UnexpectedRelayFeeTokenAfterSwap"
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
            shouldAdd: true,
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
          shouldAdd: true,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          deadline: 9999999201,
          nonce: 0,
        },
      });
    });

    it("SubaccountNotAuthorized", async () => {
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "SubaccountNotAuthorized"
      );
    });

    it("MaxSubaccountActionCountExceeded", async () => {
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
      await dataStore.addAddress(keys.subaccountListKey(user1.address), user0.address);
      await dataStore.setUint(
        keys.subaccountExpiresAtKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION),
        9999999999
      );
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "MaxSubaccountActionCountExceeded"
      );
      await dataStore.setUint(
        keys.maxAllowedSubaccountActionCountKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION),
        10
      );
      await expect(sendCreateOrder(createOrderParams)).to.not.be.revertedWithCustomError(
        errorsContract,
        "MaxSubaccountActionCountExceeded"
      );
    });

    it("SubaccountApprovalExpired", async () => {
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
      await dataStore.addAddress(keys.subaccountListKey(user1.address), user0.address);
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "SubaccountApprovalExpired"
      );
      await dataStore.setUint(
        keys.subaccountExpiresAtKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION),
        9999999999
      );
      await expect(sendCreateOrder(createOrderParams)).to.not.be.revertedWithCustomError(
        errorsContract,
        "SubaccountApprovalExpired"
      );
    });

    it("InvalidSignature of subaccount approval", async () => {
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          subaccountApproval: {
            subaccount: user0.address,
            shouldAdd: true,
            expiresAt: 9999999999,
            maxAllowedCount: 10,
            actionType: keys.SUBACCOUNT_ORDER_ACTION,
            deadline: 0,
            nonce: 0,
            signature: "0x123123",
          },
        })
      )
        .to.be.revertedWithCustomError(errorsContract, "InvalidSignature")
        .withArgs("subaccount approval");
    });

    it("InvalidSubaccountApprovalNonce", async () => {
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          subaccountApproval: {
            subaccount: user0.address,
            shouldAdd: true,
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
          shouldAdd: true,
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
          shouldAdd: true,
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
            shouldAdd: true,
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

    it("updates subaccount approval, max allowed count, and expires at", async () => {
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

      const subaccountActionCountKey = keys.subaccountActionCountKey(
        user1.address,
        user0.address,
        keys.SUBACCOUNT_ORDER_ACTION
      );
      expect(await dataStore.getUint(subaccountActionCountKey)).to.eq(0);

      await sendCreateOrder({
        ...createOrderParams,
        subaccountApproval: {
          subaccount: user0.address,
          shouldAdd: true,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          deadline: 0,
          nonce: 0,
        },
      });

      expect(await dataStore.getUint(subaccountActionCountKey)).to.eq(1);
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
      await dataStore.addAddress(keys.subaccountListKey(user1.address), user0.address);
      await dataStore.setUint(
        keys.subaccountExpiresAtKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION),
        9999999999
      );
      await dataStore.setUint(
        keys.maxAllowedSubaccountActionCountKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION),
        10
      );

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

    it.skip("swap relay fee with external call");
    it.skip("swap relay fee");
  });

  describe("updateOrder", () => {
    let updateOrderParams: Parameters<typeof sendUpdateOrder>[0];

    beforeEach(() => {
      updateOrderParams = {
        sender: relaySigner,
        signer: user0,
        subaccountApprovalSigner: user1,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: expandDecimals(2, 15), // 0.002 ETH
          feeSwapPath: [],
        },
        tokenPermits: [],
        account: user1.address,
        subaccount: user0.address,
        key: ethers.constants.HashZero,
        params: {
          sizeDeltaUsd: decimalToFloat(1000),
          acceptablePrice: decimalToFloat(4900),
          triggerPrice: decimalToFloat(4800),
          minOutputAmount: 700,
          validFromTime: 0,
          autoCancel: false,
        },
        deadline: 9999999999,
        relayRouter: subaccountGelatoRelayRouter,
        chainId,
        relayFeeToken: wnt.address,
        relayFeeAmount: expandDecimals(1, 15),
        subaccountApproval: {
          subaccount: user0.address,
          shouldAdd: true,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          deadline: 0,
          nonce: 0,
        },
        increaseExecutionFee: false,
      };
    });

    it("onlyGelatoRelay", async () => {
      await expect(
        sendUpdateOrder({ ...updateOrderParams, sender: user0 })
        // should not fail with InvalidSignature
      ).to.be.revertedWith("onlyGelatoRelay");
    });

    it("InvalidSignature", async () => {
      await expect(
        sendUpdateOrder({ ...updateOrderParams, signature: BAD_SIGNATURE })
        // should not fail with InvalidSignature
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");
    });

    it("SubaccountNotAuthorized", async () => {
      updateOrderParams.subaccountApproval.signature = "0x";
      await expect(
        sendUpdateOrder(updateOrderParams)
        // should not fail with InvalidSignature
      ).to.be.revertedWithCustomError(errorsContract, "SubaccountNotAuthorized");
    });

    it("signature is valid", async () => {
      await expect(
        sendUpdateOrder(updateOrderParams)
        // should not fail with InvalidSignature
      ).to.be.revertedWithCustomError(errorsContract, "EmptyOrder");
    });

    it("InsufficientExecutionFee", async () => {
      await enableSubaccount();
      createOrderParams.feeParams.feeAmount = expandDecimals(1, 15);
      // set callback to 0 so estimation execution fee is 0
      createOrderParams.params.numbers.callbackGasLimit = 0;
      await sendCreateOrder(createOrderParams);

      const orderKeys = await getOrderKeys(dataStore, 0, 1);

      // now increase gas limit to 500k so estimated execution fee is not zero
      await dataStore.setUint(keys.increaseOrderGasLimitKey(), 500_000);
      // await dataStore.setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));

      await expect(
        sendUpdateOrder({
          ...updateOrderParams,
          key: orderKeys[0],
          feeParams: {
            ...updateOrderParams.feeParams,
            feeAmount: expandDecimals(1, 15),
          },
        })
      ).to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee");

      // increaseExecutionFee is false, so executionFee won't be updated
      await expect(
        sendUpdateOrder({
          ...updateOrderParams,
          key: orderKeys[0],
          feeParams: {
            ...updateOrderParams.feeParams,
            feeAmount: expandDecimals(2, 15),
          },
        })
      ).to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee");

      await sendUpdateOrder({
        ...updateOrderParams,
        key: orderKeys[0],
        feeParams: {
          ...updateOrderParams.feeParams,
          feeAmount: expandDecimals(2, 15),
        },
        increaseExecutionFee: true,
      });
    });

    it("ExecutionFeeTooHigh", async () => {
      await enableSubaccount();
      createOrderParams.feeParams.feeAmount = expandDecimals(2, 15);
      await sendCreateOrder(createOrderParams);

      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      await expect(
        sendUpdateOrder({
          ...updateOrderParams,
          key: orderKeys[0],
          feeParams: {
            ...updateOrderParams.feeParams,
            feeAmount: expandDecimals(2, 17),
          },
          increaseExecutionFee: true,
        })
      ).to.be.revertedWithCustomError(errorsContract, "ExecutionFeeTooHigh");

      // it should not fail with ExecutionFeeTooHigh if increaseExecutionFee is false
      // because the residual relay fee is sent back to the user
      await sendUpdateOrder({
        ...updateOrderParams,
        key: orderKeys[0],
        feeParams: {
          ...updateOrderParams.feeParams,
          feeAmount: expandDecimals(2, 17),
        },
        increaseExecutionFee: false,
      });
    });

    it("increases execution fee", async () => {
      await enableSubaccount();
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
      await sendCreateOrder(createOrderParams);
      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      let order = await reader.getOrder(dataStore.address, orderKeys[0]);

      updateOrderParams.relayFeeAmount = expandDecimals(1, 15);
      updateOrderParams.feeParams.feeAmount = expandDecimals(3, 15);

      const initialWethBalance = await wnt.balanceOf(user1.address);
      const gelatoRelayFee = updateOrderParams.relayFeeAmount;
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, gelatoRelayFee);
      await sendUpdateOrder({ ...updateOrderParams, key: orderKeys[0] });
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, bigNumberify(gelatoRelayFee).mul(2));

      // user receives the residual amount
      await expectBalance(wnt.address, user1.address, initialWethBalance.sub(expandDecimals(1, 15)));
      // and the execution fee stays the same
      order = await reader.getOrder(dataStore.address, orderKeys[0]);
      expect(order.numbers.executionFee).eq(expandDecimals(1, 15));

      await sendUpdateOrder({ ...updateOrderParams, key: orderKeys[0], increaseExecutionFee: true });

      // user doesn't receive the residual amount
      await expectBalance(wnt.address, user1.address, initialWethBalance.sub(expandDecimals(4, 15)));
      // and the execution fee is increased
      order = await reader.getOrder(dataStore.address, orderKeys[0]);
      expect(order.numbers.executionFee).eq(expandDecimals(3, 15));
    });
  });

  describe("cancelOrder", () => {
    let cancelOrderParams: Parameters<typeof sendCancelOrder>[0];

    beforeEach(() => {
      cancelOrderParams = {
        sender: relaySigner,
        signer: user0,
        subaccountApprovalSigner: user1,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: expandDecimals(2, 15), // 0.002 ETH
          feeSwapPath: [],
        },
        tokenPermits: [],
        account: user1.address,
        subaccount: user0.address,
        key: ethers.constants.HashZero,
        userNonce: 0,
        deadline: 9999999999,
        relayRouter: subaccountGelatoRelayRouter,
        chainId,
        relayFeeToken: wnt.address,
        relayFeeAmount: expandDecimals(1, 15),
        subaccountApproval: {
          subaccount: user0.address,
          shouldAdd: true,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          deadline: 0,
          nonce: 0,
        },
      };
    });

    it("onlyGelatoRelay", async () => {
      await expect(
        sendCancelOrder({ ...cancelOrderParams, sender: user0 })
        // should not fail with InvalidSignature
      ).to.be.revertedWith("onlyGelatoRelay");
    });

    it("InvalidSignature", async () => {
      await expect(
        sendCancelOrder({ ...cancelOrderParams, signature: BAD_SIGNATURE })
        // should not fail with InvalidSignature
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");
    });

    it("SubaccountNotAuthorized", async () => {
      cancelOrderParams.subaccountApproval.signature = "0x";
      await expect(
        sendCancelOrder(cancelOrderParams)
        // should not fail with InvalidSignature
      ).to.be.revertedWithCustomError(errorsContract, "SubaccountNotAuthorized");
    });

    it("signature is valid", async () => {
      await expect(
        sendCancelOrder(cancelOrderParams)
        // should not fail with InvalidSignature
      ).to.be.revertedWithCustomError(errorsContract, "EmptyOrder");
    });
  });

  it("removeSubaccount", async () => {
    await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
    await dataStore.addAddress(keys.subaccountListKey(user1.address), user0.address);
    expect(await dataStore.getAddressCount(keys.subaccountListKey(user1.address))).to.eq(1);
    const params = {
      sender: relaySigner,
      signer: user1,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: expandDecimals(2, 15), // 0.002 ETH
        feeSwapPath: [],
      },
      tokenPermits: [],
      subaccount: user0.address,
      account: user1.address,
      relayRouter: subaccountGelatoRelayRouter,
      chainId,
      relayFeeToken: wnt.address,
      relayFeeAmount: expandDecimals(1, 15),
      userNonce: 0,
      deadline: 9999999999,
    };
    await expect(sendRemoveSubaccount({ ...params, signature: "0x1234" })).to.be.revertedWithCustomError(
      errorsContract,
      "InvalidSignature"
    );

    await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);

    await sendRemoveSubaccount(params);
    expect(await dataStore.getAddressCount(keys.subaccountListKey(user1.address))).to.eq(0);

    await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, createOrderParams.relayFeeAmount);
  });
});
