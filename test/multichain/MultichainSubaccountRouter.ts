import { expect } from "chai";
import {
  impersonateAccount,
  stopImpersonatingAccount,
  setBalance,
  time,
  setNextBlockBaseFeePerGas,
} from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat, bigNumberify, percentageToFloat, applyFactor } from "../../utils/math";
import { logGasUsage } from "../../utils/gas";
import { hashString } from "../../utils/hash";
import { OrderType, DecreasePositionSwapType, getOrderKeys, getOrderCount } from "../../utils/order";
import { errorsContract } from "../../utils/error";
import { expectBalance } from "../../utils/validation";
import * as keys from "../../utils/keys";
import {
  getSubaccountApproval,
  sendBatch,
  sendCancelOrder,
  sendCreateOrder,
  sendRemoveSubaccount,
  sendUpdateOrder,
} from "../../utils/relay/subaccountGelatoRelay";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import { getTokenPermit } from "../../utils/relay/tokenPermit";
import { ethers } from "ethers";
import { handleDeposit } from "../../utils/deposit";
import { deployContract } from "../../utils/deploy";
import { parseLogs } from "../../utils/event";
import { bridgeInTokens } from "../../utils/multichain";

const BAD_SIGNATURE =
  "0x122e3efab9b46c82dc38adf4ea6cd2c753b00f95c217a0e3a0f4dd110839f07a08eb29c1cc414d551349510e23a75219cd70c8b88515ed2b83bbd88216ffdb051f";

