import { expect } from "chai";
import {
  impersonateAccount,
  stopImpersonatingAccount,
  setBalance,
  time,
  setNextBlockBaseFeePerGas,
} from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat, bigNumberify, percentageToFloat, applyFactor } from "../../../utils/math";
import { logGasUsage } from "../../../utils/gas";
import { hashString, keccakString } from "../../../utils/hash";
import { OrderType, DecreasePositionSwapType, getOrderKeys, getOrderCount, orderTypeNames } from "../../../utils/order";
import { errorsContract } from "../../../utils/error";
import { expectBalance, expectBalances } from "../../../utils/validation";
import { handleDeposit } from "../../../utils/deposit";
import * as keys from "../../../utils/keys";
import { GELATO_RELAY_ADDRESS } from "../../../utils/relay/addresses";
import {
  getSendCreateOrderCalldata,
  sendBatch,
  sendCancelOrder,
  sendCreateOrder,
  sendUpdateOrder,
} from "../../../utils/relay/gelatoRelay";
import { getTokenPermit } from "../../../utils/relay/tokenPermit";
import { ethers } from "ethers";
import { parseLogs } from "../../../utils/event";
import { deployContract } from "../../../utils/deploy";
import { getRelayParams } from "../../../utils/relay/helpers";
import { getCreateOrderSignature } from "../../../utils/relay/signatures";

const INVALID_SIGNATURE =
  "0x122e3efab9b46c82dc38adf4ea6cd2c753b00f95c217a0e3a0f4dd110839f07a08eb29c1cc414d551349510e23a75219cd70c8b88515ed2b83bbd88216ffdb051f";

const GMX_SIMULATION_ORIGIN = "0x" + keccakString("GMX SIMULATION ORIGIN").slice(-40);

