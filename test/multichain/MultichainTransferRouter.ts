import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, percentageToFloat, applyFactor, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
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
    swapHandler,
    wnt,
    usdc,
    mockStargatePoolNative,
    mockStargatePoolUsdc,
    ethUsdMarket,
    chainlinkPriceFeedProvider;
  let chainId;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user1, user2 } = fixture.accounts);
    ({
      dataStore,
      multichainVault,
      router,
      multichainTransferRouter,
      swapHandler,
      wnt,
      usdc,
      mockStargatePoolNative,
      mockStargatePoolUsdc,
      ethUsdMarket,
      chainlinkPriceFeedProvider,
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
        bridgeFee: {
          feeToken: ethers.constants.AddressZero,
          feeAmount: 0,
          feeSwapPath: [],
          minOutputAmount: 0,
        },
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

    describe("bridge fee swap", () => {
      const bridgeFeeUsdc = expandDecimals(10, 6); // 10 USDC for bridge fee
      const atomicSwapFeeFactor = percentageToFloat("1%");

      beforeEach(async () => {
        // Seed ethUsdMarket with liquidity for USDC→WNT atomic swaps
        await handleDeposit(fixture, {
          create: {
            longTokenAmount: expandDecimals(10, 18), // 10 WETH
            shortTokenAmount: expandDecimals(10 * 5000, 6), // 50,000 USDC
          },
        });

        // Set atomic swap fee factor
        await dataStore.setUint(keys.atomicSwapFeeFactorKey(ethUsdMarket.marketToken), atomicSwapFeeFactor);

        // Cap bridge fee atomic swaps (same USD cap as relay fee swaps + quote-derived bound)
        await dataStore.setUint(keys.MAX_RELAY_FEE_SWAP_USD, decimalToFloat(100));
        await dataStore.setUint(keys.MAX_BRIDGE_FEE_SWAP_FACTOR, decimalToFloat(10));

        // Enable providers
        await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
        await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
        await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
        await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
      });

      it("cross-chain bridge-out with USDC bridge fee swap", async () => {
        const bridgeOutFee = await mockStargatePoolNative.BRIDGE_OUT_FEE(); // 0.001 ETH

        // Bridge in USDC for bridge-out amount + bridge fee
        await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount.add(bridgeFeeUsdc) });
        // Bridge in WNT for relay fee only (no WNT for bridge fee — that will come from the swap)
        await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

        // Verify initial state
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(
          bridgeOutAmount.add(bridgeFeeUsdc)
        );
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(feeAmount);

        // Configure cross-chain
        const srcChainId = 1;
        bridgeOutParams.srcChainId = srcChainId;
        await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

        // Set bridge fee params on bridgeOutParams
        bridgeOutParams.params = {
          ...defaultBridgeOutParams,
          bridgeFee: {
            feeToken: usdc.address,
            feeAmount: bridgeFeeUsdc,
            feeSwapPath: [ethUsdMarket.marketToken],
            minOutputAmount: 0,
          },
        };

        // Pass oracle params for the atomic swap
        bridgeOutParams.oracleParams = {
          tokens: [usdc.address, wnt.address],
          providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
          data: ["0x", "0x"],
        };

        const tx = await sendBridgeOut(bridgeOutParams);

        // User's USDC multichain balance should be 0 (bridgeOutAmount + bridgeFeeUsdc consumed)
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);

        // Bridge-out succeeded — USDC transferred to user on dest chain
        expect(await usdc.balanceOf(user1.address)).eq(bridgeOutAmount);

        // Bridge out fee (native) was sent to the mock Stargate pool
        expect(await hre.ethers.provider.getBalance(mockStargatePoolUsdc.address)).eq(bridgeOutFee);

        // Relay fee was sent to relayer
        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).eq(relayFeeAmount);

        // Verify swap events
        const txReceipt = await hre.ethers.provider.getTransactionReceipt(tx.hash);
        const logs = parseLogs(fixture, txReceipt);
        const swapInfoLog = logs.find((log) => log.parsedEventInfo?.eventName === "SwapInfo");
        expect(swapInfoLog).to.not.eq(undefined);

        // Verify atomic swap fee was applied
        const swapFeesCollectedLog = logs.find((log) => log.parsedEventInfo?.eventName === "SwapFeesCollected");
        expect(swapFeesCollectedLog.parsedEventData.swapFeeType).eq(keys.ATOMIC_SWAP_FEE_TYPE);
        expect(swapInfoLog.parsedEventData.amountIn.sub(swapInfoLog.parsedEventData.amountInAfterFees)).eq(
          applyFactor(swapInfoLog.parsedEventData.amountIn, atomicSwapFeeFactor)
        );

        await logGasUsage({
          tx,
          label: "multichainTransferRouter.bridgeOut with bridge fee swap",
        });
      });

      it("reverts bridge fee swap when atomic swaps are disabled", async () => {
        await bridgeInTokens(fixture, {
          account: user1,
          token: usdc,
          amount: bridgeOutAmount.add(bridgeFeeUsdc),
        });
        await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

        const srcChainId = 1;
        bridgeOutParams.srcChainId = srcChainId;
        await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

        bridgeOutParams.params = {
          ...defaultBridgeOutParams,
          bridgeFee: {
            feeToken: usdc.address,
            feeAmount: bridgeFeeUsdc,
            feeSwapPath: [ethUsdMarket.marketToken],
            minOutputAmount: 0,
          },
        };
        bridgeOutParams.oracleParams = {
          tokens: [usdc.address, wnt.address],
          providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
          data: ["0x", "0x"],
        };

        const featureKey = keys.atomicSwapFeatureDisabledKey(swapHandler.address);
        await dataStore.setBool(featureKey, true);

        await expect(sendBridgeOut(bridgeOutParams))
          .to.be.revertedWithCustomError(errorsContract, "DisabledFeature")
          .withArgs(featureKey);
      });

      it("reverts bridge fee swap when bridge fee swap feature is disabled", async () => {
        await bridgeInTokens(fixture, {
          account: user1,
          token: usdc,
          amount: bridgeOutAmount.add(bridgeFeeUsdc),
        });
        await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

        const srcChainId = 1;
        bridgeOutParams.srcChainId = srcChainId;
        await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

        bridgeOutParams.params = {
          ...defaultBridgeOutParams,
          bridgeFee: {
            feeToken: usdc.address,
            feeAmount: bridgeFeeUsdc,
            feeSwapPath: [ethUsdMarket.marketToken],
          },
        };
        bridgeOutParams.oracleParams = {
          tokens: [usdc.address, wnt.address],
          providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
          data: ["0x", "0x"],
        };

        const featureKey = keys.bridgeFeeSwapFeatureDisabledKey(multichainTransferRouter.address);
        await dataStore.setBool(featureKey, true);

        await expect(sendBridgeOut(bridgeOutParams))
          .to.be.revertedWithCustomError(errorsContract, "DisabledFeature")
          .withArgs(featureKey);
      });

      it("reverts when bridge fee swap exceeds MAX_RELAY_FEE_SWAP_USD", async () => {
        // PoC-style oversized bridge fee: $1,000,000 USDC vs $100 cap
        const largeBridgeFeeUsdc = expandDecimals(1_000_000, 6);
        await bridgeInTokens(fixture, {
          account: user1,
          token: usdc,
          amount: bridgeOutAmount.add(largeBridgeFeeUsdc),
        });
        await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

        // Raise quote-bound so the USD size cap is the binding constraint
        await dataStore.setUint(keys.MAX_BRIDGE_FEE_SWAP_FACTOR, decimalToFloat(1_000_000));

        const srcChainId = 1;
        bridgeOutParams.srcChainId = srcChainId;
        await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

        bridgeOutParams.params = {
          ...defaultBridgeOutParams,
          bridgeFee: {
            feeToken: usdc.address,
            feeAmount: largeBridgeFeeUsdc,
            feeSwapPath: [ethUsdMarket.marketToken],
          },
        };
        bridgeOutParams.oracleParams = {
          tokens: [usdc.address, wnt.address],
          providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
          data: ["0x", "0x"],
        };

        await expect(sendBridgeOut(bridgeOutParams))
          .to.be.revertedWithCustomError(errorsContract, "MaxRelayFeeSwapExceeded")
          .withArgs(decimalToFloat(1_000_000), decimalToFloat(100));
      });

      it("reverts when bridge fee swap exceeds quote-derived MAX_BRIDGE_FEE_SWAP_FACTOR bound", async () => {
        // Messaging fee is 0.001 ETH ≈ $5; with factor 10 the max allowed fee USD is ≈ $50.
        // 100 USDC is under MAX_RELAY_FEE_SWAP_USD ($100) but above the quote-derived bound.
        const oversizedBridgeFeeUsdc = expandDecimals(100, 6);
        await bridgeInTokens(fixture, {
          account: user1,
          token: usdc,
          amount: bridgeOutAmount.add(oversizedBridgeFeeUsdc),
        });
        await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

        const srcChainId = 1;
        bridgeOutParams.srcChainId = srcChainId;
        await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

        bridgeOutParams.params = {
          ...defaultBridgeOutParams,
          bridgeFee: {
            feeToken: usdc.address,
            feeAmount: oversizedBridgeFeeUsdc,
            feeSwapPath: [ethUsdMarket.marketToken],
          },
        };
        bridgeOutParams.oracleParams = {
          tokens: [usdc.address, wnt.address],
          providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
          data: ["0x", "0x"],
        };

        await expect(sendBridgeOut(bridgeOutParams)).to.be.revertedWithCustomError(
          errorsContract,
          "MaxBridgeFeeSwapExceeded"
        );
      });

      it("no swap when feeSwapPath is empty (backward compat)", async () => {
        // Bridge in USDC + WNT (with enough WNT for relay fee + bridge out fee)
        const bridgeOutFee = await mockStargatePoolNative.BRIDGE_OUT_FEE();
        await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });
        await bridgeInTokens(fixture, { account: user1, amount: feeAmount.add(bridgeOutFee) });

        const srcChainId = 1;
        bridgeOutParams.srcChainId = srcChainId;
        await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

        // bridgeFee with empty feeSwapPath (default)
        const tx = await sendBridgeOut(bridgeOutParams);

        const txReceipt = await hre.ethers.provider.getTransactionReceipt(tx.hash);
        const logs = parseLogs(fixture, txReceipt);
        const swapInfoLog = logs.find((log) => log.parsedEventInfo?.eventName === "SwapInfo");
        expect(swapInfoLog).to.eq(undefined); // no swap happened
      });

      it("no swap when feeAmount is 0", async () => {
        const bridgeOutFee = await mockStargatePoolNative.BRIDGE_OUT_FEE();
        await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });
        await bridgeInTokens(fixture, { account: user1, amount: feeAmount.add(bridgeOutFee) });

        const srcChainId = 1;
        bridgeOutParams.srcChainId = srcChainId;
        await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

        // feeAmount is 0 but feeSwapPath is non-empty — should still skip swap
        bridgeOutParams.params = {
          ...defaultBridgeOutParams,
          bridgeFee: {
            feeToken: usdc.address,
            feeAmount: 0,
            feeSwapPath: [ethUsdMarket.marketToken],
            minOutputAmount: 0,
          },
        };

        const tx = await sendBridgeOut(bridgeOutParams);

        const txReceipt = await hre.ethers.provider.getTransactionReceipt(tx.hash);
        const logs = parseLogs(fixture, txReceipt);
        const swapInfoLog = logs.find((log) => log.parsedEventInfo?.eventName === "SwapInfo");
        expect(swapInfoLog).to.eq(undefined); // no swap happened
      });

      it("no swap when feeToken is WNT", async () => {
        const bridgeOutFee = await mockStargatePoolNative.BRIDGE_OUT_FEE();
        await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });
        await bridgeInTokens(fixture, { account: user1, amount: feeAmount.add(bridgeOutFee) });

        const srcChainId = 1;
        bridgeOutParams.srcChainId = srcChainId;
        await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

        // feeToken is WNT — no swap needed even with non-empty path
        bridgeOutParams.params = {
          ...defaultBridgeOutParams,
          bridgeFee: {
            feeToken: wnt.address,
            feeAmount: expandDecimals(1, 15),
            feeSwapPath: [ethUsdMarket.marketToken],
            minOutputAmount: 0,
          },
        };

        const tx = await sendBridgeOut(bridgeOutParams);

        const txReceipt = await hre.ethers.provider.getTransactionReceipt(tx.hash);
        const logs = parseLogs(fixture, txReceipt);
        const swapInfoLog = logs.find((log) => log.parsedEventInfo?.eventName === "SwapInfo");
        expect(swapInfoLog).to.eq(undefined); // no swap happened
      });

      it("should revert if insufficient USDC for bridge fee swap", async () => {
        // Bridge in USDC for bridge-out only (not enough for bridge fee)
        await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });
        // Bridge in WNT for relay fee
        await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

        const srcChainId = 1;
        bridgeOutParams.srcChainId = srcChainId;
        await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

        bridgeOutParams.params = {
          ...defaultBridgeOutParams,
          bridgeFee: {
            feeToken: usdc.address,
            feeAmount: bridgeFeeUsdc, // 10 USDC but user only has bridgeOutAmount
            feeSwapPath: [ethUsdMarket.marketToken],
            minOutputAmount: 0,
          },
        };
        bridgeOutParams.oracleParams = {
          tokens: [usdc.address, wnt.address],
          providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
          data: ["0x", "0x"],
        };

        await expect(sendBridgeOut(bridgeOutParams)).to.be.revertedWithCustomError(
          errorsContract,
          "InsufficientMultichainBalance"
        );
      });

      it("tampering bridgeFee params invalidates signature", async () => {
        await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount.add(bridgeFeeUsdc) });
        await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

        const srcChainId = 1;
        bridgeOutParams.srcChainId = srcChainId;
        await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

        bridgeOutParams.params = {
          ...defaultBridgeOutParams,
          bridgeFee: {
            feeToken: usdc.address,
            feeAmount: bridgeFeeUsdc,
            feeSwapPath: [ethUsdMarket.marketToken],
            minOutputAmount: 0,
          },
        };
        bridgeOutParams.oracleParams = {
          tokens: [usdc.address, wnt.address],
          providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
          data: ["0x", "0x"],
        };

        // Sign with the original params
        bridgeOutParams.userNonce = 1;
        const relayParams = await getRelayParams(bridgeOutParams);
        const signature = await getBridgeOutSignature({
          ...bridgeOutParams,
          relayParams,
          verifyingContract: bridgeOutParams.relayRouter.address,
        });
        bridgeOutParams.signature = signature;

        // Tamper bridgeFee.feeAmount
        bridgeOutParams.params.bridgeFee.feeAmount = expandDecimals(5, 6); // changed from 10 to 5 USDC
        await expect(sendBridgeOut(bridgeOutParams)).to.be.revertedWithCustomError(
          errorsContract,
          "InvalidRecoveredSigner"
        );

        // Restore original feeAmount, tamper feeSwapPath
        bridgeOutParams.params.bridgeFee.feeAmount = bridgeFeeUsdc;
        bridgeOutParams.params.bridgeFee.feeSwapPath = []; // tampered
        await expect(sendBridgeOut(bridgeOutParams)).to.be.revertedWithCustomError(
          errorsContract,
          "InvalidRecoveredSigner"
        );

        // Restore feeSwapPath, tamper minOutputAmount (e.g. a relayer stripping the min)
        bridgeOutParams.params.bridgeFee.feeSwapPath = [ethUsdMarket.marketToken];
        bridgeOutParams.params.bridgeFee.minOutputAmount = 1; // tampered
        await expect(sendBridgeOut(bridgeOutParams)).to.be.revertedWithCustomError(
          errorsContract,
          "InvalidRecoveredSigner"
        );

        // Restore everything — should succeed
        bridgeOutParams.params.bridgeFee.minOutputAmount = 0;
        await expect(sendBridgeOut(bridgeOutParams)).to.not.be.reverted;
      });

      it("same-chain withdrawal ignores bridgeFee params (no swap)", async () => {
        // Same-chain: srcChainId == desChainId == chainId
        await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });
        await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

        // Set bridgeFee params even though it's same-chain
        bridgeOutParams.params = {
          ...defaultBridgeOutParams,
          provider: ethers.constants.AddressZero,
          data: "0x",
          bridgeFee: {
            feeToken: usdc.address,
            feeAmount: bridgeFeeUsdc,
            feeSwapPath: [ethUsdMarket.marketToken],
            minOutputAmount: 0,
          },
        };

        const tx = await sendBridgeOut(bridgeOutParams);

        // Should succeed without swap (same-chain path doesn't call _swapBridgeFeeIfNeeded)
        expect(await usdc.balanceOf(user1.address)).eq(bridgeOutAmount);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);

        const txReceipt = await hre.ethers.provider.getTransactionReceipt(tx.hash);
        const logs = parseLogs(fixture, txReceipt);
        const swapInfoLog = logs.find((log) => log.parsedEventInfo?.eventName === "SwapInfo");
        expect(swapInfoLog).to.eq(undefined); // no swap happened
      });

      it("should revert when swap produces less WNT than needed for bridge fee", async () => {
        // Bridge in very small amount of USDC for bridge fee (1 USDC → ~0.0002 ETH after fees)
        // Mock BRIDGE_OUT_FEE is 0.001 ETH, so 1 USDC won't be enough
        const tinyBridgeFeeUsdc = expandDecimals(1, 6); // 1 USDC
        await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount.add(tinyBridgeFeeUsdc) });
        // Only bridge in relay fee WNT — no extra WNT for bridge out fee
        await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

        const srcChainId = 1;
        bridgeOutParams.srcChainId = srcChainId;
        await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

        bridgeOutParams.params = {
          ...defaultBridgeOutParams,
          bridgeFee: {
            feeToken: usdc.address,
            feeAmount: tinyBridgeFeeUsdc,
            feeSwapPath: [ethUsdMarket.marketToken],
            minOutputAmount: 0,
          },
        };
        bridgeOutParams.oracleParams = {
          tokens: [usdc.address, wnt.address],
          providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
          data: ["0x", "0x"],
        };

        // Swap succeeds (1 USDC → ~0.0002 WNT) but bridge out fails
        // because WNT balance is insufficient for the 0.001 ETH bridge out fee
        await expect(sendBridgeOut(bridgeOutParams)).to.be.revertedWithCustomError(
          errorsContract,
          "InsufficientMultichainBalance"
        );
      });

      it("reverts when bridge fee swap output is below the signed minimum", async () => {
        await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount.add(bridgeFeeUsdc) });
        await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

        const srcChainId = 1;
        bridgeOutParams.srcChainId = srcChainId;
        await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

        // 10 USDC at $5000/ETH is 0.002 ETH before fees; the 1% atomic swap fee
        // brings the output below a 0.002 ETH minimum
        bridgeOutParams.params = {
          ...defaultBridgeOutParams,
          bridgeFee: {
            feeToken: usdc.address,
            feeAmount: bridgeFeeUsdc,
            feeSwapPath: [ethUsdMarket.marketToken],
            minOutputAmount: expandDecimals(2, 15),
          },
        };
        bridgeOutParams.oracleParams = {
          tokens: [usdc.address, wnt.address],
          providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
          data: ["0x", "0x"],
        };

        await expect(sendBridgeOut(bridgeOutParams)).to.be.revertedWithCustomError(
          errorsContract,
          "InsufficientSwapOutputAmount"
        );
      });

      it("reverts on low swap output even when existing WNT balance covers the bridge fee", async () => {
        const bridgeOutFee = await mockStargatePoolNative.BRIDGE_OUT_FEE();
        await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount.add(bridgeFeeUsdc) });
        // extra WNT lets the bridge fee be paid from the existing balance,
        // which would mask a bad swap if there was no minimum check
        await bridgeInTokens(fixture, { account: user1, amount: feeAmount.add(bridgeOutFee) });

        const srcChainId = 1;
        bridgeOutParams.srcChainId = srcChainId;
        await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

        bridgeOutParams.params = {
          ...defaultBridgeOutParams,
          bridgeFee: {
            feeToken: usdc.address,
            feeAmount: bridgeFeeUsdc,
            feeSwapPath: [ethUsdMarket.marketToken],
            minOutputAmount: expandDecimals(2, 15),
          },
        };
        bridgeOutParams.oracleParams = {
          tokens: [usdc.address, wnt.address],
          providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
          data: ["0x", "0x"],
        };

        await expect(sendBridgeOut(bridgeOutParams)).to.be.revertedWithCustomError(
          errorsContract,
          "InsufficientSwapOutputAmount"
        );
      });

      it("succeeds when bridge fee swap output meets the signed minimum", async () => {
        const bridgeOutFee = await mockStargatePoolNative.BRIDGE_OUT_FEE();
        await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount.add(bridgeFeeUsdc) });
        await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

        const srcChainId = 1;
        bridgeOutParams.srcChainId = srcChainId;
        await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

        // swap output (~0.00198 ETH) is above the minimum (0.001 ETH)
        bridgeOutParams.params = {
          ...defaultBridgeOutParams,
          bridgeFee: {
            feeToken: usdc.address,
            feeAmount: bridgeFeeUsdc,
            feeSwapPath: [ethUsdMarket.marketToken],
            minOutputAmount: bridgeOutFee,
          },
        };
        bridgeOutParams.oracleParams = {
          tokens: [usdc.address, wnt.address],
          providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
          data: ["0x", "0x"],
        };

        const tx = await sendBridgeOut(bridgeOutParams);

        // bridge completed
        expect(await usdc.balanceOf(user1.address)).eq(bridgeOutAmount);

        // swap happened
        const txReceipt = await hre.ethers.provider.getTransactionReceipt(tx.hash);
        const logs = parseLogs(fixture, txReceipt);
        const swapInfoLog = logs.find((log) => log.parsedEventInfo?.eventName === "SwapInfo");
        expect(swapInfoLog).to.not.eq(undefined);
      });
    });

    it("should revert if bridge output is below minAmountOut", async () => {
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });

      const bridgeOutFee = await mockStargatePoolNative.BRIDGE_OUT_FEE();
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount.add(bridgeOutFee) });

      const srcChainId = 1;
      bridgeOutParams.srcChainId = srcChainId;
      await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
      await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), srcChainId);

      // minAmountOut exceeds what Stargate would deliver (mock returns amountLD as amountReceivedLD)
      bridgeOutParams.params.minAmountOut = bridgeOutAmount.add(1);
      await expect(sendBridgeOut(bridgeOutParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientBridgeOutputAmount"
      );

      // with valid minAmountOut, bridge succeeds
      bridgeOutParams.params.minAmountOut = bridgeOutAmount;
      bridgeOutParams.userNonce = undefined;
      bridgeOutParams.signature = undefined;
      await expect(sendBridgeOut(bridgeOutParams)).to.not.be.reverted;
    });

    // Account-bound digests prevent cross-account collisions.
    // Two distinct users sign the same payload shape; both must succeed because
    // account is part of the structHash, so their digests differ.
    it("two users signing the same bridgeOut payload do not collide", async () => {
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);

      // fund both users identically
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: bridgeOutAmount });
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
      await bridgeInTokens(fixture, { account: user2, token: usdc, amount: bridgeOutAmount });
      await bridgeInTokens(fixture, { account: user2, amount: feeAmount });

      // user2 submits the identical payload shape with their own signer/account
      const user2BridgeOutParams = {
        ...bridgeOutParams,
        signer: user2,
        account: user2.address,
      };

      // user1 goes first
      await expect(sendBridgeOut(bridgeOutParams)).to.not.be.reverted;

      // user2's identical-shape payload must also succeed, because digest is account-bound
      await expect(sendBridgeOut(user2BridgeOutParams)).to.not.be.reverted;
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
        bridgeFee: {
          feeToken: ethers.constants.AddressZero,
          feeAmount: 0,
          feeSwapPath: [],
          minOutputAmount: 0,
        },
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
        bridgeFee: {
          feeToken: ethers.constants.AddressZero,
          feeAmount: 0,
          feeSwapPath: [],
          minOutputAmount: 0,
        },
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
        bridgeFee: {
          feeToken: ethers.constants.AddressZero,
          feeAmount: 0,
          feeSwapPath: [],
          minOutputAmount: 0,
        },
      };

      await expect(multichainTransferRouter.connect(user1).transferOut(transferOutParams))
        .to.be.revertedWithCustomError(errorsContract, "InsufficientMultichainBalance")
        .withArgs(user1.address, transferOutParams.token, 0, transferOutParams.amount);
    });
  });
});