describe("MultichainSubaccountRouter", () => {
  let fixture;
  let user0, user1, user2, user3;
  let reader,
    dataStore,
    router,
    multichainVault,
    multichainSubaccountRouter,
    ethUsdMarket,
    wnt,
    usdc,
    chainlinkPriceFeedProvider,
    mockStargatePoolUsdc,
    mockStargatePoolNative;
  let relaySigner;
  let chainId;
  const referralCode = hashString("referralCode");
  const integrationId = hashString("integrationId");

  let defaultCreateOrderParams;
  let createOrderParams: Parameters<typeof sendCreateOrder>[0];
  let enableSubaccount: () => Promise<void>;

  const wntAmountBridged = expandDecimals(1000, 18);
  const usdcAmountBridged = expandDecimals(10000, 6);

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({
      reader,
      dataStore,
      router,
      multichainVault,
      multichainSubaccountRouter,
      ethUsdMarket,
      wnt,
      usdc,
      chainlinkPriceFeedProvider,
      mockStargatePoolUsdc,
      mockStargatePoolNative,
    } = fixture.contracts);

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
        initialCollateralDeltaAmount: expandDecimals(1, 17),
        triggerPrice: decimalToFloat(4800),
        acceptablePrice: decimalToFloat(4900),
        executionFee: expandDecimals(1, 15),
        callbackGasLimit: "200000",
        minOutputAmount: 700,
        validFromTime: 0,
      },
      orderType: OrderType.LimitIncrease,
      decreasePositionSwapType: DecreasePositionSwapType.SwapCollateralTokenToPnlToken,
      isLong: true,
      shouldUnwrapNativeToken: true,
      referralCode,
      dataList: [],
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

    await dataStore.setUint(keys.MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT, decimalToFloat(100));

    relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);
    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    // Multichain
    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
    await bridgeInTokens(fixture, { account: user1, amount: wntAmountBridged });
    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
    await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmountBridged });

    await dataStore.setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));
    await setNextBlockBaseFeePerGas(expandDecimals(1, 9));

    createOrderParams = {
      sender: relaySigner,
      // signer is subaccount
      signer: user0,
      // subaccountApprovalSigner is the main account
      feeParams: {
        feeToken: wnt.address,
        feeAmount: expandDecimals(2, 15), // 0.002 ETH
        feeSwapPath: [],
      },
      tokenPermits: [],
      account: user1.address,
      subaccountApprovalSigner: user1,
      // TODO use different subaccount wallet
      subaccount: user0.address,
      params: defaultCreateOrderParams,
      deadline: 9999999999,
      srcChainId: chainId, // for non-multichain actions, srcChainId is 0
      desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
      relayRouter: multichainSubaccountRouter,
      chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: expandDecimals(1, 15),
    };
  });

  //#region createOrder
  describe("createOrder", () => {
    it("DisabledFeature", async () => {
      await dataStore.setBool(keys.gaslessFeatureDisabledKey(multichainSubaccountRouter.address), true);
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(errorsContract, "DisabledFeature");
    });

    it("InvalidReceiverForSubaccountOrder", async () => {
      await enableSubaccount();

      createOrderParams.params.addresses.receiver = user2.address;
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidReceiverForSubaccountOrder"
      );
    });

    it("InvalidCancellationReceiverForSubaccountOrder", async () => {
      await enableSubaccount();

      createOrderParams.params.addresses.cancellationReceiver = user2.address;
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidCancellationReceiverForSubaccountOrder"
      );
    });

    it("InsufficientRelayFee", async () => {
      await enableSubaccount();

      createOrderParams.feeParams.feeAmount = expandDecimals(1, 15);
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientRelayFee"
      );
    });

    it("NonEmptyExternalCallsForSubaccountOrder", async () => {
      await enableSubaccount();

      await expect(
        sendCreateOrder({
          ...createOrderParams,
          externalCalls: {
            sendTokens: [ethers.constants.AddressZero],
            sendAmounts: [0],
            externalCallTargets: [user0.address],
            externalCallDataList: ["0x"],
            refundTokens: [],
            refundReceivers: [],
          },
        })
      ).to.be.revertedWithCustomError(errorsContract, "NonEmptyExternalCallsForSubaccountOrder");
    });

    it("InsufficientExecutionFee", async () => {
      await enableSubaccount();

      await dataStore.setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));
      createOrderParams.feeParams.feeAmount = expandDecimals(1, 15);
      createOrderParams.params.numbers.executionFee = 1;
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientExecutionFee"
      );
    });

    it("execution fee should be capped", async () => {
      await enableSubaccount();

      await dataStore.setAddress(keys.HOLDING_ADDRESS, user3.address);
      await dataStore.setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));
      createOrderParams.feeParams.feeAmount = expandDecimals(101, 15);
      createOrderParams.params.numbers.executionFee = expandDecimals(1, 17);

      await expectBalance(wnt.address, user3.address, 0);
      await sendCreateOrder(createOrderParams);

      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      const order = await reader.getOrder(dataStore.address, orderKeys[0]);
      // 0.099 WETH (0.1 paid - 0.001 relay fee)
      expect(order.numbers.executionFee).eq("9003720880000000");
      await expectBalance(wnt.address, user3.address, "90996279120000000");
    });

    it("InvalidSignature  ", async () => {
      await enableSubaccount();

      await expect(
        sendCreateOrder({
          ...createOrderParams,
          signature: BAD_SIGNATURE,
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");
    });

    it("InvalidUserDigest", async () => {
      await enableSubaccount();

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
      ).to.be.revertedWithCustomError(errorsContract, "InvalidUserDigest");
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

    it("TokenPermitsNotAllowedForMultichain", async () => {
      const tokenPermit = await getTokenPermit(
        wnt,
        user1,
        router.address,
        expandDecimals(1, 18),
        0,
        9999999999,
        chainId
      );
      await expect(
        sendCreateOrder({ ...createOrderParams, tokenPermits: [tokenPermit] })
      ).to.be.revertedWithCustomError(errorsContract, "TokenPermitsNotAllowedForMultichain");
    });

    it("UnexpectedRelayFeeToken", async () => {
      await enableSubaccount();
      createOrderParams.feeParams.feeToken = usdc.address;
      createOrderParams.feeParams.feeAmount = expandDecimals(10, 18);
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "UnexpectedRelayFeeToken"
      );
    });

    it("UnexpectedRelayFeeTokenAfterSwap", async () => {
      await enableSubaccount();
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

    it("InvalidSubaccountApprovalSubaccount", async () => {
      const subaccountApproval = await getSubaccountApproval({
        subaccountApproval: {
          subaccount: ethers.constants.AddressZero,
          shouldAdd: true,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          integrationId: ethers.constants.HashZero,
          deadline: 0,
          nonce: 0,
        },
        desChainId: chainId,
        account: user1.address,
        relayRouter: multichainSubaccountRouter,
        chainId,
        signer: user1,
      });
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          subaccountApproval,
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSubaccountApprovalSubaccount");
    });

    it("SubaccountApprovalDeadlinePassed", async () => {
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
            integrationId: integrationId,
            nonce: 0,
          },
        })
      ).to.be.revertedWithCustomError(errorsContract, "SubaccountApprovalDeadlinePassed");

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
            integrationId: integrationId,
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
          integrationId: integrationId,
          nonce: 0,
        },
      });
    });

    it("SubaccountNotAuthorized", async () => {
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "SubaccountNotAuthorized"
      );
    });

    it("MaxSubaccountActionCountExceeded", async () => {
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
            deadline: 9999999999,
            integrationId: integrationId,
            nonce: 0,
            signature: "0x123123",
          },
        })
      )
        .to.be.revertedWithCustomError(errorsContract, "InvalidSignature")
        .withArgs("subaccount approval");
    });

    it("InvalidSubaccountApprovalNonce", async () => {
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          subaccountApproval: {
            subaccount: user0.address,
            shouldAdd: true,
            expiresAt: 9999999999,
            maxAllowedCount: 10,
            actionType: keys.SUBACCOUNT_ORDER_ACTION,
            deadline: 9999999999,
            integrationId: integrationId,
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
          deadline: 9999999999,
          integrationId: integrationId,
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
          deadline: 9999999999,
          integrationId: integrationId,
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
            deadline: 9999999999,
            integrationId: integrationId,
            nonce: 1,
          },
          userNonce: 2,
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSubaccountApprovalNonce");
    });

    it("updates subaccount approval, max allowed count, and expires at", async () => {
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
          deadline: 9999999999,
          integrationId: integrationId,
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

      const collateralDeltaAmount = createOrderParams.params.numbers.initialCollateralDeltaAmount;
      const gelatoRelayFee = createOrderParams.gelatoRelayFeeAmount;

      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(wntAmountBridged);

      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);
      const tx = await sendCreateOrder(createOrderParams);

      // user's multichain balance is updated
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
        wntAmountBridged.sub(collateralDeltaAmount).sub(gelatoRelayFee).sub(expandDecimals(1, 15))
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

    it("MaxRelayFeeSwapForSubaccountExceeded", async () => {
      await enableSubaccount();
      await handleDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(10, 18),
          shortTokenAmount: expandDecimals(10 * 5000, 6),
        },
      });

      await dataStore.setUint(keys.MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT, 0);
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          feeParams: {
            feeToken: usdc.address,
            feeAmount: expandDecimals(1, 6),
            feeSwapPath: [ethUsdMarket.marketToken],
          },
          oracleParams: {
            tokens: [usdc.address, wnt.address],
            providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
            data: ["0x", "0x"],
          },
        })
      )
        .to.be.revertedWithCustomError(errorsContract, "MaxRelayFeeSwapForSubaccountExceeded")
        .withArgs(decimalToFloat(1), decimalToFloat(0));

      await dataStore.setUint(keys.MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT, decimalToFloat(100));
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          feeParams: {
            feeToken: usdc.address,
            feeAmount: expandDecimals(101, 6),
            feeSwapPath: [ethUsdMarket.marketToken],
          },
          oracleParams: {
            tokens: [usdc.address, wnt.address],
            providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
            data: ["0x", "0x"],
          },
        })
      )
        .to.be.revertedWithCustomError(errorsContract, "MaxRelayFeeSwapForSubaccountExceeded")
        .withArgs(decimalToFloat(101), decimalToFloat(100));

      await dataStore.setUint(keys.MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT, decimalToFloat(102));
      sendCreateOrder({
        ...createOrderParams,
        feeParams: {
          feeToken: usdc.address,
          feeAmount: expandDecimals(101, 6),
          feeSwapPath: [ethUsdMarket.marketToken],
        },
        oracleParams: {
          tokens: [usdc.address, wnt.address],
          providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
          data: ["0x", "0x"],
        },
      });
    });

    it("swap relay fee", async () => {
      await enableSubaccount();
      await handleDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(10, 18),
          shortTokenAmount: expandDecimals(10 * 5000, 6),
        },
      });

      const atomicSwapFeeFactor = percentageToFloat("1%");
      const swapFeeFactor = percentageToFloat("0.05%");
      await dataStore.setUint(keys.atomicSwapFeeFactorKey(ethUsdMarket.marketToken), atomicSwapFeeFactor);
      await dataStore.setUint(keys.swapFeeFactorKey(ethUsdMarket.marketToken, true), swapFeeFactor);
      await dataStore.setUint(keys.swapFeeFactorKey(ethUsdMarket.marketToken, false), swapFeeFactor);

      const usdcBalanceBefore = await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address));
      const feeAmount = expandDecimals(10, 6);
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);
      createOrderParams.gelatoRelayFeeAmount = expandDecimals(98, 13);
      const tx = await sendCreateOrder({
        ...createOrderParams,
        feeParams: {
          feeToken: usdc.address,
          feeAmount,
          feeSwapPath: [ethUsdMarket.marketToken],
        },
        oracleParams: {
          tokens: [usdc.address, wnt.address],
          providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
          data: ["0x", "0x"],
        },
      });

      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      const order = await reader.getOrder(dataStore.address, orderKeys[0]);

      // WETH price is 5000, so 10 USDC will be 0.002 WETH before fees
      expect(order.numbers.executionFee).eq(
        expandDecimals(2, 15)
          .sub(applyFactor(expandDecimals(2, 15), atomicSwapFeeFactor))
          .sub(createOrderParams.gelatoRelayFeeAmount)
      );

      // feeCollector received in WETH
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, createOrderParams.gelatoRelayFeeAmount);

      // and user sent correct amount of USDC
      const usdcBalanceAfter = await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address));
      expect(usdcBalanceAfter).eq(usdcBalanceBefore.sub(feeAmount));

      // check that atomic swap fee was applied
      const txReceipt = await hre.ethers.provider.getTransactionReceipt(tx.hash);
      const logs = parseLogs(fixture, txReceipt);
      const swapInfoLog = logs.find((log) => log.parsedEventInfo?.eventName === "SwapInfo");
      const swapFeesCollectedLog = logs.find((log) => log.parsedEventInfo?.eventName === "SwapFeesCollected");
      // TODO check fee based on received amounts
      expect(swapInfoLog.parsedEventData.amountIn.sub(swapInfoLog.parsedEventData.amountInAfterFees)).eq(
        applyFactor(swapInfoLog.parsedEventData.amountIn, atomicSwapFeeFactor)
      );
      expect(swapFeesCollectedLog.parsedEventData.swapFeeType).eq(keys.ATOMIC_SWAP_FEE_TYPE);

      await logGasUsage({
        tx,
        label: "gelatoRelayRouter.createOrder with swap",
      });
    });
  });

  //#region updateOrder
  describe("updateOrder", () => {
    let updateOrderParams: Parameters<typeof sendUpdateOrder>[0];

    beforeEach(async () => {
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
        params: {
          key: ethers.constants.HashZero,
          sizeDeltaUsd: decimalToFloat(1000),
          acceptablePrice: decimalToFloat(4900),
          triggerPrice: decimalToFloat(4800),
          minOutputAmount: 700,
          validFromTime: 0,
          autoCancel: false,
          executionFeeIncrease: 0,
        },
        deadline: 9999999999,
        srcChainId: chainId, // for non-multichain actions, srcChainId is 0
        desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
        relayRouter: multichainSubaccountRouter,
        chainId,
        gelatoRelayFeeToken: wnt.address,
        gelatoRelayFeeAmount: expandDecimals(1, 15),
        subaccountApproval: {
          subaccount: user0.address,
          shouldAdd: true,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          deadline: 9999999999,
          integrationId: integrationId,
        },
      };
    });

    it("DisabledFeature", async () => {
      await dataStore.setBool(keys.gaslessFeatureDisabledKey(multichainSubaccountRouter.address), true);
      await expect(sendUpdateOrder(updateOrderParams)).to.be.revertedWithCustomError(errorsContract, "DisabledFeature");
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

    it("NonEmptyExternalCallsForSubaccountOrder", async () => {
      await enableSubaccount();
      await sendCreateOrder(createOrderParams);

      const orderKeys = await getOrderKeys(dataStore, 0, 1);

      updateOrderParams.params.key = orderKeys[0];
      await expect(
        sendUpdateOrder({
          ...updateOrderParams,
          externalCalls: {
            sendTokens: [ethers.constants.AddressZero],
            sendAmounts: [0],
            externalCallTargets: [user0.address],
            externalCallDataList: ["0x"],
            refundTokens: [],
            refundReceivers: [],
          },
        })
      ).to.be.revertedWithCustomError(errorsContract, "NonEmptyExternalCallsForSubaccountOrder");
    });

    it("InsufficientExecutionFee", async () => {
      await enableSubaccount();
      createOrderParams.feeParams.feeAmount = expandDecimals(1, 15);
      // set callback to 0 so estimated execution fee is 0
      createOrderParams.params.numbers.callbackGasLimit = 0;
      createOrderParams.params.numbers.executionFee = 0;
      await sendCreateOrder(createOrderParams);

      const orderKeys = await getOrderKeys(dataStore, 0, 1);

      // now increase gas limit to 500k so estimated execution fee is not zero
      await dataStore.setUint(keys.increaseOrderGasLimitKey(), 500_000);

      updateOrderParams.params.key = orderKeys[0];
      await expect(
        sendUpdateOrder({
          ...updateOrderParams,
          feeParams: {
            ...updateOrderParams.feeParams,
            feeAmount: expandDecimals(1, 15),
          },
        })
      ).to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee");

      // executionFee is 0, so executionFee won't be updated
      await expect(
        sendUpdateOrder({
          ...updateOrderParams,
          feeParams: {
            ...updateOrderParams.feeParams,
            feeAmount: expandDecimals(2, 15),
          },
        })
      ).to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee");

      updateOrderParams.params.executionFeeIncrease = expandDecimals(2, 15);
      await sendUpdateOrder({
        ...updateOrderParams,
        feeParams: {
          ...updateOrderParams.feeParams,
          feeAmount: expandDecimals(3, 15),
        },
      });
    });

    it("execution fee should be capped if increased", async () => {
      const holdingAddress = user2.address;
      await dataStore.setAddress(keys.HOLDING_ADDRESS, holdingAddress);
      await enableSubaccount();
      createOrderParams.feeParams.feeAmount = expandDecimals(2, 15);
      await sendCreateOrder(createOrderParams);
      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      let order = await reader.getOrder(dataStore.address, orderKeys[0]);
      expect(order.numbers.executionFee).eq(expandDecimals(1, 15));

      // it should not be capped if executionFee is 0
      updateOrderParams.params.key = orderKeys[0];
      updateOrderParams.params.executionFeeIncrease = 0;
      await sendUpdateOrder({
        ...updateOrderParams,
        feeParams: {
          ...updateOrderParams.feeParams,
          feeAmount: expandDecimals(2, 17),
        },
      });
      order = await reader.getOrder(dataStore.address, orderKeys[0]);
      expect(order.numbers.executionFee).eq(expandDecimals(1, 15));

      updateOrderParams.params.executionFeeIncrease = expandDecimals(1, 17);
      await expectBalance(wnt.address, holdingAddress, 0);
      await sendUpdateOrder({
        ...updateOrderParams,
        feeParams: {
          ...updateOrderParams.feeParams,
          feeAmount: expandDecimals(2, 17),
        },
      });
      order = await reader.getOrder(dataStore.address, orderKeys[0]);

      // 0.2 WETH in total (initial 0.001 + 0.199 from update)
      expect(order.numbers.executionFee).closeTo("8058060700000000", "10000000000000");
      expect(await wnt.balanceOf(holdingAddress)).closeTo("92941939300000000", "10000000000000");
    });

    it("EmptyOrder", async () => {
      await enableSubaccount();
      await expect(sendUpdateOrder(updateOrderParams)).to.be.revertedWithCustomError(errorsContract, "EmptyOrder");
    });

    it("updates order, sends relay fee, increases execution fee", async () => {
      await enableSubaccount();
      await sendCreateOrder(createOrderParams);
      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      let order = await reader.getOrder(dataStore.address, orderKeys[0]);

      updateOrderParams.gelatoRelayFeeAmount = expandDecimals(1, 15);
      updateOrderParams.feeParams.feeAmount = expandDecimals(3, 15);
      updateOrderParams.params.sizeDeltaUsd = expandDecimals(1000, 30);

      const initialWethBalanceVault = await wnt.balanceOf(multichainVault.address);
      const initialWethBalanceUser = await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address));
      const gelatoRelayFee = updateOrderParams.gelatoRelayFeeAmount;
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, gelatoRelayFee);
      updateOrderParams.params.key = orderKeys[0];
      await sendUpdateOrder({ ...updateOrderParams });
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, bigNumberify(gelatoRelayFee).mul(2));

      // multichainVault receives the residual amount
      await expectBalance(wnt.address, multichainVault.address, initialWethBalanceVault.sub(expandDecimals(1, 15)));
      // user receives the residual amount
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).eq(
        initialWethBalanceUser.sub(expandDecimals(1, 15))
      );
      // and the execution fee stays the same
      order = await reader.getOrder(dataStore.address, orderKeys[0]);
      expect(order.numbers.executionFee).eq(expandDecimals(1, 15));

      updateOrderParams.params.executionFeeIncrease = expandDecimals(2, 15);
      await sendUpdateOrder({ ...updateOrderParams });

      // multichainVault doesn't receive the residual amount
      await expectBalance(wnt.address, multichainVault.address, initialWethBalanceVault.sub(expandDecimals(4, 15)));
      // user doesn't receive the residual amount
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).eq(
        initialWethBalanceUser.sub(expandDecimals(4, 15))
      );
      // and the execution fee is increased
      order = await reader.getOrder(dataStore.address, orderKeys[0]);
      expect(order.numbers.executionFee).eq(expandDecimals(3, 15));
      expect(order.numbers.sizeDeltaUsd).eq(expandDecimals(1000, 30));
    });
  });

  //#region cancelOrder
  describe("cancelOrder", () => {
    let cancelOrderParams: Parameters<typeof sendCancelOrder>[0];

    beforeEach(async () => {
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
        deadline: 9999999999,
        srcChainId: chainId, // for non-multichain actions, srcChainId is 0
        desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
        relayRouter: multichainSubaccountRouter,
        chainId,
        gelatoRelayFeeToken: wnt.address,
        gelatoRelayFeeAmount: expandDecimals(1, 15),
        subaccountApproval: {
          subaccount: user0.address,
          shouldAdd: true,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          deadline: 9999999999,
          integrationId: ethers.constants.HashZero,
          nonce: 0,
        },
      };
    });

    it("DisabledFeature", async () => {
      await dataStore.setBool(keys.gaslessFeatureDisabledKey(multichainSubaccountRouter.address), true);
      await expect(sendCancelOrder(cancelOrderParams)).to.be.revertedWithCustomError(errorsContract, "DisabledFeature");
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

    it("NonEmptyExternalCallsForSubaccountOrder", async () => {
      await dataStore.setAddress(keys.HOLDING_ADDRESS, user3.address);
      await enableSubaccount();
      createOrderParams.feeParams.feeAmount = expandDecimals(2, 15);
      createOrderParams.params.numbers.callbackGasLimit = 0;
      await sendCreateOrder(createOrderParams);

      const orderKeys = await getOrderKeys(dataStore, 0, 1);

      await expect(
        sendCancelOrder({
          ...cancelOrderParams,
          externalCalls: {
            sendTokens: [ethers.constants.AddressZero],
            sendAmounts: [0],
            externalCallTargets: [user0.address],
            externalCallDataList: ["0x"],
            refundTokens: [],
            refundReceivers: [],
          },
          key: orderKeys[0],
        })
      ).to.be.revertedWithCustomError(errorsContract, "NonEmptyExternalCallsForSubaccountOrder");
    });

    it("cancels order and sends relay fee", async () => {
      await enableSubaccount();
      await sendCreateOrder(createOrderParams);
      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      const gelatoRelayFee = createOrderParams.gelatoRelayFeeAmount;

      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, gelatoRelayFee);
      await sendCancelOrder({ ...cancelOrderParams, key: orderKeys[0] });
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, bigNumberify(gelatoRelayFee).mul(2));

      const orderCount = await getOrderCount(dataStore);
      expect(orderCount).eq(0);
    });
  });

  //#region removeSubaccount
  describe("removeSubaccount", () => {
    let params: Parameters<typeof sendRemoveSubaccount>[0];
    beforeEach(async () => {
      params = {
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
        relayRouter: multichainSubaccountRouter,
        chainId,
        gelatoRelayFeeToken: wnt.address,
        gelatoRelayFeeAmount: expandDecimals(1, 15),
        deadline: 9999999999,
        srcChainId: chainId, // for non-multichain actions, srcChainId is 0
        desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
      };
    });

    it("DisabledFeature", async () => {
      await dataStore.setBool(keys.gaslessFeatureDisabledKey(multichainSubaccountRouter.address), true);
      await expect(sendRemoveSubaccount(params)).to.be.revertedWithCustomError(errorsContract, "DisabledFeature");
    });

    it("InvalidSignature", async () => {
      await expect(sendRemoveSubaccount({ ...params, signature: BAD_SIGNATURE })).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidSignature"
      );
    });

    it("removes subaccount with relay fee swap", async () => {
      await handleDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(10, 18),
          shortTokenAmount: expandDecimals(10 * 5000, 6),
        },
      });

      const wntBalanceBefore = await wnt.balanceOf(user1.address);
      await dataStore.addAddress(keys.subaccountListKey(user1.address), user0.address);
      expect(await dataStore.getAddressCount(keys.subaccountListKey(user1.address))).to.eq(1);
      await expect(sendRemoveSubaccount({ ...params, signature: "0x1234" })).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidSignature"
      );

      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);
      const feeAmount = expandDecimals(5, 6);

      await sendRemoveSubaccount({
        ...params,
        feeParams: {
          feeToken: usdc.address,
          feeAmount,
          feeSwapPath: [ethUsdMarket.marketToken],
        },
        oracleParams: {
          tokens: [usdc.address, wnt.address],
          providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
          data: ["0x", "0x"],
        },
      });
      await expectBalance(wnt.address, user1.address, wntBalanceBefore);
      expect(await dataStore.getAddressCount(keys.subaccountListKey(user1.address))).to.eq(0);

      expect(createOrderParams.gelatoRelayFeeAmount).gt(0);
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, createOrderParams.gelatoRelayFeeAmount);
    });

    it("swap relay fee with external call", async () => {
      const externalExchange = await deployContract("MockExternalExchange", []);
      await wnt.connect(user1).mint(user1.address, expandDecimals(1, 17));
      await wnt.connect(user1).transfer(externalExchange.address, expandDecimals(1, 17));

      const usdcBalanceBefore = await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address));
      const feeAmount = expandDecimals(10, 6);
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);
      const tx = await sendRemoveSubaccount({
        ...params,
        externalCalls: {
          sendTokens: [usdc.address],
          sendAmounts: [feeAmount],
          externalCallTargets: [externalExchange.address],
          externalCallDataList: [
            externalExchange.interface.encodeFunctionData("transfer", [
              wnt.address,
              multichainSubaccountRouter.address,
              expandDecimals(1, 17),
            ]),
          ],
          refundTokens: [wnt.address],
          refundReceivers: [multichainVault.address],
        },
        feeParams: {
          feeToken: wnt.address,
          feeAmount: 0,
          feeSwapPath: [],
        },
      });

      // feeCollector received in WETH
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, params.gelatoRelayFeeAmount);

      // and user sent correct amount of USDC
      const usdcBalanceAfter = await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address));
      expect(usdcBalanceAfter).eq(usdcBalanceBefore.sub(feeAmount));

      await logGasUsage({
        tx,
        label: "multichainSubaccountRouter.removeSubaccount with external call",
      });
    });
  });

  //#region batch
  describe("batch", () => {
    let batchParams: Parameters<typeof sendBatch>[0];

    beforeEach(async () => {
      batchParams = {
        sender: relaySigner,
        signer: user0,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: expandDecimals(2, 15), // 0.002 ETH
          feeSwapPath: [],
        },
        tokenPermits: [],
        account: user1.address,
        createOrderParamsList: [],
        updateOrderParamsList: [],
        cancelOrderKeys: [],
        deadline: 9999999999,
        relayRouter: multichainSubaccountRouter,
        chainId,
        srcChainId: chainId, // for non-multichain actions, srcChainId is 0
        desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
        gelatoRelayFeeToken: wnt.address,
        gelatoRelayFeeAmount: expandDecimals(1, 15),
        subaccountApprovalSigner: user1,
        subaccount: user0.address,
        subaccountApproval: {
          subaccount: user0.address,
          shouldAdd: true,
          expiresAt: 9999999999,
          maxAllowedCount: 10,
          actionType: keys.SUBACCOUNT_ORDER_ACTION,
          deadline: 9999999999,
          integrationId: integrationId,
        },
      };
    });
    it("DisabledFeature", async () => {
      await dataStore.setBool(keys.gaslessFeatureDisabledKey(multichainSubaccountRouter.address), true);
      await expect(sendBatch({ ...batchParams })).to.be.revertedWithCustomError(errorsContract, "DisabledFeature");
    });

    it("InvalidSignature", async () => {
      await expect(sendBatch({ ...batchParams, signature: BAD_SIGNATURE })).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidSignature"
      );
    });

    it("RelayEmptyBatch", async () => {
      await expect(sendBatch(batchParams)).to.be.revertedWithCustomError(errorsContract, "RelayEmptyBatch");
    });

    it("batch: creates order", async () => {
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);
      const executionFee = expandDecimals(2, 15);
      batchParams.feeParams.feeAmount = expandDecimals(6, 15); // relay fee is 0.001, execution fee is 0.002, 0.003 should be sent back
      batchParams.createOrderParamsList = [defaultCreateOrderParams, defaultCreateOrderParams];
      batchParams.createOrderParamsList[0].numbers.executionFee = executionFee;
      expect(await getOrderCount(dataStore)).eq(0);

      const tx = await sendBatch({
        ...batchParams,
      });

      await logGasUsage({
        tx,
        label: "gelatoRelayRouter batch 2 create orders",
      });

      expect(await getOrderCount(dataStore)).eq(2);
      const orderKeys = await getOrderKeys(dataStore, 0, 2);
      const order = await reader.getOrder(dataStore.address, orderKeys[0]);
      const order2 = await reader.getOrder(dataStore.address, orderKeys[1]);

      expect(order.addresses.account).eq(user1.address);

      expect(order2.addresses.account).eq(user1.address);
      expect(order2.numbers.sizeDeltaUsd).eq(decimalToFloat(1000));
      expect(order2.numbers.acceptablePrice).eq(decimalToFloat(4900));
      expect(order2.numbers.triggerPrice).eq(decimalToFloat(4800));
      expect(order2.numbers.minOutputAmount).eq(700);
      expect(order2.flags.autoCancel).eq(false);

      defaultCreateOrderParams.numbers.initialCollateralDeltaAmount = 500600;
      batchParams.createOrderParamsList = [defaultCreateOrderParams];
      batchParams.cancelOrderKeys = [orderKeys[0]];
      batchParams.updateOrderParamsList = [
        {
          key: orderKeys[1],
          sizeDeltaUsd: 301,
          acceptablePrice: 302,
          triggerPrice: 303,
          minOutputAmount: 304,
          validFromTime: 305,
          autoCancel: true,
          executionFeeIncrease: 0,
        },
      ];
      const tx2 = await sendBatch({
        ...batchParams,
      });

      expect(await getOrderCount(dataStore)).eq(2);

      const orderAfter = await reader.getOrder(dataStore.address, orderKeys[0]);
      expect(orderAfter.addresses.account).eq(ethers.constants.AddressZero);

      const order2After = await reader.getOrder(dataStore.address, orderKeys[1]);
      expect(order2After.numbers.sizeDeltaUsd).eq(301);
      expect(order2After.numbers.acceptablePrice).eq(302);
      expect(order2After.numbers.triggerPrice).eq(303);
      expect(order2After.numbers.minOutputAmount).eq(304);
      expect(order2After.numbers.validFromTime).eq(305);
      expect(order2After.flags.autoCancel).eq(true);

      const orderKeysAfter = await getOrderKeys(dataStore, 0, 2);
      const order3After = await reader.getOrder(dataStore.address, orderKeysAfter[0]);
      expect(order3After.addresses.account).eq(user1.address);
      expect(order3After.numbers.initialCollateralDeltaAmount).eq(500600);

      await logGasUsage({
        tx: tx2,
        label: "gelatoRelayRouter batch 1 cancel order, 1 update order",
      });
    });
  });
});