describe("GelatoRelayRouter", () => {
  let fixture;
  let user0, user1, user2, user3;
  let reader,
    dataStore,
    router,
    gelatoRelayRouter,
    orderVault,
    ethUsdMarket,
    wnt,
    usdc,
    wbtc,
    chainlinkPriceFeedProvider,
    externalHandler;
  let relaySigner;
  let chainId;
  const referralCode = hashString("referralCode");

  let defaultParams;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({
      reader,
      dataStore,
      router,
      gelatoRelayRouter,
      orderVault,
      ethUsdMarket,
      wnt,
      usdc,
      wbtc,
      chainlinkPriceFeedProvider,
      externalHandler,
    } = fixture.contracts);

    defaultParams = {
      addresses: {
        receiver: user0.address,
        cancellationReceiver: user0.address,
        callbackContract: user1.address,
        uiFeeReceiver: user2.address,
        market: ethUsdMarket.marketToken,
        initialCollateralToken: ethUsdMarket.longToken,
        swapPath: [ethUsdMarket.marketToken],
      },
      numbers: {
        sizeDeltaUsd: decimalToFloat(1000),
        initialCollateralDeltaAmount: expandDecimals(1, 17),
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
      dataList: [],
    };

    await impersonateAccount(GELATO_RELAY_ADDRESS);
    await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(100, 18));
    await usdc.mint(user0.address, expandDecimals(10000, 6));
    await wnt.connect(user0).deposit({ value: expandDecimals(1000, 18) });

    relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);
    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
  });

  let createOrderParams: Parameters<typeof sendCreateOrder>[0];
  let batchParams: Parameters<typeof sendBatch>[0];

  beforeEach(async () => {
    const tokenPermit = await getTokenPermit(wnt, user0, router.address, expandDecimals(1, 18), 0, 9999999999, chainId);
    createOrderParams = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: expandDecimals(2, 15), // 0.002 ETH
        feeSwapPath: [],
      },
      tokenPermits: [tokenPermit],
      account: user0.address,
      params: defaultParams,
      deadline: 9999999999,
      desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
      relayRouter: gelatoRelayRouter,
      chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: expandDecimals(1, 15),
    };

    batchParams = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: expandDecimals(2, 15), // 0.002 ETH
        feeSwapPath: [],
      },
      tokenPermits: [tokenPermit],
      account: user0.address,
      userNonce: 1,
      createOrderParamsList: [],
      updateOrderParamsList: [],
      cancelOrderKeys: [],
      deadline: 9999999999,
      relayRouter: gelatoRelayRouter,
      chainId,
      desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: expandDecimals(1, 15),
    };
  });

  //#region createOrder
  describe("createOrder", () => {
    it("DisabledFeature", async () => {
      await dataStore.setBool(keys.gaslessFeatureDisabledKey(gelatoRelayRouter.address), true);
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(errorsContract, "DisabledFeature");
    });

    it("InsufficientRelayFee", async () => {
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));
      createOrderParams.feeParams.feeAmount = 1;
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientRelayFee"
      );
    });

    it("InsufficientExecutionFee", async () => {
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));
      await dataStore.setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));
      createOrderParams.feeParams.feeAmount = expandDecimals(1, 15);
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientExecutionFee"
      );
    });

    it("UnsupportedRelayFeeToken", async () => {
      createOrderParams.gelatoRelayFeeToken = usdc.address;
      await expect(
        sendCreateOrder({
          ...createOrderParams,
        })
      ).to.be.revertedWithCustomError(errorsContract, "UnsupportedRelayFeeToken");
    });

    it("InvalidSignature", async () => {
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          signature: INVALID_SIGNATURE,
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");
    });

    it("InvalidRecoveredSigner", async () => {
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          signer: ethers.Wallet.createRandom(),
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidRecoveredSigner");
    });

    it("InvalidUserDigest", async () => {
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));

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
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));

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

    it("relay fee insufficient allowance", async () => {
      await expect(sendCreateOrder({ ...createOrderParams, tokenPermits: [] })).to.be.revertedWith(
        "ERC20: insufficient allowance"
      );
    });

    it("InvalidPermitSpender", async () => {
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
      await usdc.connect(user0).approve(router.address, expandDecimals(1000, 18));
      createOrderParams.feeParams.feeToken = usdc.address;
      createOrderParams.feeParams.feeAmount = expandDecimals(10, 18);
      await expect(sendCreateOrder(createOrderParams)).to.be.revertedWithCustomError(
        errorsContract,
        "UnexpectedRelayFeeToken"
      );
    });

    it("UnexpectedRelayFeeTokenAfterSwap", async () => {
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));
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

    it("execution fee should not be capped", async () => {
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));
      await dataStore.setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));
      await dataStore.setUint(keys.MAX_EXECUTION_FEE_MULTIPLIER_FACTOR, decimalToFloat(1, 10));

      createOrderParams.feeParams.feeAmount = expandDecimals(1, 17);
      createOrderParams.params.numbers.executionFee = "99000000000000000";
      await sendCreateOrder(createOrderParams);
      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      const order = await reader.getOrder(dataStore.address, orderKeys[0]);
      expect(order.numbers.executionFee).eq("99000000000000000");
    });

    it("RelayCalldataTooLong", async () => {
      await dataStore.setAddress(keys.RELAY_FEE_ADDRESS, user3.address);

      const _send = (extraCalldataLength) => {
        createOrderParams.feeParams.feeAmount = expandDecimals(25, 14); // 0.0025 ETH
        return sendCreateOrder({
          ...createOrderParams,
          externalCalls: {
            sendTokens: [wnt.address],
            sendAmounts: [1],
            externalCallTargets: [wnt.address],
            externalCallDataList: [
              wnt.interface.encodeFunctionData("allowance", [GELATO_RELAY_ADDRESS, ethers.constants.AddressZero]) +
                new Array(extraCalldataLength)
                  .fill(null)
                  .map(() => {
                    return Math.random() > 0.5 ? "00" : "ff";
                  })
                  .join(""),
            ],
            refundTokens: [],
            refundReceivers: [],
          },
          sender: user3,
        });
      };

      await expect(_send(50000)).to.be.revertedWithCustomError(errorsContract, "RelayCalldataTooLong");
      await _send(45000);
    });

    describe("creates order and sends relayer fee", () => {
      for (const c of [
        { orderType: OrderType.LimitDecrease, shouldSendCollateral: false },
        { orderType: OrderType.StopLossDecrease, shouldSendCollateral: false },
        { orderType: OrderType.MarketDecrease, shouldSendCollateral: false },
        { orderType: OrderType.LimitIncrease, shouldSendCollateral: true },
        { orderType: OrderType.MarketIncrease, shouldSendCollateral: true },
        { orderType: OrderType.LimitSwap, shouldSendCollateral: true },
        { orderType: OrderType.MarketSwap, shouldSendCollateral: true },
        { orderType: OrderType.StopIncrease, shouldSendCollateral: true },
      ]) {
        it(orderTypeNames[c.orderType], async () => {
          const collateralDeltaAmount = createOrderParams.params.numbers.initialCollateralDeltaAmount;
          const gelatoRelayFeeAmount = createOrderParams.gelatoRelayFeeAmount;

          expect(await wnt.allowance(user0.address, router.address)).to.eq(0);
          await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);
          const executionFee = expandDecimals(2, 15);
          createOrderParams.params.numbers.executionFee = executionFee;
          createOrderParams.params.orderType = c.orderType;
          createOrderParams.feeParams.feeAmount = expandDecimals(6, 15); // relay fee is 0.001, execution fee is 0.002, 0.003 should be sent back
          const userWntBalanceBefore = await wnt.balanceOf(user0.address);
          const marketToken =
            c.orderType == OrderType.MarketSwap || c.orderType == OrderType.LimitSwap
              ? ethers.constants.AddressZero
              : defaultParams.addresses.market;
          createOrderParams.params.addresses.market = marketToken;
          const tx = await sendCreateOrder({
            ...createOrderParams,
          });

          // allowance was set
          let expectedAllowance = expandDecimals(1, 18)
            .sub(gelatoRelayFeeAmount)
            .sub(executionFee)
            .sub(expandDecimals(3, 15)); // 0.003 should be sent back
          if (c.shouldSendCollateral) {
            expectedAllowance = expectedAllowance.sub(collateralDeltaAmount);
          }
          expect(await wnt.allowance(user0.address, router.address)).to.eq(expectedAllowance);
          // relay fee was sent
          await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, gelatoRelayFeeAmount);

          const orderKeys = await getOrderKeys(dataStore, 0, 1);
          const order = await reader.getOrder(dataStore.address, orderKeys[0]);

          expect(order.addresses.account).eq(user0.address);
          expect(order.addresses.receiver).eq(user0.address);
          expect(order.addresses.callbackContract).eq(user1.address);
          expect(order.addresses.market).eq(marketToken);
          expect(order.addresses.initialCollateralToken).eq(ethUsdMarket.longToken);
          expect(order.addresses.swapPath).deep.eq([ethUsdMarket.marketToken]);
          expect(order.numbers.orderType).eq(c.orderType);
          expect(order.numbers.decreasePositionSwapType).eq(DecreasePositionSwapType.SwapCollateralTokenToPnlToken);
          expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(1000));
          expect(order.numbers.initialCollateralDeltaAmount).eq(collateralDeltaAmount);
          expect(order.numbers.triggerPrice).eq(decimalToFloat(4800));
          expect(order.numbers.acceptablePrice).eq(decimalToFloat(4900));
          expect(order.numbers.executionFee).eq(executionFee);
          expect(order.numbers.callbackGasLimit).eq("200000");
          expect(order.numbers.minOutputAmount).eq(700);

          expect(order.flags.isLong).eq(true);
          expect(order.flags.shouldUnwrapNativeToken).eq(true);
          expect(order.flags.isFrozen).eq(false);

          const userWntBalanceAfter = await wnt.balanceOf(user0.address);
          // 0.003 ETH relay fee was sent back
          if (c.shouldSendCollateral) {
            expect(userWntBalanceAfter).eq(userWntBalanceBefore.sub(expandDecimals(3, 15)).sub(collateralDeltaAmount));
          } else {
            expect(userWntBalanceAfter).eq(userWntBalanceBefore.sub(expandDecimals(3, 15)));
          }

          await stopImpersonatingAccount(GELATO_RELAY_ADDRESS);

          await logGasUsage({
            tx,
            label: "gelatoRelayRouter.createOrder",
          });
        });
      }
    });

    it("minified digest signature", async () => {
      expect(await wnt.allowance(user0.address, router.address)).to.eq(0);
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);
      const executionFee = expandDecimals(2, 15);
      createOrderParams.params.numbers.executionFee = executionFee;
      createOrderParams.feeParams.feeAmount = expandDecimals(6, 15); // relay fee is 0.001, execution fee is 0.002, 0.003 should be sent back

      const relayParams = await getRelayParams({ ...createOrderParams, userNonce: 1 });
      const signature = await getCreateOrderSignature({
        ...createOrderParams,
        relayParams,
        verifyingContract: createOrderParams.relayRouter.address,
      });
      await sendCreateOrder({
        ...createOrderParams,
        userNonce: 1,
        signature: signature,
      });

      const relayParams2 = await getRelayParams({ ...createOrderParams, userNonce: 2 });
      const signature2 = await getCreateOrderSignature({
        ...createOrderParams,
        relayParams: relayParams2,
        verifyingContract: createOrderParams.relayRouter.address,
        minified: true,
      });

      // make sure it returned different signature for minified: true
      expect(signature2).not.eq(
        await getCreateOrderSignature({
          ...createOrderParams,
          relayParams: relayParams2,
          verifyingContract: createOrderParams.relayRouter.address,
        })
      );
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          userNonce: 2,
          signature: signature,
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidRecoveredSigner");

      await sendCreateOrder({
        ...createOrderParams,
        userNonce: 2,
        signature: signature2,
      });

      const orderKeys = await getOrderKeys(dataStore, 0, 2);
      expect(orderKeys[0]).not.eq(ethers.constants.HashZero);
      expect(orderKeys[1]).not.eq(ethers.constants.HashZero);

      const order = await reader.getOrder(dataStore.address, orderKeys[0]);
      expect(order.addresses.account).eq(user0.address);

      const order2 = await reader.getOrder(dataStore.address, orderKeys[1]);
      expect(order2.addresses.account).eq(user0.address);

      await stopImpersonatingAccount(GELATO_RELAY_ADDRESS);
    });

    it("sponsoredCall: skips signature validation in gas estimation if tx.origin is GMX_SIMULATION_ORIGIN", async () => {
      await dataStore.setAddress(keys.RELAY_FEE_ADDRESS, user3.address);
      const p = createOrderParams;
      const relayParams = await getRelayParams(p);
      const calldata = p.relayRouter.interface.encodeFunctionData("createOrder", [
        { ...relayParams, signature: ethers.constants.HashZero },
        p.account,
        p.params,
      ]);

      // by default eth_estimateGas should fail if invalid signature is passed
      await expect(
        hre.ethers.provider.estimateGas({
          to: p.relayRouter.address,
          data: calldata,
          from: user3.address,
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");

      // but if tx.origin is zero, it should succeed, allowing gas estimation
      await hre.ethers.provider.estimateGas({
        to: p.relayRouter.address,
        data: calldata,
        from: GMX_SIMULATION_ORIGIN,
      });

      // eth_call just returns the revert message
      const badResult = await hre.ethers.provider.call({
        to: p.relayRouter.address,
        data: calldata,
      });
      const error = errorsContract.interface.parseError(badResult);
      expect(error.name).eq("InvalidSignature");

      const goodResult = await hre.ethers.provider.call({
        to: p.relayRouter.address,
        data: calldata,
        from: GMX_SIMULATION_ORIGIN,
      });
      expect(goodResult.length).eq(66);
      expect(() => {
        // parseError throws if the revert message is not an error
        errorsContract.interface.parseError(goodResult);
      }).to.throw();
    });

    it("sponsoredCall: creates order and sends relayer fee", async () => {
      const collateralDeltaAmount = createOrderParams.params.numbers.initialCollateralDeltaAmount;
      const effectiveRelayFee = "1385965011087720"; // the effective fee calculated and charged by GMX contract
      await dataStore.setAddress(keys.RELAY_FEE_ADDRESS, user3.address);

      const user0WntBalance = await wnt.balanceOf(user0.address);
      expect(await wnt.allowance(user0.address, router.address)).to.eq(0);
      await expectBalance(wnt.address, user3.address, 0);
      const executionFee = expandDecimals(1, 15);
      createOrderParams.params.numbers.executionFee = executionFee;
      createOrderParams.feeParams.feeAmount = expandDecimals(3, 15);
      const tx = await sendCreateOrder({
        ...createOrderParams,
        sender: user3,
      });

      // allowance was set
      expect(await wnt.allowance(user0.address, router.address)).to.eq(
        expandDecimals(1, 18).sub(collateralDeltaAmount).sub(createOrderParams.feeParams.feeAmount)
      );
      // relay fee was sent to relay fee address
      await expectBalance(wnt.address, user3.address, [effectiveRelayFee, bigNumberify(effectiveRelayFee).div(10)]);
      // user received residual amount
      await expectBalance(wnt.address, user0.address, [
        user0WntBalance.sub(executionFee).sub(effectiveRelayFee).sub(collateralDeltaAmount),
        bigNumberify(effectiveRelayFee).div(10),
      ]);

      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      const order = await reader.getOrder(dataStore.address, orderKeys[0]);

      expect(order.addresses.account).eq(user0.address);
      expect(order.addresses.receiver).eq(user0.address);
      expect(order.addresses.callbackContract).eq(user1.address);
      expect(order.addresses.market).eq(ethUsdMarket.marketToken);
      expect(order.addresses.initialCollateralToken).eq(ethUsdMarket.longToken);
      expect(order.addresses.swapPath).deep.eq([ethUsdMarket.marketToken]);
      expect(order.numbers.orderType).eq(OrderType.LimitIncrease);
      expect(order.numbers.decreasePositionSwapType).eq(DecreasePositionSwapType.SwapCollateralTokenToPnlToken);
      expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(1000));
      expect(order.numbers.initialCollateralDeltaAmount).eq(collateralDeltaAmount);
      expect(order.numbers.triggerPrice).eq(decimalToFloat(4800));
      expect(order.numbers.acceptablePrice).eq(decimalToFloat(4900));
      expect(order.numbers.executionFee).eq(executionFee);
      expect(order.numbers.callbackGasLimit).eq("200000");
      expect(order.numbers.minOutputAmount).eq(700);

      expect(order.flags.isLong).eq(true);
      expect(order.flags.shouldUnwrapNativeToken).eq(true);
      expect(order.flags.isFrozen).eq(false);

      await logGasUsage({
        tx,
        label: "gelatoRelayRouter.createOrder",
      });
    });

    it("sponsoredCall: relay fee configuration", async () => {
      await dataStore.setAddress(keys.RELAY_FEE_ADDRESS, user3.address);

      expect(await dataStore.getUint(keys.GELATO_RELAY_FEE_MULTIPLIER_FACTOR)).to.eq(0);
      expect(await dataStore.getUint(keys.GELATO_RELAY_FEE_BASE_AMOUNT)).to.eq(0);
      await expectBalance(wnt.address, user3.address, 0);

      createOrderParams.gelatoRelayFeeAmount = expandDecimals(100, 18);
      createOrderParams.gelatoRelayFeeToken = usdc.address;

      createOrderParams.feeParams.feeAmount = expandDecimals(5, 15);

      await setNextBlockBaseFeePerGas(8);
      // looks like on the first run gas consumption is not optimal, but following runs consume almost the same gas
      await sendCreateOrder({
        ...createOrderParams,
        sender: user3,
      });

      const wntBalance0 = await wnt.balanceOf(user3.address);

      await setNextBlockBaseFeePerGas(8);
      await sendCreateOrder({
        ...createOrderParams,
        sender: user3,
      });
      const wntBalance1 = await wnt.balanceOf(user3.address);
      const effectiveRelayFee = wntBalance1.sub(wntBalance0);

      await dataStore.setUint(keys.GELATO_RELAY_FEE_MULTIPLIER_FACTOR, decimalToFloat(2));
      await setNextBlockBaseFeePerGas(8);
      await sendCreateOrder({
        ...createOrderParams,
        sender: user3,
      });
      const wntBalance2 = await wnt.balanceOf(user3.address);
      const effectiveRelayFee2 = wntBalance2.sub(wntBalance1);
      expect(effectiveRelayFee2).closeTo(effectiveRelayFee.mul(2), effectiveRelayFee.div(1000));

      await dataStore.setUint(keys.GELATO_RELAY_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));
      await setNextBlockBaseFeePerGas(8);
      await sendCreateOrder({
        ...createOrderParams,
        sender: user3,
      });
      const wntBalance3 = await wnt.balanceOf(user3.address);
      const effectiveRelayFee3 = wntBalance3.sub(wntBalance2);
      expect(effectiveRelayFee3).closeTo(effectiveRelayFee, effectiveRelayFee.div(1000));

      await dataStore.setUint(keys.GELATO_RELAY_FEE_BASE_AMOUNT, 100_000);
      await setNextBlockBaseFeePerGas(8);
      const tx = await sendCreateOrder({
        ...createOrderParams,
        sender: user3,
      });
      const wntBalance4 = await wnt.balanceOf(user3.address);
      const effectiveRelayFee4 = wntBalance4.sub(wntBalance3);
      expect(effectiveRelayFee4).closeTo(
        effectiveRelayFee.add(bigNumberify(1000000008).mul(100_000)),
        effectiveRelayFee.div(1000)
      );

      // gelato params should be ignored for sponsoredCalls
      // validate that they were indeed passed
      const bytes = ethers.utils.arrayify(tx.data);
      const [feeReceiverFromCalldata, feeTokenFromCalldata, feeAmountFromCalldata] = [
        ethers.utils.getAddress(ethers.utils.hexlify(bytes.slice(-72, -52))),
        ethers.utils.getAddress(ethers.utils.hexlify(bytes.slice(-52, -32))),
        bigNumberify(ethers.utils.hexlify(bytes.slice(-32))),
      ];

      expect(feeReceiverFromCalldata).eq(GELATO_RELAY_ADDRESS);
      // usdc is not a valid Gelato relay fee token, but it should be ignored for sponsoredCalls
      expect(feeTokenFromCalldata).eq(usdc.address);
      expect(feeAmountFromCalldata).eq(createOrderParams.gelatoRelayFeeAmount);

      // gelato relay address is passed but should be ignored
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);
    });

    it.skip("sponsoredCall: relay fee configuration with swaps");

    it("swap relay fee with external call", async () => {
      const externalExchange = await deployContract("MockExternalExchange", []);
      await wnt.connect(user0).transfer(externalExchange.address, expandDecimals(1, 17));

      await usdc.connect(user0).approve(router.address, expandDecimals(1000, 6));
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));

      const usdcBalanceBefore = await usdc.balanceOf(user0.address);
      const feeAmount = expandDecimals(10, 6);
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);

      // should send at least some tokens
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          externalCalls: {
            sendTokens: [],
            sendAmounts: [],
            externalCallTargets: [externalExchange.address],
            externalCallDataList: [
              externalExchange.interface.encodeFunctionData("transfer", [
                wnt.address,
                gelatoRelayRouter.address,
                expandDecimals(1, 17),
              ]),
            ],
            refundTokens: [],
            refundReceivers: [],
          },
        })
      )
        .to.be.revertedWithCustomError(errorsContract, "InvalidExternalCalls")
        .withArgs(0, 0);

      // sendTokens should match sendAmounts
      await expect(
        sendCreateOrder({
          ...createOrderParams,
          externalCalls: {
            sendTokens: [wnt.address],
            sendAmounts: [2, 3],
            externalCallTargets: [externalExchange.address],
            externalCallDataList: [
              externalExchange.interface.encodeFunctionData("transfer", [
                wnt.address,
                gelatoRelayRouter.address,
                expandDecimals(1, 17),
              ]),
            ],
            refundTokens: [],
            refundReceivers: [],
          },
        })
      )
        .to.be.revertedWithCustomError(errorsContract, "InvalidExternalCalls")
        .withArgs(1, 2);

      const tx = await sendCreateOrder({
        ...createOrderParams,
        externalCalls: {
          sendTokens: [usdc.address],
          sendAmounts: [feeAmount],
          externalCallTargets: [externalExchange.address],
          externalCallDataList: [
            externalExchange.interface.encodeFunctionData("transfer", [
              wnt.address,
              gelatoRelayRouter.address,
              expandDecimals(1, 17),
            ]),
          ],
          refundTokens: [],
          refundReceivers: [],
        },
      });

      await expectBalance(usdc.address, externalHandler.address, feeAmount);
      // feeCollector received in WETH
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, createOrderParams.gelatoRelayFeeAmount);

      // and user sent correct amount of USDC
      const usdcBalanceAfter = await usdc.balanceOf(user0.address);
      expect(usdcBalanceAfter).eq(usdcBalanceBefore.sub(feeAmount));

      await logGasUsage({
        tx,
        label: "gelatoRelayRouter.createOrder with external call",
      });
    });

    it("swap partial relay fee: external calls and direct transfer", async () => {
      const externalExchange = await deployContract("MockExternalExchange", []);
      await wnt.connect(user0).transfer(externalExchange.address, expandDecimals(1, 17));

      await usdc.connect(user0).approve(router.address, expandDecimals(1000, 6));
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));

      const externalCallUsdcFeeAmount = expandDecimals(5, 6); // 0.001 ETH at $5000 per ETH
      const directTransferWntFeeAmount = expandDecimals(1, 15); // 0.001 ETH
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);
      createOrderParams.feeParams.feeAmount = directTransferWntFeeAmount;
      createOrderParams.params.orderType = OrderType.MarketDecrease;

      const usdcBalanceBefore = await usdc.balanceOf(user0.address);
      const wntBalanceBefore = await wnt.balanceOf(user0.address);

      // Gelato expects to receive 0.002 ETH
      // send 5 USDC and swap through external call for 0.001 ETH
      // and send 0.001 WETH directly to Relay Router
      const tx = await sendCreateOrder({
        ...createOrderParams,
        externalCalls: {
          sendTokens: [usdc.address],
          sendAmounts: [externalCallUsdcFeeAmount],
          externalCallTargets: [externalExchange.address],
          externalCallDataList: [
            externalExchange.interface.encodeFunctionData("transfer", [
              wnt.address,
              gelatoRelayRouter.address,
              expandDecimals(1, 15),
            ]),
          ],
          refundTokens: [],
          refundReceivers: [],
        },
        gelatoRelayFeeAmount: expandDecimals(2, 15), // should use sum of externalCallFeeAmount and directTransferFeeAmount
      });

      await expectBalances({
        [user0.address]: {
          [usdc.address]: usdcBalanceBefore.sub(externalCallUsdcFeeAmount), // user sent 5 USDC to external handler
          [wnt.address]: wntBalanceBefore.sub(directTransferWntFeeAmount), // user sent 0.001 WETH to Relay Router
        },
        [GELATO_RELAY_ADDRESS]: {
          [wnt.address]: expandDecimals(2, 15), // total of 0.002 WETH was sent to Gelato Relay
        },
        [externalHandler.address]: {
          [usdc.address]: externalCallUsdcFeeAmount, // 5 USDC was received by external handler
        },
      });

      await logGasUsage({
        tx,
        label: "gelatoRelayRouter.createOrder with external call",
      });
    });

    it("partial relay fee swap: external calls and direct transfer", async () => {
      const externalExchange = await deployContract("MockExternalExchange", []);
      await wnt.connect(user0).transfer(externalExchange.address, expandDecimals(2, 17));

      await usdc.connect(user0).approve(router.address, expandDecimals(1000, 6));
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));

      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);

      const usdcBalanceBefore = await usdc.balanceOf(user0.address);
      const wntBalanceBefore = await wnt.balanceOf(user0.address);
      createOrderParams.feeParams.feeAmount = expandDecimals(1, 15);
      const relayFee = createOrderParams.feeParams.feeAmount;

      // Gelato expects to receive 0.002 ETH
      // send 5 USDC and swap through external call for 0.001 ETH
      // and send 0.001 WETH directly to Relay Router
      createOrderParams.params.numbers.initialCollateralDeltaAmount = expandDecimals(1, 17); // 0.1 WETH
      const tx = await sendCreateOrder({
        ...createOrderParams,
        externalCalls: {
          sendTokens: [usdc.address],
          sendAmounts: [expandDecimals(1000, 6)],
          externalCallTargets: [externalExchange.address],
          externalCallDataList: [
            externalExchange.interface.encodeFunctionData("transfer", [
              wnt.address,
              orderVault.address,
              expandDecimals(2, 17),
            ]),
          ],
          refundTokens: [],
          refundReceivers: [],
        },
      });

      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      const order = await reader.getOrder(dataStore.address, orderKeys[0]);
      expect(order.numbers.initialCollateralDeltaAmount).eq(expandDecimals(3, 17));

      await expectBalances({
        [user0.address]: {
          [usdc.address]: usdcBalanceBefore.sub(expandDecimals(1000, 6)), // user sent 1000 USDC to external handler
          [wnt.address]: wntBalanceBefore.sub(expandDecimals(1, 17)).sub(relayFee), // user sent 0.1 WETH to OrderVault and paid relay fee
        },
        [GELATO_RELAY_ADDRESS]: {
          [wnt.address]: expandDecimals(1, 15), // total of 0.001 WETH was paid to Gelato Relay
        },
        [externalHandler.address]: {
          [usdc.address]: expandDecimals(1000, 6),
        },
      });

      await logGasUsage({
        tx,
        label: "gelatoRelayRouter.createOrder with external call",
      });
    });

    it("swap collateral and relay fee with external call", async () => {
      const externalExchange = await deployContract("MockExternalExchange", []);
      await usdc.mint(externalExchange.address, expandDecimals(1000, 6));
      await wbtc.mint(user0.address, expandDecimals(1, 8));
      await wnt.connect(user0).transfer(externalExchange.address, expandDecimals(1, 18));

      await wnt.connect(user0).approve(router.address, expandDecimals(10, 18));
      await wbtc.connect(user0).approve(router.address, expandDecimals(1, 8));
      expect(await usdc.allowance(user0.address, router.address)).eq(0);

      const usdcBalanceBefore = await usdc.balanceOf(user0.address);
      const wbtcBalanceBefore = await wbtc.balanceOf(user0.address);
      expect(wbtcBalanceBefore).eq(expandDecimals(1, 8));
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);
      createOrderParams.params.addresses.initialCollateralToken = usdc.address;
      createOrderParams.params.addresses.swapPath = [];
      createOrderParams.params.numbers.initialCollateralDeltaAmount = 0;
      createOrderParams.tokenPermits = [];
      const tx0 = await sendCreateOrder(createOrderParams);
      await logGasUsage({
        tx: tx0,
        label: "create order, no swaps or external calls",
      });

      let orderKeys = await getOrderKeys(dataStore, 0, 1);
      const order = await reader.getOrder(dataStore.address, orderKeys[0]);
      expect(order.addresses.initialCollateralToken).eq(usdc.address);
      expect(order.numbers.initialCollateralDeltaAmount).eq(0);

      await expectBalances({
        [user0.address]: {
          [usdc.address]: usdcBalanceBefore,
          [wbtc.address]: wbtcBalanceBefore,
        },
        [externalHandler.address]: {
          [wnt.address]: 0,
          [wbtc.address]: 0,
        },
      });

      const wntBalanceBefore = await wnt.balanceOf(user0.address);

      // do not send WNT, use WBTC from external call
      createOrderParams.feeParams.feeAmount = 0;

      const tx = await sendCreateOrder({
        ...createOrderParams,
        externalCalls: {
          sendTokens: [wnt.address, wbtc.address],
          sendAmounts: [expandDecimals(1, 18), expandDecimals(1, 4)],
          externalCallTargets: [externalExchange.address, externalExchange.address],
          externalCallDataList: [
            externalExchange.interface.encodeFunctionData("transfer", [
              usdc.address,
              orderVault.address,
              expandDecimals(100, 6),
            ]),
            externalExchange.interface.encodeFunctionData("transfer", [
              wnt.address,
              gelatoRelayRouter.address,
              expandDecimals(1, 15),
            ]),
          ],
          refundTokens: [],
          refundReceivers: [],
        },
      });

      await expectBalances({
        [user0.address]: {
          // 1 ETH was transferred from user0
          [wnt.address]: wntBalanceBefore.sub(expandDecimals(1, 18)),
          // 0.0001 BTC was transferred from user0 to external handler
          [wbtc.address]: wbtcBalanceBefore.sub(expandDecimals(1, 4)),
          // user's USDC balance didn't change
          [usdc.address]: usdcBalanceBefore,
        },
        [externalHandler.address]: {
          // 1 WNT was transferred to external handler
          [wnt.address]: expandDecimals(1, 18),
          // and 0.0001 BTC was transferred to external handler
          [wbtc.address]: expandDecimals(1, 4),
        },
      });

      orderKeys = await getOrderKeys(dataStore, 0, 2);
      const order2 = await reader.getOrder(dataStore.address, orderKeys[1]);
      expect(order2.addresses.initialCollateralToken).eq(usdc.address);
      // order was created with 100 USDC received from external handler
      expect(order2.numbers.initialCollateralDeltaAmount).eq(expandDecimals(100, 6));

      await logGasUsage({
        tx,
        label: "create order, swap collateral and relay fee with external call",
      });
    });

    for (const c of [
      {},
      {
        useExternalCalls: true,
        extraCalldataLength: 0,
      },
      {
        useExternalCalls: true,
        extraCalldataLength: 10_000,
      },
      {
        useSwaps: true,
      },
    ]) {
      it(`sponsoredCall: relay fee gas estimation extra calldata ${
        c.extraCalldataLength ?? 0
      } useExternalCalls=${!!c.useExternalCalls} useSwaps=${!!c.useSwaps}`, async () => {
        await dataStore.setAddress(keys.RELAY_FEE_ADDRESS, user3.address);
        await dataStore.setUint(keys.GELATO_RELAY_FEE_BASE_AMOUNT, 40_000);
        const gelatoRelay = await deployContract("GelatoRelay", []);

        const externalExchange = await deployContract("MockExternalExchange", []);
        await wnt.connect(user0).transfer(externalExchange.address, expandDecimals(1, 17));

        await usdc.connect(user0).approve(router.address, expandDecimals(1000, 6));
        await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));

        if (c.useExternalCalls) {
          const extraCalldata = c.extraCalldataLength
            ? new Array(c.extraCalldataLength)
                .fill(null)
                .map(() => {
                  return Math.random() > 0.5 ? "00" : "ff";
                })
                .join("")
            : "";
          createOrderParams.externalCalls = {
            sendTokens: [wnt.address],
            sendAmounts: [expandDecimals(1, 15)],
            externalCallTargets: [externalExchange.address],
            externalCallDataList: [
              externalExchange.interface.encodeFunctionData("transfer", [
                wnt.address,
                gelatoRelayRouter.address,
                expandDecimals(1, 17),
              ]) + extraCalldata,
            ],
            refundTokens: [],
            refundReceivers: [],
          };
        }

        if (c.useSwaps) {
          await handleDeposit(fixture, {
            create: {
              longTokenAmount: expandDecimals(10, 18),
              shortTokenAmount: expandDecimals(10 * 5000, 6),
            },
          });

          createOrderParams.feeParams.feeToken = usdc.address;
          createOrderParams.feeParams.feeAmount = expandDecimals(15, 6);
          createOrderParams.feeParams.feeSwapPath = [ethUsdMarket.marketToken];
          createOrderParams.oracleParams = {
            tokens: [usdc.address, wnt.address],
            providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
            data: ["0x", "0x"],
          };
        }

        if (!c.useSwaps && !c.useExternalCalls) {
          createOrderParams.feeParams.feeToken = wnt.address;
          createOrderParams.feeParams.feeAmount = expandDecimals(2, 15);
        }

        const calldata = await getSendCreateOrderCalldata({
          ...createOrderParams,
        });

        const tx = await gelatoRelay.sponsoredCall(
          {
            chainId: 1,
            data: calldata,
            target: gelatoRelayRouter.address,
          },
          user0.address,
          user0.address,
          0,
          0,
          0,
          ethers.constants.HashZero,
          {
            gasLimit: 10_000_000,
          }
        );

        const receipt = await logGasUsage({
          tx,
          label: "gelatoRelayRouter.createOrder with external call",
        });

        const relayFee = await wnt.balanceOf(user3.address);
        console.log(
          "tx gas %s fee %s ETH",
          receipt.gasUsed,
          ethers.utils.formatEther(receipt.gasUsed.mul(receipt.effectiveGasPrice))
        );
        console.log(
          "relay gas %s fee %s ETH",
          relayFee.div(receipt.effectiveGasPrice),
          ethers.utils.formatEther(relayFee)
        );
      });
    }

    it("swap relay fee", async () => {
      // relay fee swap size should not be validated for non-subaccount orders
      // so set the threshold to 0 to make sure swaps work correctly
      expect(await dataStore.getUint(keys.MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT)).eq(0);

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

      await usdc.connect(user0).approve(router.address, expandDecimals(1000, 6));
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));

      createOrderParams.params.numbers.executionFee = expandDecimals(98, 13); // 0.00098 WETH

      const usdcBalanceBefore = await usdc.balanceOf(user0.address);
      const feeAmount = expandDecimals(10, 6);
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);
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
      expect(order.numbers.executionFee).eq(expandDecimals(98, 13));

      // feeCollector received in WETH
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, createOrderParams.gelatoRelayFeeAmount);

      // and user sent correct amount of USDC
      const usdcBalanceAfter = await usdc.balanceOf(user0.address);
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
      const tokenPermit = await getTokenPermit(
        wnt,
        user0,
        router.address,
        expandDecimals(1, 18),
        0,
        9999999999,
        chainId
      );
      updateOrderParams = {
        sender: relaySigner,
        signer: user0,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: expandDecimals(2, 15), // 0.002 ETH
          feeSwapPath: [],
        },
        tokenPermits: [tokenPermit],
        account: user0.address,
        params: {
          key: ethers.constants.HashZero,
          sizeDeltaUsd: decimalToFloat(1),
          acceptablePrice: decimalToFloat(2),
          triggerPrice: decimalToFloat(3),
          minOutputAmount: 4,
          validFromTime: 5,
          autoCancel: true,
          executionFeeIncrease: 0,
        },
        deadline: 9999999999,
        desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
        relayRouter: gelatoRelayRouter,
        chainId,
        gelatoRelayFeeToken: wnt.address,
        gelatoRelayFeeAmount: expandDecimals(1, 15),
      };
    });

    it("DisabledFeature", async () => {
      await dataStore.setBool(keys.gaslessFeatureDisabledKey(gelatoRelayRouter.address), true);
      await expect(sendUpdateOrder(updateOrderParams)).to.be.revertedWithCustomError(errorsContract, "DisabledFeature");
    });

    it("InsufficientRelayFee", async () => {
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));
      await sendCreateOrder(createOrderParams);
      const orderKeys = await getOrderKeys(dataStore, 0, 1);

      updateOrderParams.feeParams.feeAmount = 1;
      updateOrderParams.params.key = orderKeys[0];
      await expect(sendUpdateOrder({ ...updateOrderParams })).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientRelayFee"
      );
    });

    it("InvalidSignature", async () => {
      await expect(
        sendUpdateOrder({
          ...updateOrderParams,
          signature: INVALID_SIGNATURE,
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");
    });

    it("InvalidRecoveredSigner", async () => {
      await expect(
        sendUpdateOrder({
          ...updateOrderParams,
          signer: ethers.Wallet.createRandom(),
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidRecoveredSigner");
    });

    it("Unauthorized", async () => {
      await wnt.connect(user1).deposit({ value: expandDecimals(1000, 18) });
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
      await sendCreateOrder({ ...createOrderParams, account: user1.address, signer: user1 });
      const orderKeys = await getOrderKeys(dataStore, 0, 1);

      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));
      updateOrderParams.params.key = orderKeys[0];
      await expect(sendUpdateOrder({ ...updateOrderParams })).to.be.revertedWithCustomError(
        errorsContract,
        "Unauthorized"
      );
    });

    it("relay fee insufficient allowance", async () => {
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));
      await sendCreateOrder(createOrderParams);
      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      await wnt.connect(user0).approve(router.address, 0);

      updateOrderParams.params.key = orderKeys[0];
      await expect(sendUpdateOrder({ ...updateOrderParams })).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("updates order and sends relay fee", async () => {
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));
      await sendCreateOrder(createOrderParams);
      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      let order = await reader.getOrder(dataStore.address, orderKeys[0]);

      expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(1000));
      expect(order.numbers.acceptablePrice).eq(decimalToFloat(4900));
      expect(order.numbers.triggerPrice).eq(decimalToFloat(4800));
      expect(order.numbers.minOutputAmount).eq(700);
      expect(order.numbers.validFromTime).eq(0);
      expect(order.flags.autoCancel).eq(false);

      const gelatoRelayFee = updateOrderParams.gelatoRelayFeeAmount;
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, gelatoRelayFee);
      updateOrderParams.params.key = orderKeys[0];
      await sendUpdateOrder({ ...updateOrderParams });
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, bigNumberify(gelatoRelayFee).mul(2));

      order = await reader.getOrder(dataStore.address, orderKeys[0]);

      expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(1));
      expect(order.numbers.acceptablePrice).eq(decimalToFloat(2));
      expect(order.numbers.triggerPrice).eq(decimalToFloat(3));
      expect(order.numbers.minOutputAmount).eq(4);
      expect(order.numbers.validFromTime).eq(5);
      expect(order.flags.autoCancel).eq(true);
    });

    it("increases execution fee", async () => {
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));
      createOrderParams.params.numbers.executionFee = expandDecimals(1, 15);
      await sendCreateOrder(createOrderParams);
      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      let order = await reader.getOrder(dataStore.address, orderKeys[0]);

      updateOrderParams.gelatoRelayFeeAmount = expandDecimals(1, 15);
      updateOrderParams.feeParams.feeAmount = expandDecimals(3, 15);

      const initialWethBalance = await wnt.balanceOf(user0.address);
      const gelatoRelayFee = updateOrderParams.gelatoRelayFeeAmount;
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, gelatoRelayFee);
      updateOrderParams.params.key = orderKeys[0];
      await sendUpdateOrder({ ...updateOrderParams });
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, bigNumberify(gelatoRelayFee).mul(2));

      // user receives the residual amount
      await expectBalance(wnt.address, user0.address, initialWethBalance.sub(expandDecimals(1, 15)));
      // and the execution fee stays the same
      order = await reader.getOrder(dataStore.address, orderKeys[0]);
      expect(order.numbers.executionFee).eq(expandDecimals(1, 15));

      updateOrderParams.params.executionFeeIncrease = expandDecimals(2, 15);
      updateOrderParams.params.key = orderKeys[0];
      await sendUpdateOrder(updateOrderParams);

      // user doesn't receive the residual amount
      await expectBalance(wnt.address, user0.address, initialWethBalance.sub(expandDecimals(4, 15)));
      // and the execution fee is increased
      order = await reader.getOrder(dataStore.address, orderKeys[0]);
      expect(order.numbers.executionFee).eq(expandDecimals(3, 15));
    });
  });

  //#region cancelOrder
  describe("cancelOrder", () => {
    let cancelOrderParams: Parameters<typeof sendCancelOrder>[0];

    beforeEach(async () => {
      const tokenPermit = await getTokenPermit(
        wnt,
        user0,
        router.address,
        expandDecimals(1, 18),
        0,
        9999999999,
        chainId
      );
      cancelOrderParams = {
        sender: relaySigner,
        signer: user0,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: expandDecimals(2, 15), // 0.002 ETH
          feeSwapPath: [],
        },
        tokenPermits: [tokenPermit],
        key: ethers.constants.HashZero,
        account: user0.address,
        deadline: 9999999999,
        desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
        relayRouter: gelatoRelayRouter,
        chainId,
        gelatoRelayFeeToken: wnt.address,
        gelatoRelayFeeAmount: expandDecimals(1, 15),
      };
    });

    it("DisabledFeature", async () => {
      await dataStore.setBool(keys.gaslessFeatureDisabledKey(gelatoRelayRouter.address), true);
      await expect(sendCancelOrder(cancelOrderParams)).to.be.revertedWithCustomError(errorsContract, "DisabledFeature");
    });

    it("InsufficientRelayFee", async () => {
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));
      await sendCreateOrder(createOrderParams);
      const orderKeys = await getOrderKeys(dataStore, 0, 1);

      cancelOrderParams.feeParams.feeAmount = 1;
      await expect(sendCancelOrder({ ...cancelOrderParams, key: orderKeys[0] })).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientRelayFee"
      );
    });

    it("InvalidSignature", async () => {
      await expect(
        sendCancelOrder({
          ...cancelOrderParams,
          signature: INVALID_SIGNATURE,
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidSignature");
    });

    it("InvalidRecoveredSigner", async () => {
      await expect(
        sendCancelOrder({
          ...cancelOrderParams,
          signer: ethers.Wallet.createRandom(),
        })
      ).to.be.revertedWithCustomError(errorsContract, "InvalidRecoveredSigner");
    });

    it("Unauthorized", async () => {
      await wnt.connect(user1).deposit({ value: expandDecimals(1000, 18) });
      await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));
      await sendCreateOrder({ ...createOrderParams, account: user1.address, signer: user1 });
      const orderKeys = await getOrderKeys(dataStore, 0, 1);

      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));
      await expect(sendCancelOrder({ ...cancelOrderParams, key: orderKeys[0] })).to.be.revertedWithCustomError(
        errorsContract,
        "Unauthorized"
      );
    });

    it("cancels order and sends relay fee", async () => {
      await wnt.connect(user0).approve(router.address, expandDecimals(1, 18));
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

  //#region batch
  describe("batch", () => {
    it("DisabledFeature", async () => {
      await dataStore.setBool(keys.gaslessFeatureDisabledKey(gelatoRelayRouter.address), true);
      await expect(sendBatch({ ...batchParams })).to.be.revertedWithCustomError(errorsContract, "DisabledFeature");
    });

    it("InvalidSignature", async () => {
      await expect(sendBatch({ ...batchParams, signature: INVALID_SIGNATURE })).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidSignature"
      );
    });

    it("InvalidRecoveredSigner", async () => {
      await expect(sendBatch({ ...batchParams, signer: ethers.Wallet.createRandom() })).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidRecoveredSigner"
      );
    });

    it("RelayEmptyBatch", async () => {
      await expect(sendBatch(batchParams)).to.be.revertedWithCustomError(errorsContract, "RelayEmptyBatch");
    });

    it("batch: creates, updates and cancels order", async () => {
      expect(await wnt.allowance(user0.address, router.address)).to.eq(0);
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, 0);
      const executionFee = expandDecimals(2, 15);
      batchParams.feeParams.feeAmount = expandDecimals(6, 15); // relay fee is 0.001, execution fee is 0.002, 0.003 should be sent back
      batchParams.createOrderParamsList = [defaultParams, defaultParams];
      batchParams.createOrderParamsList[0].numbers.executionFee = executionFee;
      batchParams.createOrderParamsList[1].numbers.executionFee = executionFee;
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

      expect(order.addresses.account).eq(user0.address);

      expect(order2.addresses.account).eq(user0.address);
      expect(order2.numbers.sizeDeltaUsd).eq(decimalToFloat(1000));
      expect(order2.numbers.acceptablePrice).eq(decimalToFloat(4900));
      expect(order2.numbers.triggerPrice).eq(decimalToFloat(4800));
      expect(order2.numbers.minOutputAmount).eq(700);
      expect(order2.flags.autoCancel).eq(false);

      defaultParams.numbers.initialCollateralDeltaAmount = 500600;
      batchParams.createOrderParamsList = [defaultParams];
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
          executionFeeIncrease: expandDecimals(1, 15),
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
      expect(order3After.addresses.account).eq(user0.address);
      expect(order3After.numbers.initialCollateralDeltaAmount).eq(500600);

      await logGasUsage({
        tx: tx2,
        label: "gelatoRelayRouter batch 1 create order, 1 cancel order, 1 update order",
      });
    });
  });

  it.skip("swaps should not work if sequencer is down");
});
