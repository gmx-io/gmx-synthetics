import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import * as keys from "../../utils/keys";
import { deployFixture } from "../../utils/fixture";
import { deployContract } from "../../utils/deploy";
import { expandDecimals } from "../../utils/math";
import { encodeDepositMessage, bridgeInTokens } from "../../utils/multichain";
import { getRelayParams } from "../../utils/relay/helpers";
import { getCreateDepositSignature } from "../../utils/relay/multichain";
import { getCreateOrderSignature } from "../../utils/relay/signatures";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import { getDepositCount, getAccountDepositCount, getAccountDepositKeys } from "../../utils/deposit";
import { getOrderCount, OrderType, DecreasePositionSwapType } from "../../utils/order";
import { hashString } from "../../utils/hash";
import { parseLogs, getEventData } from "../../utils/event";
import { errorsContract, errorsInterface } from "../../utils/error";

// LayerZero's EndpointV2.lzCompose can be called by anyone and marks a queued compose message as received
// before calling the composer. A third party can deliver a victim's queued compose message from inside
// their own relay action, while a reentrancy guard or other shared state is held, so the victim's
// follow-up action fails. The failed action is recorded and anyone can retry it later.
describe("LayerZeroProvider compose reentrancy", () => {
  let fixture;
  let attacker, victim, executor, retrier;
  let dataStore,
    reader,
    wnt,
    usdc,
    ethUsdMarket,
    depositVault,
    multichainVault,
    layerZeroProvider,
    multichainGmRouter,
    multichainOrderRouter,
    chainlinkPriceFeedProvider,
    mockStargatePoolUsdc,
    mockStargatePoolNative;
  let chainId;
  let endpoint;

  const wntAmount = expandDecimals(9, 18);
  const usdcAmount = expandDecimals(45_000, 6);
  const executionFee = expandDecimals(4, 15);
  const guid = ethers.utils.hexZeroPad("0x01", 32);
  const RECEIVED = ethers.utils.hexZeroPad("0x01", 32);

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0: attacker, user1: victim, user2: executor, user3: retrier } = fixture.accounts);
    ({
      dataStore,
      reader,
      wnt,
      usdc,
      ethUsdMarket,
      depositVault,
      multichainVault,
      layerZeroProvider,
      multichainGmRouter,
      multichainOrderRouter,
      chainlinkPriceFeedProvider,
      mockStargatePoolUsdc,
      mockStargatePoolNative,
    } = fixture.contracts);

    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    // the mock endpoint carries LayerZero's real compose queue semantics
    endpoint = await deployContract("MockComposeEndpoint", []);

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);

    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);

    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
    // the compose queue lives on the mock endpoint, so that is the enabled endpoint (msg.sender in lzCompose)
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(endpoint.address), true);

    await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), chainId);

    // relay fee is excluded for calls the provider makes on the user's behalf
    await dataStore.setBool(keys.isRelayFeeExcludedKey(layerZeroProvider.address), true);

    // the attacker calls the routers directly, which pays the relay fee to this address
    await dataStore.setAddress(keys.RELAY_FEE_ADDRESS, executor.address);
  });

  function getVictimDepositParams({ externalCalls = undefined, deadline = 9999999999 } = {}) {
    return {
      sender: victim,
      signer: victim,
      externalCalls,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: executionFee,
        feeSwapPath: [],
      },
      transferRequests: {
        tokens: [wnt.address, usdc.address],
        receivers: [depositVault.address, depositVault.address],
        amounts: [wntAmount, usdcAmount],
      },
      account: victim.address,
      params: {
        addresses: {
          receiver: victim.address,
          callbackContract: victim.address,
          uiFeeReceiver: victim.address,
          market: ethUsdMarket.marketToken,
          initialLongToken: ethUsdMarket.longToken,
          initialShortToken: ethUsdMarket.shortToken,
          longTokenSwapPath: [],
          shortTokenSwapPath: [],
        },
        minMarketTokens: 100,
        shouldUnwrapNativeToken: false,
        executionFee,
        callbackGasLimit: "200000",
        dataList: [],
      },
      deadline,
      userNonce: 1,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainGmRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: 0,
    };
  }

  // the victim's bridged USDC arrives at the provider and a deposit compose is queued on the endpoint,
  // exactly as Stargate does on the destination chain, but delivery is deferred to a later lzCompose call
  async function queueVictimDeposit(overrides = {}) {
    await bridgeInTokens(fixture, { account: victim, amount: wntAmount.add(executionFee) });
    await usdc.mint(victim.address, usdcAmount);
    await usdc.connect(victim).approve(mockStargatePoolUsdc.address, usdcAmount);

    const message = await encodeDepositMessage(getVictimDepositParams(overrides), victim.address);

    const tx = await mockStargatePoolUsdc
      .connect(victim)
      .sendTokenQueued(layerZeroProvider.address, endpoint.address, usdcAmount, message, guid);
    const receipt = await tx.wait();

    // the exact queued bytes, needed to later call endpoint.lzCompose and retryAction
    let queuedMessage;
    for (const log of receipt.logs) {
      if (log.address !== endpoint.address) {
        continue;
      }
      const parsed = endpoint.interface.parseLog(log);
      if (parsed.name === "ComposeSent") {
        queuedMessage = parsed.args.message;
      }
    }
    expect(queuedMessage, "queued compose message").to.not.eq(undefined);

    return queuedMessage;
  }

  function getFailedActionKey(queuedMessage) {
    return keys.multichainFailedActionKey(guid, ethers.utils.keccak256(queuedMessage));
  }

  function encodeCompose(queuedMessage) {
    return endpoint.interface.encodeFunctionData("lzCompose", [
      mockStargatePoolUsdc.address,
      layerZeroProvider.address,
      guid,
      0,
      queuedMessage,
      "0x",
    ]);
  }

  function composeQueueEntry() {
    return endpoint.composeQueue(mockStargatePoolUsdc.address, layerZeroProvider.address, guid, 0);
  }

  // the attacker's own valid relay deposit, sent directly to the router, whose signed external call is chosen
  // by the attacker; single-sided WNT so no USDC funding is needed
  async function sendAttackerDeposit(externalCallTarget, externalCallData, userNonce) {
    const attackerFee = expandDecimals(1, 17); // covers the execution fee and the relay fee
    const externalCallSend = expandDecimals(1, 15);
    await bridgeInTokens(fixture, { account: attacker, amount: wntAmount.add(attackerFee).add(externalCallSend) });

    const attackerParams = {
      signer: attacker,
      feeParams: { feeToken: wnt.address, feeAmount: attackerFee, feeSwapPath: [] },
      externalCalls: {
        sendTokens: [wnt.address],
        sendAmounts: [externalCallSend],
        externalCallTargets: [externalCallTarget],
        externalCallDataList: [externalCallData],
        refundTokens: [wnt.address],
        refundReceivers: [multichainVault.address],
      },
      account: attacker.address,
      params: {
        addresses: {
          receiver: attacker.address,
          callbackContract: attacker.address,
          uiFeeReceiver: attacker.address,
          market: ethUsdMarket.marketToken,
          initialLongToken: ethUsdMarket.longToken,
          initialShortToken: ethUsdMarket.shortToken,
          longTokenSwapPath: [],
          shortTokenSwapPath: [],
        },
        minMarketTokens: 0,
        shouldUnwrapNativeToken: false,
        executionFee,
        callbackGasLimit: "0",
        dataList: [],
      },
      transferRequests: {
        tokens: [wnt.address],
        receivers: [depositVault.address],
        amounts: [wntAmount],
      },
      deadline: 9999999999,
      userNonce,
      srcChainId: chainId,
      desChainId: chainId,
    };

    const relayParams = await getRelayParams({ ...attackerParams, relayRouter: multichainGmRouter });
    const signature = await getCreateDepositSignature({
      ...attackerParams,
      relayParams,
      verifyingContract: multichainGmRouter.address,
      chainId,
    });

    const calldata = multichainGmRouter.interface.encodeFunctionData("createDeposit", [
      { ...relayParams, signature },
      attackerParams.account,
      attackerParams.srcChainId,
      attackerParams.transferRequests,
      attackerParams.params,
    ]);

    return attacker.sendTransaction({
      to: multichainGmRouter.address,
      data: ethers.utils.solidityPack(
        ["bytes", "address", "address", "uint256"],
        [calldata, GELATO_RELAY_ADDRESS, wnt.address, 0]
      ),
      gasLimit: 30_000_000,
    });
  }

  // the attacker delivers the victim's compose from a different router than the victim's target,
  // so the victim's target router guard is not held
  async function sendAttackerOrder(queuedMessage, userNonce, oracleParams = undefined) {
    const attackerFee = expandDecimals(1, 17);
    const collateral = expandDecimals(1, 18);
    const externalCallSend = expandDecimals(1, 15);
    await bridgeInTokens(fixture, {
      account: attacker,
      amount: collateral.add(attackerFee).add(externalCallSend),
    });

    const orderParams = {
      addresses: {
        receiver: attacker.address,
        cancellationReceiver: attacker.address,
        callbackContract: attacker.address,
        uiFeeReceiver: attacker.address,
        market: ethUsdMarket.marketToken,
        initialCollateralToken: wnt.address,
        swapPath: [],
      },
      numbers: {
        sizeDeltaUsd: 0,
        initialCollateralDeltaAmount: collateral,
        triggerPrice: 0,
        acceptablePrice: 0,
        executionFee,
        callbackGasLimit: "0",
        minOutputAmount: 0,
        validFromTime: 0,
      },
      orderType: OrderType.MarketIncrease,
      decreasePositionSwapType: DecreasePositionSwapType.NoSwap,
      isLong: true,
      shouldUnwrapNativeToken: false,
      autoCancel: false,
      referralCode: hashString("attacker"),
      dataList: [],
    };

    const relayParams = await getRelayParams({
      signer: attacker,
      oracleParams,
      externalCalls: {
        sendTokens: [wnt.address],
        sendAmounts: [externalCallSend],
        externalCallTargets: [endpoint.address],
        externalCallDataList: [encodeCompose(queuedMessage)],
        refundTokens: [wnt.address],
        refundReceivers: [multichainVault.address],
      },
      feeParams: { feeToken: wnt.address, feeAmount: attackerFee, feeSwapPath: [] },
      userNonce,
      deadline: 9999999999,
      desChainId: chainId,
      relayRouter: multichainOrderRouter,
    });
    const signature = await getCreateOrderSignature({
      signer: attacker,
      relayParams,
      account: attacker.address,
      verifyingContract: multichainOrderRouter.address,
      params: orderParams,
      chainId,
    });

    const calldata = multichainOrderRouter.interface.encodeFunctionData("createOrder", [
      { ...relayParams, signature },
      attacker.address,
      chainId,
      orderParams,
    ]);

    return attacker.sendTransaction({
      to: multichainOrderRouter.address,
      data: ethers.utils.solidityPack(
        ["bytes", "address", "address", "uint256"],
        [calldata, GELATO_RELAY_ADDRESS, wnt.address, 0]
      ),
      gasLimit: 30_000_000,
    });
  }

  function benignExternalCalls() {
    return {
      sendTokens: [wnt.address],
      sendAmounts: [expandDecimals(1, 15)],
      externalCallTargets: [wnt.address],
      externalCallDataList: [wnt.interface.encodeFunctionData("balanceOf", [victim.address])],
      refundTokens: [wnt.address],
      refundReceivers: [multichainVault.address],
    };
  }

  function expectVictimActionFailed(receipt, reason) {
    const failure = getEventData(parseLogs(fixture, receipt), "MultichainBridgeActionFailed");
    expect(failure, "MultichainBridgeActionFailed").to.not.eq(undefined);
    expect(failure.account).eq(victim.address);
    expect(failure.reason).eq(reason);
  }

  // the victim's deposit carries exactly the values the victim signed
  async function expectVictimDeposit() {
    expect(await getAccountDepositCount(dataStore, victim.address)).eq(1);
    const [depositKey] = await getAccountDepositKeys(dataStore, victim.address, 0, 1);
    const deposit = await reader.getDeposit(dataStore.address, depositKey);
    expect(deposit.addresses.account).eq(victim.address);
    expect(deposit.addresses.receiver).eq(victim.address);
    expect(deposit.addresses.market).eq(ethUsdMarket.marketToken);
    expect(deposit.addresses.initialLongToken).eq(ethUsdMarket.longToken);
    expect(deposit.addresses.initialShortToken).eq(ethUsdMarket.shortToken);
    expect(deposit.numbers.initialLongTokenAmount).eq(wntAmount);
    expect(deposit.numbers.initialShortTokenAmount).eq(usdcAmount);
    expect(deposit.numbers.executionFee).eq(executionFee);
    expect(deposit.numbers.minMarketTokens).eq(100);
    expect(deposit.numbers.srcChainId).eq(chainId);
    // the bridged USDC went into the deposit
    expect(await dataStore.getUint(keys.multichainBalanceKey(victim.address, usdc.address))).eq(0);
  }

  it("delivers a queued deposit compose at top level, creates the deposit and records nothing", async () => {
    const queuedMessage = await queueVictimDeposit();

    expect(await getDepositCount(dataStore)).eq(0);
    expect(await composeQueueEntry()).eq(ethers.utils.keccak256(queuedMessage));
    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(usdcAmount);

    // an honest executor delivers the compose at top level
    await endpoint
      .connect(executor)
      .lzCompose(mockStargatePoolUsdc.address, layerZeroProvider.address, guid, 0, queuedMessage, "0x", {
        gasLimit: 30_000_000,
      });

    expect(await getDepositCount(dataStore)).eq(1);
    await expectVictimDeposit();
    expect(await composeQueueEntry()).eq(RECEIVED);
    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(0);

    // nothing failed, so there is nothing to retry
    expect(await dataStore.getBool(getFailedActionKey(queuedMessage))).eq(false);
    await expect(layerZeroProvider.connect(retrier).retryAction(guid, queuedMessage))
      .to.be.revertedWithCustomError(errorsContract, "MultichainFailedActionNotFound")
      .withArgs(guid);
  });

  it("records the victim action when its compose is delivered inside an attacker relay action and lets anyone retry it", async () => {
    const queuedMessage = await queueVictimDeposit();
    expect(await dataStore.getUint(keys.multichainBalanceKey(victim.address, usdc.address))).eq(0);

    const receipt = await (await sendAttackerDeposit(endpoint.address, encodeCompose(queuedMessage), 2)).wait();

    // the attacker's transaction succeeds and the victim's USDC is credited
    expect(receipt.status).eq(1);
    expect(await dataStore.getUint(keys.multichainBalanceKey(victim.address, usdc.address))).eq(usdcAmount);

    // the victim's follow-up failed on the router's reentrancy guard and is recorded
    expectVictimActionFailed(receipt, "ReentrancyGuard: reentrant call");
    expect(await dataStore.getBool(getFailedActionKey(queuedMessage))).eq(true);

    // only the attacker's own deposit exists, and the compose is consumed
    expect(await getDepositCount(dataStore)).eq(1);
    expect(await getAccountDepositCount(dataStore, attacker.address)).eq(1);
    expect(await getAccountDepositCount(dataStore, victim.address)).eq(0);
    expect(await composeQueueEntry()).eq(RECEIVED);
    await expect(
      endpoint
        .connect(executor)
        .lzCompose(mockStargatePoolUsdc.address, layerZeroProvider.address, guid, 0, queuedMessage, "0x", {
          gasLimit: 30_000_000,
        })
    ).to.be.revertedWithCustomError(endpoint, "LZ_ComposeNotFound");

    // a third account retries the recorded action, the victim's deposit is created as signed
    await layerZeroProvider.connect(retrier).retryAction(guid, queuedMessage);

    expect(await getDepositCount(dataStore)).eq(2);
    await expectVictimDeposit();
    expect(await dataStore.getBool(getFailedActionKey(queuedMessage))).eq(false);

    await expect(layerZeroProvider.connect(retrier).retryAction(guid, queuedMessage))
      .to.be.revertedWithCustomError(errorsContract, "MultichainFailedActionNotFound")
      .withArgs(guid);
  });

  it("keeps the record when a retry is nested inside an attacker relay action and allows a later retry", async () => {
    const queuedMessage = await queueVictimDeposit();
    await (await sendAttackerDeposit(endpoint.address, encodeCompose(queuedMessage), 2)).wait();
    expect(await dataStore.getBool(getFailedActionKey(queuedMessage))).eq(true);

    // the attacker nests the retry in its own relay call on the same router, the retry fails again
    // and reverts, which reverts the attacker's call
    const retryCallData = layerZeroProvider.interface.encodeFunctionData("retryAction", [guid, queuedMessage]);
    await expect(sendAttackerDeposit(layerZeroProvider.address, retryCallData, 3))
      .to.be.revertedWithCustomError(errorsContract, "ExternalCallFailed")
      .withArgs(errorsInterface.encodeErrorResult("MultichainActionRetryFailed", [guid]));

    expect(await dataStore.getBool(getFailedActionKey(queuedMessage))).eq(true);
    expect(await getAccountDepositCount(dataStore, victim.address)).eq(0);

    // a later retry at top level succeeds
    await layerZeroProvider.connect(retrier).retryAction(guid, queuedMessage);

    await expectVictimDeposit();
    expect(await dataStore.getBool(getFailedActionKey(queuedMessage))).eq(false);
  });

  it("keeps the record when a retry happens after the victim's relay deadline", async () => {
    const deadline = (await time.latest()) + 3600;
    const queuedMessage = await queueVictimDeposit({ deadline });
    await (await sendAttackerDeposit(endpoint.address, encodeCompose(queuedMessage), 2)).wait();
    expect(await dataStore.getBool(getFailedActionKey(queuedMessage))).eq(true);

    await time.increaseTo(deadline + 1);

    await expect(layerZeroProvider.connect(retrier).retryAction(guid, queuedMessage))
      .to.be.revertedWithCustomError(errorsContract, "MultichainActionRetryFailed")
      .withArgs(guid);

    expect(await dataStore.getBool(getFailedActionKey(queuedMessage))).eq(true);
    expect(await getAccountDepositCount(dataStore, victim.address)).eq(0);
  });

  it("records a victim deposit that carries external calls when delivered from a different router and lets anyone retry it", async () => {
    const queuedMessage = await queueVictimDeposit({ externalCalls: benignExternalCalls() });

    const receipt = await (await sendAttackerOrder(queuedMessage, 5)).wait();
    expect(receipt.status).eq(1);

    // the victim's target router guard is free, the ExternalHandler guard held by the attacker's call is not
    expectVictimActionFailed(receipt, "ReentrancyGuard: reentrant call");
    expect(await dataStore.getBool(getFailedActionKey(queuedMessage))).eq(true);
    expect(await dataStore.getUint(keys.multichainBalanceKey(victim.address, usdc.address))).eq(usdcAmount);
    expect(await getDepositCount(dataStore)).eq(0);
    expect(await getOrderCount(dataStore)).eq(1);
    expect(await composeQueueEntry()).eq(RECEIVED);

    await layerZeroProvider.connect(retrier).retryAction(guid, queuedMessage);

    await expectVictimDeposit();
    expect(await dataStore.getBool(getFailedActionKey(queuedMessage))).eq(false);
  });

  it("delivers a victim deposit without external calls from a different router, creates the deposit and records nothing", async () => {
    // same cross-router delivery, but the victim's deposit has no external calls, so no shared guard is held
    const queuedMessage = await queueVictimDeposit();

    const receipt = await (await sendAttackerOrder(queuedMessage, 6)).wait();
    expect(receipt.status).eq(1);

    expect(getEventData(parseLogs(fixture, receipt), "MultichainBridgeActionFailed")).to.eq(undefined);
    expect(await getDepositCount(dataStore)).eq(1);
    await expectVictimDeposit();
    expect(await getOrderCount(dataStore)).eq(1);
    expect(await dataStore.getBool(getFailedActionKey(queuedMessage))).eq(false);
  });

  it("records a victim deposit delivered while the attacker's relay call holds oracle prices and lets anyone retry it", async () => {
    // same as the delivery above, except the attacker's relay call sets oracle prices, which stay set
    // while its external calls run
    const queuedMessage = await queueVictimDeposit();

    const oracleParams = {
      tokens: [wnt.address],
      providers: [chainlinkPriceFeedProvider.address],
      data: ["0x"],
    };
    const receipt = await (await sendAttackerOrder(queuedMessage, 7, oracleParams)).wait();
    expect(receipt.status).eq(1);

    // the victim's relay call reverts with the NonEmptyTokensWithPrices custom error, which carries no reason string
    expectVictimActionFailed(receipt, "");
    expect(await dataStore.getBool(getFailedActionKey(queuedMessage))).eq(true);
    expect(await dataStore.getUint(keys.multichainBalanceKey(victim.address, usdc.address))).eq(usdcAmount);
    expect(await getDepositCount(dataStore)).eq(0);
    expect(await getOrderCount(dataStore)).eq(1);

    await layerZeroProvider.connect(retrier).retryAction(guid, queuedMessage);

    await expectVictimDeposit();
    expect(await dataStore.getBool(getFailedActionKey(queuedMessage))).eq(false);
  });
});
