import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { logGasUsage } from "../../utils/gas";
import * as keys from "../../utils/keys";
import { getBridgeOutSignature, sendBridgeOut } from "../../utils/relay/multichain";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import { bridgeInTokens } from "../../utils/multichain";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { parseLogs } from "../../utils/event";
import { errorsContract } from "../../utils/error";
import { getRelayParams } from "../../utils/relay/helpers";

describe("MultichainTransferRouter", () => {
  let fixture;
  let user1, user2;
  let dataStore,
    multichainVault,
    router,
    multichainTransferRouter,
    wnt,
    usdc,
    mockStargatePoolNative,
    mockStargatePoolUsdc;
  let chainId;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user1, user2 } = fixture.accounts);
    ({
      dataStore,
      multichainVault,
      router,
      multichainTransferRouter,
      wnt,
      usdc,
      mockStargatePoolNative,
      mockStargatePoolUsdc,
    } = fixture.contracts);

    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
  });

  it("bridgeIn wnt (same-chain flow)", async () => {
    const amount = expandDecimals(50, 18); // 50 ETH
    const user1EthBalanceBefore = await hre.ethers.provider.getBalance(user1.address);

    expect(await wnt.balanceOf(user1.address)).to.eq(0);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0);

    const tx = await multichainTransferRouter.connect(user1).multicall(
      [
        multichainTransferRouter.interface.encodeFunctionData("sendWnt", [multichainVault.address, amount]),
        multichainTransferRouter.interface.encodeFunctionData("bridgeIn", [
          user1.address, // account
          wnt.address, // token
        ]),
      ],
      { value: amount }
    );

    const user1EthBalanceAfter = await hre.ethers.provider.getBalance(user1.address);
    expect(user1EthBalanceAfter).to.approximately(user1EthBalanceBefore.sub(amount), expandDecimals(1, 15)); // account for gas ~0.0002 ETH
    expect(await wnt.balanceOf(user1.address)).to.eq(0);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(amount);

    await logGasUsage({
      tx,
      label: "multichainTransferRouter.bridgeIn",
    });
  });

  it("bridgeIn usdc (same-chain flow)", async () => {
    const amount = expandDecimals(50 * 1000, 6); // 50,000 USDC
    await usdc.mint(user1.address, amount);
    await usdc.connect(user1).approve(router.address, amount);

    expect(await usdc.balanceOf(user1.address)).to.eq(amount);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);

    const tx = await multichainTransferRouter.connect(user1).multicall([
      multichainTransferRouter.interface.encodeFunctionData("sendTokens", [
        usdc.address,
        multichainVault.address,
        amount,
      ]),
      multichainTransferRouter.interface.encodeFunctionData("bridgeIn", [
        user1.address, // account
        usdc.address, // token
      ]),
    ]);

    expect(await usdc.balanceOf(user1.address)).to.eq(0);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(amount);

    await logGasUsage({
      tx,
      label: "multichainTransferRouter.bridgeIn",
    });
  });

  describe("bridgeOut", () => {
    let relaySigner;

    const feeAmount = expandDecimals(3, 15);
    const relayFeeAmount = expandDecimals(2, 15);
    const bridgeOutAmount = expandDecimals(1000, 6);

    let defaultBridgeOutParams;
    beforeEach(async () => {
      defaultBridgeOutParams = {
        token: usdc.address,
        amount: bridgeOutAmount,
        minAmountOut: 0,
        provider: mockStargatePoolUsdc.address,
        data: ethers.utils.defaultAbiCoder.encode(["uint32"], [1]), // dstEid = 1 (destination endpoint ID)
      };
    });

    let bridgeOutParams: Parameters<typeof sendBridgeOut>[0];
    beforeEach(async () => {
      await impersonateAccount(GELATO_RELAY_ADDRESS);
      await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(1, 16)); // ETH to pay tx fees
      relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);

      bridgeOutParams = {
        sender: relaySigner,
        signer: user1,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: feeAmount,
          feeSwapPath: [],
        },
        account: user1.address,
        params: defaultBridgeOutParams,
        deadline: 9999999999,
        srcChainId: chainId, // 0 means non-multichain action
        desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
        relayRouter: multichainTransferRouter,
        relayFeeToken: wnt.address,
        relayFeeAmount: relayFeeAmount,
      };
    });

    it("same-chain withdrawal", async () => {
      await dataStore.setAddress(keys.HOLDING_ADDRESS, user2.address);
      // add usdc to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });
      // add wnt to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

      // user's wallet balance
      expect(await usdc.balanceOf(user1.address)).eq(0);
      expect(await wnt.balanceOf(user1.address)).eq(0);
      // user's multicahin balance
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(bridgeOutAmount); // 1000 USDC
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(feeAmount); // 0.003 ETH
      // relayer and multichain vault balances
      expect(await usdc.balanceOf(multichainVault.address)).eq(bridgeOutAmount);
      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).eq(0); // 0 WNT

      // provider and data are not used for same-chain withdrawals
      bridgeOutParams.params.provider = ethers.constants.AddressZero;
      bridgeOutParams.params.data = "0x";

      await sendBridgeOut(bridgeOutParams);

      // After bridging out:
      // 1. The relay fee was sent to the relayer
      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).eq(relayFeeAmount); // 0.002 WNT

      // 2. User's multichain balance was decreased
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0); // 0 USDC
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
        feeAmount.sub(relayFeeAmount)
      ); // residualFee

      // 3. MultichainVault no longer has the tokens
      expect(await usdc.balanceOf(multichainVault.address)).eq(0);

      // 4. The tokens were sent to the user's wallet (same-chain transfer)
      expect(await usdc.balanceOf(user1.address)).eq(bridgeOutAmount);
      expect(await wnt.balanceOf(user1.address)).eq(0);
    });

    it("cross-chain withdrawal", async () => {
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });

      const bridgeOutFee = await mockStargatePoolNative.BRIDGE_OUT_FEE();
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount.add(bridgeOutFee) });

      expect(await usdc.balanceOf(multichainVault.address)).eq(bridgeOutAmount);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(bridgeOutAmount); // 1000 USDC
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
        feeAmount.add(bridgeOutFee)
      );
      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).eq(0); // 0 WNT
      expect(await hre.ethers.provider.getBalance(mockStargatePoolUsdc.address)).eq(0); // 0 ETH

      // mock signing from a src chain (srcChainId != desChainId)
      const srcChainId = 1;
      bridgeOutParams.srcChainId = srcChainId;
      await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
      await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

      await sendBridgeOut(bridgeOutParams);

      // After bridging out:
      // 1. The relay fee was sent to the relayer
      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).eq(relayFeeAmount); // 0.002 WNT

      // 2. User's multichain balance was decreased
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0); // 0 USDC
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
        feeAmount.sub(relayFeeAmount)
      ); // residualFee

      // 3. MultichainVault no longer has the tokens
      expect(await usdc.balanceOf(multichainVault.address)).eq(0);

      // 4. The tokens were sent to the user on the destination chain (mocked by sending to user1)
      expect(await usdc.balanceOf(user1.address)).eq(bridgeOutAmount);

      // 5. The bridge out fee (in native tokens) was sent to the provider
      expect(await hre.ethers.provider.getBalance(mockStargatePoolUsdc.address)).eq(bridgeOutFee); // 0.001 ETH
    });

    it("should revert if signature is invalid due to incorrect signer", async () => {
      // add usdc to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });
      // add wnt to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

      bridgeOutParams.signer = user2; // incorrect signer
      await expect(sendBridgeOut(bridgeOutParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidRecoveredSigner"
      );

      bridgeOutParams.signer = user1; // correct signer
      await expect(sendBridgeOut(bridgeOutParams)).to.not.be.reverted;
    });

    it("should transfer WNT to relayer for relay fee", async () => {
      // add usdc to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });
      // add wnt to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

      const relayBefore = await wnt.balanceOf(GELATO_RELAY_ADDRESS);
      await sendBridgeOut(bridgeOutParams);
      const relayAfter = await wnt.balanceOf(GELATO_RELAY_ADDRESS);
      expect(relayAfter).eq(relayBefore.add(relayFeeAmount));
    });

    it("should revert if deadline has passed", async () => {
      // add usdc to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });
      // add wnt to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

      bridgeOutParams.deadline = 1; // past deadline
      await expect(sendBridgeOut(bridgeOutParams)).to.be.revertedWithCustomError(errorsContract, "DeadlinePassed");

      bridgeOutParams.deadline = 9999999999; // future deadline
      await expect(sendBridgeOut(bridgeOutParams)).to.not.be.reverted;
    });

    it("should revert if any data in params is tampered", async () => {
      // add usdc to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });
      // add wnt to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

      bridgeOutParams.userNonce = 1; // set value upfront to have the same user nonce for relayParams here and when recalculated in sendCreateDeposit
      const relayParams = await getRelayParams(bridgeOutParams);
      const signature = await getBridgeOutSignature({
        ...bridgeOutParams,
        relayParams,
        verifyingContract: bridgeOutParams.relayRouter.address,
      });
      bridgeOutParams.signature = signature;

      bridgeOutParams.params.minAmountOut = 1; // tamper a param field
      await expect(sendBridgeOut(bridgeOutParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidRecoveredSigner"
      );

      bridgeOutParams.params.minAmountOut = 0; // use the original value again
      await expect(sendBridgeOut(bridgeOutParams)).to.not.be.reverted;
    });

    it("should revert if fee cannot be covered", async () => {
      // add usdc to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });
      // add wnt to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount.sub(1) }); // missing 1 wei

      await expect(sendBridgeOut(bridgeOutParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientMultichainBalance"
      );

      await bridgeInTokens(fixture, { account: user1, amount: 1 }); // top-up with the missing 1 wei
      await expect(sendBridgeOut(bridgeOutParams)).to.not.be.reverted;
    });

    it("should revert if same params are reused (simulate replay)", async () => {
      // add usdc to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });
      // add wnt to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

      bridgeOutParams.userNonce = 1; // set value upfront to have the same user nonce for relayParams here and when recalculated in sendCreateDeposit
      const relayParams = await getRelayParams(bridgeOutParams);
      const signature = await getBridgeOutSignature({
        ...bridgeOutParams,
        relayParams,
        verifyingContract: bridgeOutParams.relayRouter.address,
      });
      bridgeOutParams.signature = signature;
      await sendBridgeOut(bridgeOutParams);

      // add usdc to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });
      // add wnt to user's multichain balance
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
      // reuse exact same params and signature
      await expect(sendBridgeOut(bridgeOutParams)).to.be.revertedWithCustomError(errorsContract, "InvalidUserDigest");

      // reset nonce and signature (sendBridgeOut will recalculate them)
      bridgeOutParams.userNonce = undefined;
      bridgeOutParams.signature = undefined;
      await expect(sendBridgeOut(bridgeOutParams)).to.not.be.reverted;
    });
  });

  describe("transferOut", () => {
    it("should execute transferOut successfully", async () => {
      const transferOutParams = {
        token: usdc.address,
        amount: expandDecimals(1000, 6),
        minAmountOut: 0,
        provider: mockStargatePoolUsdc.address,
        data: ethers.utils.defaultAbiCoder.encode(["uint32"], [1]), // dstEid = 1
      };

      // Mock initial balances and states
      await usdc.mint(multichainVault.address, transferOutParams.amount);
      await dataStore.setUint(keys.multichainBalanceKey(user1.address, usdc.address), transferOutParams.amount);

      expect(await usdc.balanceOf(user1.address)).to.eq(0);
      expect(await usdc.balanceOf(multichainVault.address)).to.eq(transferOutParams.amount);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(
        transferOutParams.amount
      );

      // Execute transferOut
      const tx = await multichainTransferRouter.connect(user1).transferOut(transferOutParams);

      // Validate post-transfer states
      expect(await usdc.balanceOf(user1.address)).to.eq(transferOutParams.amount);
      expect(await usdc.balanceOf(multichainVault.address)).to.eq(0);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);

      const txReceipt = await hre.ethers.provider.getTransactionReceipt(tx.hash);
      const logs = parseLogs(fixture, txReceipt);
      const transferOutLog = logs.find((log) => log.parsedEventInfo?.eventName === "MultichainTransferOut");
      expect(transferOutLog.parsedEventData.token).eq(usdc.address);
      expect(transferOutLog.parsedEventData.account).eq(user1.address);
      expect(transferOutLog.parsedEventData.receiver).eq(user1.address);
      expect(transferOutLog.parsedEventData.amount).eq(transferOutParams.amount);
      expect(transferOutLog.parsedEventData.srcChainId).eq(chainId);

      await logGasUsage({
        tx,
        label: "multichainTransferRouter.transferOut",
      });
    });

    it("should return early if the token amount is zero", async () => {
      const transferOutParams = {
        token: usdc.address,
        amount: 0,
        minAmountOut: 0,
        provider: mockStargatePoolUsdc.address,
        data: ethers.utils.defaultAbiCoder.encode(["uint32"], [1]),
      };

      const tx = await multichainTransferRouter.connect(user1).transferOut(transferOutParams);

      // Validate that no state changes occurred
      expect(await usdc.balanceOf(user1.address)).to.eq(0);
      expect(await usdc.balanceOf(multichainVault.address)).to.eq(0);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);

      const txReceipt = await hre.ethers.provider.getTransactionReceipt(tx.hash);
      const logs = parseLogs(fixture, txReceipt);
      const bridgeOutLog = logs.find((log) => log.parsedEventInfo?.eventName === "MultichainBridgeOut");
      expect(bridgeOutLog).eq(undefined);

      await logGasUsage({
        tx,
        label: "multichainTransferRouter.transferOut (early return)",
      });
    });

    it("should revert if the user has insufficient multichain balance", async () => {
      const transferOutParams = {
        token: usdc.address,
        amount: expandDecimals(1000, 6),
        minAmountOut: 0,
        provider: mockStargatePoolUsdc.address,
        data: ethers.utils.defaultAbiCoder.encode(["uint32"], [1]),
      };

      await expect(multichainTransferRouter.connect(user1).transferOut(transferOutParams))
        .to.be.revertedWithCustomError(errorsContract, "InsufficientMultichainBalance")
        .withArgs(user1.address, transferOutParams.token, 0, transferOutParams.amount);
    });
  });
});
