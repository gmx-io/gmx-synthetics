import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import * as keys from "../../utils/keys";
import { deployFixture } from "../../utils/fixture";
import { deployContract } from "../../utils/deploy";
import { expandDecimals } from "../../utils/math";
import { grantRole } from "../../utils/role";
import { hashString } from "../../utils/hash";
import { errorsContract } from "../../utils/error";
import { parseLogs, getEventData } from "../../utils/event";
import { encodeRegisterCodeMessage } from "../../utils/multichain";
import { getRefundComposePayload, executeTimelock } from "../../utils/timelock";

// Stargate delivers bridged tokens to LayerZeroProvider before the compose message is executed, and the provider
// keeps every pending delivery of a token in one balance. A compose that reverted stays queued on the endpoint,
// where anyone can deliver it later with any value. A refund of its tokens marks the message first, so that a
// later delivery credits nothing instead of taking the next delivery of the same token.
describe("LayerZeroProvider refund compose", () => {
  let fixture;
  let wallet, refundedUser, laterUser, bystander, timelockAdmin;
  let dataStore,
    roleStore,
    timelockConfig,
    usdc,
    wnt,
    multichainVault,
    layerZeroProvider,
    multichainOrderRouter,
    referralStorage,
    mockStargatePoolUsdc,
    mockStargatePoolNative;
  let chainId;
  let endpoint;

  const usdcAmount = expandDecimals(100, 6);
  const ethAmount = expandDecimals(1, 18);
  const topUp = 1; // 1 wei of native top-up asked for in the message
  const RECEIVED = ethers.utils.hexZeroPad("0x01", 32);
  const guid1 = ethers.utils.hexZeroPad("0x01", 32);
  const guid2 = ethers.utils.hexZeroPad("0x02", 32);
  const salt = ethers.utils.hexZeroPad("0x01", 32);
  const delay = 1 * 24 * 60 * 60 + 10;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0: refundedUser, user1: laterUser, user2: bystander, user3: timelockAdmin } = fixture.accounts);
    ({
      dataStore,
      roleStore,
      timelockConfig,
      usdc,
      wnt,
      multichainVault,
      layerZeroProvider,
      multichainOrderRouter,
      referralStorage,
      mockStargatePoolUsdc,
      mockStargatePoolNative,
    } = fixture.contracts);

    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    // the mock endpoint carries LayerZero's real compose queue semantics
    endpoint = await deployContract("MockComposeEndpoint", []);

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(endpoint.address), true);
    await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), chainId);
  });

  // a bridge-in without a follow-up action; expectedNativeValue is the native top-up the message asks for
  function encodeBridgeInMessage(account, expectedNativeValue = 0) {
    const data =
      expectedNativeValue == 0
        ? "0x"
        : ethers.utils.defaultAbiCoder.encode(
            ["uint8", "uint256", "bytes"],
            [0 /* ActionType.None */, expectedNativeValue, "0x"]
          );
    return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account.address, data]);
  }

  function getQueuedMessage(receipt) {
    for (const log of receipt.logs) {
      if (log.address !== endpoint.address) {
        continue;
      }
      const parsed = endpoint.interface.parseLog(log);
      if (parsed.name === "ComposeSent") {
        return parsed.args.message;
      }
    }
    throw new Error("no ComposeSent event");
  }

  // Stargate's destination-chain behaviour: the tokens land on the provider, the compose is queued on the endpoint
  async function queueUsdcBridgeIn(user, guid, expectedNativeValue = 0, message = undefined) {
    await usdc.mint(user.address, usdcAmount);
    await usdc.connect(user).approve(mockStargatePoolUsdc.address, usdcAmount);
    const tx = await mockStargatePoolUsdc
      .connect(user)
      .sendTokenQueued(
        layerZeroProvider.address,
        endpoint.address,
        usdcAmount,
        message || encodeBridgeInMessage(user, expectedNativeValue),
        guid
      );
    return getQueuedMessage(await tx.wait());
  }

  async function queueEthBridgeIn(user, guid, expectedNativeValue = 0) {
    const tx = await mockStargatePoolNative
      .connect(user)
      .sendTokenQueued(
        layerZeroProvider.address,
        endpoint.address,
        ethAmount,
        encodeBridgeInMessage(user, expectedNativeValue),
        guid,
        { value: ethAmount }
      );
    return getQueuedMessage(await tx.wait());
  }

  // endpoint.lzCompose: anyone, any msg.value
  function deliver(pool, caller, guid, queuedMessage, value = 0, gasLimit = undefined) {
    return endpoint
      .connect(caller)
      .lzCompose(pool.address, layerZeroProvider.address, guid, 0, queuedMessage, "0x", { value, gasLimit });
  }

  function queueEntry(pool, guid) {
    return endpoint.composeQueue(pool.address, layerZeroProvider.address, guid, 0);
  }

  function multichainBalance(user, token) {
    return dataStore.getUint(keys.multichainBalanceKey(user.address, token.address));
  }

  function refundedKey(guid, queuedMessage) {
    return keys.multichainRefundedComposeKey(guid, ethers.utils.keccak256(queuedMessage));
  }

  // the wallet holds CONTROLLER in the fixture, the timelock controller does in production
  function refund(pool, guid, queuedMessage, receiver) {
    return layerZeroProvider
      .connect(wallet)
      .refundCompose(endpoint.address, pool.address, guid, queuedMessage, receiver.address);
  }

  function signalRefund(pool, guid, queuedMessage, receiver) {
    return timelockConfig
      .connect(timelockAdmin)
      .signalRefundCompose(
        layerZeroProvider.address,
        endpoint.address,
        pool.address,
        guid,
        queuedMessage,
        receiver.address,
        ethers.constants.HashZero,
        salt
      );
  }

  async function executeRefund(pool, guid, queuedMessage, receiver) {
    const { target, payload } = await getRefundComposePayload(
      endpoint.address,
      pool.address,
      guid,
      queuedMessage,
      receiver.address
    );
    return executeTimelock(timelockAdmin, target, payload, ethers.constants.HashZero, salt);
  }

  it("refunded message credits nothing when delivered later and the next user keeps their tokens", async () => {
    // a 100 USDC bridge-in asks for a 1 wei top-up; the executor delivers without value, the compose reverts
    // and stays queued, the USDC stays on the provider
    const message1 = await queueUsdcBridgeIn(refundedUser, guid1, topUp);
    await expect(deliver(mockStargatePoolUsdc, bystander, guid1, message1, 0))
      .to.be.revertedWithCustomError(errorsContract, "InsufficientNativeTokenAmount")
      .withArgs(0, topUp);
    expect(await queueEntry(mockStargatePoolUsdc, guid1)).eq(ethers.utils.keccak256(message1));
    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(usdcAmount);
    expect(await usdc.balanceOf(refundedUser.address)).eq(0);

    // the refund marks the message and sends its tokens to the receiver; the endpoint still holds the message
    const refundReceipt = await (await refund(mockStargatePoolUsdc, guid1, message1, refundedUser)).wait();
    expect(await usdc.balanceOf(refundedUser.address)).eq(usdcAmount);
    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(0);
    expect(await dataStore.getBool(refundedKey(guid1, message1))).eq(true);
    expect(await queueEntry(mockStargatePoolUsdc, guid1)).eq(ethers.utils.keccak256(message1));

    const refunded = getEventData(parseLogs(fixture, refundReceipt), "MultichainComposeRefunded");
    expect(refunded.provider).eq(layerZeroProvider.address);
    expect(refunded.from).eq(mockStargatePoolUsdc.address);
    expect(refunded.token).eq(usdc.address);
    expect(refunded.receiver).eq(refundedUser.address);
    expect(refunded.guid).eq(guid1);
    expect(refunded.amount).eq(usdcAmount);

    // another user bridges 100 USDC; the tokens sit on the provider until the executor's compose call
    const message2 = await queueUsdcBridgeIn(laterUser, guid2);
    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(usdcAmount);

    // anyone delivers the refunded message with the 1 wei top-up: nothing is credited, nothing leaves the
    // provider, the endpoint retires the message
    const deliveryReceipt = await (await deliver(mockStargatePoolUsdc, bystander, guid1, message1, topUp)).wait();
    expect(await queueEntry(mockStargatePoolUsdc, guid1)).eq(RECEIVED);
    expect(await multichainBalance(refundedUser, usdc)).eq(0);
    expect(await multichainBalance(refundedUser, wnt)).eq(0);
    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(usdcAmount);
    expect(await usdc.balanceOf(multichainVault.address)).eq(0);
    // value sent along with a refunded message is not credited either, it stays on the provider
    expect(await ethers.provider.getBalance(layerZeroProvider.address)).eq(topUp);

    const parsedDeliveryLogs = parseLogs(fixture, deliveryReceipt);
    expect(getEventData(parsedDeliveryLogs, "MultichainBridgeIn")).eq(undefined);
    const delivered = getEventData(parsedDeliveryLogs, "MultichainRefundedComposeDelivered");
    expect(delivered.provider).eq(layerZeroProvider.address);
    expect(delivered.from).eq(mockStargatePoolUsdc.address);
    expect(delivered.guid).eq(guid1);

    // the retired message cannot be delivered again
    await expect(deliver(mockStargatePoolUsdc, bystander, guid1, message1, topUp)).to.be.revertedWithCustomError(
      endpoint,
      "LZ_ComposeNotFound"
    );

    // the later user's delivery is still backed by their own tokens
    await deliver(mockStargatePoolUsdc, bystander, guid2, message2, 0);
    expect(await queueEntry(mockStargatePoolUsdc, guid2)).eq(RECEIVED);
    expect(await multichainBalance(laterUser, usdc)).eq(usdcAmount);
    expect(await usdc.balanceOf(multichainVault.address)).eq(usdcAmount);
    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(0);

    // tally: the refunded account has its 100 USDC back on its wallet and no multichain balance,
    // the later user has the 100 USDC they bridged
    expect(await usdc.balanceOf(refundedUser.address)).eq(usdcAmount);
    expect(await multichainBalance(refundedUser, usdc)).eq(0);
    expect(await multichainBalance(laterUser, usdc)).eq(usdcAmount);
  });

  it("refund through TimelockConfig signal, delay and execute", async () => {
    await grantRole(roleStore, timelockAdmin.address, "TIMELOCK_ADMIN");

    const message1 = await queueUsdcBridgeIn(refundedUser, guid1, topUp);
    await expect(deliver(mockStargatePoolUsdc, bystander, guid1, message1, 0)).to.be.revertedWithCustomError(
      errorsContract,
      "InsufficientNativeTokenAmount"
    );

    // the production path: signal, wait out the delay, execute
    await signalRefund(mockStargatePoolUsdc, guid1, message1, refundedUser);
    await time.increase(delay);
    await executeRefund(mockStargatePoolUsdc, guid1, message1, refundedUser);

    expect(await usdc.balanceOf(refundedUser.address)).eq(usdcAmount);
    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(0);
    expect(await dataStore.getBool(refundedKey(guid1, message1))).eq(true);

    const message2 = await queueUsdcBridgeIn(laterUser, guid2);
    await deliver(mockStargatePoolUsdc, bystander, guid1, message1, topUp);
    expect(await multichainBalance(refundedUser, usdc)).eq(0);
    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(usdcAmount);

    await deliver(mockStargatePoolUsdc, bystander, guid2, message2, 0);
    expect(await multichainBalance(laterUser, usdc)).eq(usdcAmount);
  });

  it("refund of a message that was delivered in the meantime reverts", async () => {
    await grantRole(roleStore, timelockAdmin.address, "TIMELOCK_ADMIN");

    const message1 = await queueUsdcBridgeIn(refundedUser, guid1, topUp);
    await signalRefund(mockStargatePoolUsdc, guid1, message1, refundedUser);

    // anyone completes the message with the missing value while the refund waits for the delay
    await deliver(mockStargatePoolUsdc, bystander, guid1, message1, topUp);
    expect(await queueEntry(mockStargatePoolUsdc, guid1)).eq(RECEIVED);
    expect(await multichainBalance(refundedUser, usdc)).eq(usdcAmount);

    // the provider holds another user's delivery, so only the endpoint check can stop the refund
    await queueUsdcBridgeIn(laterUser, guid2);
    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(usdcAmount);

    await time.increase(delay);
    await expect(executeRefund(mockStargatePoolUsdc, guid1, message1, refundedUser)).to.be.revertedWith(
      "TimelockController: underlying transaction reverted"
    );
    await expect(refund(mockStargatePoolUsdc, guid1, message1, refundedUser))
      .to.be.revertedWithCustomError(errorsContract, "MultichainComposeNotFound")
      .withArgs(guid1);

    expect(await dataStore.getBool(refundedKey(guid1, message1))).eq(false);
    expect(await usdc.balanceOf(refundedUser.address)).eq(0);
    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(usdcAmount);
  });

  it("refund of a message the endpoint does not hold reverts", async () => {
    const message1 = await queueUsdcBridgeIn(refundedUser, guid1, topUp);

    // a guid that was never queued
    await expect(refund(mockStargatePoolUsdc, guid2, message1, refundedUser))
      .to.be.revertedWithCustomError(errorsContract, "MultichainComposeNotFound")
      .withArgs(guid2);

    // the queued guid with a message whose amount was doubled
    const forgedMessage = ethers.utils.hexConcat([
      ethers.utils.hexDataSlice(message1, 0, 12),
      ethers.utils.hexZeroPad(usdcAmount.mul(2).toHexString(), 32),
      ethers.utils.hexDataSlice(message1, 44),
    ]);
    await expect(refund(mockStargatePoolUsdc, guid1, forgedMessage, refundedUser))
      .to.be.revertedWithCustomError(errorsContract, "MultichainComposeNotFound")
      .withArgs(guid1);

    // the queued message under a pool that did not queue it
    await expect(refund(mockStargatePoolNative, guid1, message1, refundedUser))
      .to.be.revertedWithCustomError(errorsContract, "MultichainComposeNotFound")
      .withArgs(guid1);

    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(usdcAmount);
    expect(await usdc.balanceOf(refundedUser.address)).eq(0);
    expect(await dataStore.getBool(refundedKey(guid1, message1))).eq(false);
  });

  it("second refund of the same message reverts", async () => {
    const message1 = await queueUsdcBridgeIn(refundedUser, guid1, topUp);
    await refund(mockStargatePoolUsdc, guid1, message1, refundedUser);
    expect(await usdc.balanceOf(refundedUser.address)).eq(usdcAmount);

    // another user's delivery backs the provider again while the refunded message is still queued
    await queueUsdcBridgeIn(laterUser, guid2);
    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(usdcAmount);
    expect(await queueEntry(mockStargatePoolUsdc, guid1)).eq(ethers.utils.keccak256(message1));

    await expect(refund(mockStargatePoolUsdc, guid1, message1, refundedUser))
      .to.be.revertedWithCustomError(errorsContract, "MultichainComposeAlreadyRefunded")
      .withArgs(guid1);

    expect(await usdc.balanceOf(refundedUser.address)).eq(usdcAmount);
    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(usdcAmount);
  });

  it("refunded native delivery credits nothing when delivered later and the next user keeps their ETH", async () => {
    const message1 = await queueEthBridgeIn(refundedUser, guid1, topUp);
    expect(await ethers.provider.getBalance(layerZeroProvider.address)).eq(ethAmount);
    await expect(deliver(mockStargatePoolNative, bystander, guid1, message1, 0)).to.be.revertedWithCustomError(
      errorsContract,
      "InsufficientNativeTokenAmount"
    );

    // the refund of a native delivery sends ETH; the receiver pays no gas for it
    const balanceBefore = await ethers.provider.getBalance(refundedUser.address);
    const refundReceipt = await (await refund(mockStargatePoolNative, guid1, message1, refundedUser)).wait();
    expect((await ethers.provider.getBalance(refundedUser.address)).sub(balanceBefore)).eq(ethAmount);
    expect(await ethers.provider.getBalance(layerZeroProvider.address)).eq(0);
    expect(await dataStore.getBool(refundedKey(guid1, message1))).eq(true);

    const refunded = getEventData(parseLogs(fixture, refundReceipt), "MultichainComposeRefunded");
    expect(refunded.from).eq(mockStargatePoolNative.address);
    expect(refunded.token).eq(ethers.constants.AddressZero);
    expect(refunded.receiver).eq(refundedUser.address);
    expect(refunded.amount).eq(ethAmount);

    // the next user's ETH is on the provider when the refunded message is delivered
    const message2 = await queueEthBridgeIn(laterUser, guid2);
    await deliver(mockStargatePoolNative, bystander, guid1, message1, topUp);
    expect(await queueEntry(mockStargatePoolNative, guid1)).eq(RECEIVED);
    expect(await multichainBalance(refundedUser, wnt)).eq(0);
    expect(await ethers.provider.getBalance(layerZeroProvider.address)).eq(ethAmount.add(topUp));

    await deliver(mockStargatePoolNative, bystander, guid2, message2, 0);
    expect(await multichainBalance(laterUser, wnt)).eq(ethAmount);
    expect(await ethers.provider.getBalance(layerZeroProvider.address)).eq(topUp);
  });

  it("refund rejects a caller without the controller role, a disabled endpoint and a disabled pool", async () => {
    const message1 = await queueUsdcBridgeIn(refundedUser, guid1, topUp);

    await expect(
      layerZeroProvider
        .connect(bystander)
        .refundCompose(endpoint.address, mockStargatePoolUsdc.address, guid1, message1, refundedUser.address)
    )
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(bystander.address, "CONTROLLER");

    await expect(
      layerZeroProvider
        .connect(wallet)
        .refundCompose(
          mockStargatePoolUsdc.address,
          mockStargatePoolUsdc.address,
          guid1,
          message1,
          refundedUser.address
        )
    )
      .to.be.revertedWithCustomError(errorsContract, "InvalidMultichainEndpoint")
      .withArgs(mockStargatePoolUsdc.address);

    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), false);
    await expect(refund(mockStargatePoolUsdc, guid1, message1, refundedUser))
      .to.be.revertedWithCustomError(errorsContract, "InvalidMultichainProvider")
      .withArgs(mockStargatePoolUsdc.address);

    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(usdcAmount);
    expect(await dataStore.getBool(refundedKey(guid1, message1))).eq(false);
  });

  it("a delivered message with a failed follow-up action cannot be refunded", async () => {
    await dataStore.setBool(keys.isRelayFeeExcludedKey(layerZeroProvider.address), true);

    // the code is taken, so the follow-up action fails after the tokens are credited
    const referralCode = hashString("takenCode");
    await referralStorage.connect(bystander).registerCode(referralCode);

    const registerCodeParams = {
      sender: refundedUser,
      signer: refundedUser,
      feeParams: { feeToken: wnt.address, feeAmount: 0, feeSwapPath: [] },
      account: refundedUser.address,
      referralCode,
      deadline: 9999999999,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainOrderRouter,
      chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: 0,
    };
    const message = await encodeRegisterCodeMessage(registerCodeParams, referralCode, refundedUser.address);
    const queuedMessage = await queueUsdcBridgeIn(refundedUser, guid1, 0, message);

    const receipt = await (await deliver(mockStargatePoolUsdc, bystander, guid1, queuedMessage, 0, 30_000_000)).wait();
    expect(await multichainBalance(refundedUser, usdc)).eq(usdcAmount);
    expect(await referralStorage.codeOwners(referralCode)).eq(bystander.address);
    expect(getEventData(parseLogs(fixture, receipt), "MultichainBridgeActionFailed").account).eq(refundedUser.address);
    const failedActionKey = keys.multichainFailedActionKey(guid1, ethers.utils.keccak256(queuedMessage));
    expect(await dataStore.getBool(failedActionKey)).eq(true);

    // the credited tokens cannot be refunded, the retry record is untouched and the retry still runs
    await queueUsdcBridgeIn(laterUser, guid2);
    await expect(refund(mockStargatePoolUsdc, guid1, queuedMessage, refundedUser))
      .to.be.revertedWithCustomError(errorsContract, "MultichainComposeNotFound")
      .withArgs(guid1);
    expect(await dataStore.getBool(failedActionKey)).eq(true);
    expect(await dataStore.getBool(refundedKey(guid1, queuedMessage))).eq(false);

    await expect(layerZeroProvider.connect(bystander).retryAction(guid1, queuedMessage))
      .to.be.revertedWithCustomError(errorsContract, "MultichainActionRetryFailed")
      .withArgs(guid1);
    expect(await dataStore.getBool(failedActionKey)).eq(true);
  });
});
