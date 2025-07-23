import { expect } from "chai";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import {
  getCreateGlvDepositSignature,
  getCreateGlvWithdrawalSignature,
  sendCreateDeposit,
  sendCreateGlvDeposit,
  sendCreateGlvWithdrawal,
} from "../../utils/relay/multichain";
import * as keys from "../../utils/keys";
import { executeDeposit } from "../../utils/deposit";
import { getBalanceOf } from "../../utils/token";
import { executeGlvDeposit, executeGlvWithdrawal, getGlvDepositCount, getGlvWithdrawalCount } from "../../utils/glv";
import { encodeBridgeOutDataList, bridgeInTokens } from "../../utils/multichain";
import { errorsContract } from "../../utils/error";
import { getRelayParams } from "../../utils/relay/helpers";

describe("MultichainGlvRouter", () => {
  let fixture;
  let user0, user1, user2, user3;
  let dataStore,
    multichainGmRouter,
    multichainGlvRouter,
    multichainVault,
    depositVault,
    glvVault,
    ethUsdMarket,
    ethUsdGlvAddress,
    wnt,
    usdc,
    mockStargatePoolUsdc,
    mockStargatePoolNative;
  let relaySigner;
  let chainId;

  const wntAmount = expandDecimals(10, 18);
  const usdcAmount = expandDecimals(45_000, 6);
  const feeAmount = expandDecimals(6, 15);
  const executionFee = expandDecimals(4, 15);
  const relayFeeAmount = expandDecimals(2, 15);

  let defaultDepositParams;
  let createDepositParams: Parameters<typeof sendCreateDeposit>[0];

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({
      dataStore,
      multichainGmRouter,
      multichainGlvRouter,
      multichainVault,
      depositVault,
      glvVault,
      ethUsdMarket,
      ethUsdGlvAddress,
      wnt,
      usdc,
      mockStargatePoolUsdc,
      mockStargatePoolNative,
    } = fixture.contracts);

    defaultDepositParams = {
      addresses: {
        receiver: user1.address,
        callbackContract: user2.address,
        uiFeeReceiver: user2.address,
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
    };

    await impersonateAccount(GELATO_RELAY_ADDRESS);
    await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(1, 16)); // ETH to pay tx fees

    relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);
    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    createDepositParams = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: feeAmount, // 0.006 ETH
        feeSwapPath: [],
      },
      transferRequests: {
        tokens: [wnt.address, usdc.address],
        receivers: [depositVault.address, depositVault.address],
        amounts: [wntAmount, usdcAmount],
      },
      account: user0.address,
      params: defaultDepositParams,
      deadline: 9999999999,
      chainId,
      srcChainId: chainId, // 0 would mean same chain action
      desChainId: chainId,
      relayRouter: multichainGmRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount, // 0.002 ETH
    };

    await dataStore.setAddress(keys.FEE_RECEIVER, user3.address);

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);

    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);

    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
  });

  let defaultGlvDepositParams;
  let createGlvDepositParams: Parameters<typeof sendCreateGlvDeposit>[0];

  beforeEach(async () => {
    defaultGlvDepositParams = {
      addresses: {
        glv: ethUsdGlvAddress,
        receiver: user1.address,
        callbackContract: user2.address,
        uiFeeReceiver: user3.address,
        market: ethUsdMarket.marketToken,
        initialLongToken: ethUsdMarket.longToken,
        initialShortToken: ethUsdMarket.shortToken,
        longTokenSwapPath: [],
        shortTokenSwapPath: [],
      },
      minGlvTokens: 100,
      executionFee,
      callbackGasLimit: "200000",
      shouldUnwrapNativeToken: true,
      isMarketTokenDeposit: false,
      dataList: [],
    };

    createGlvDepositParams = {
      sender: relaySigner,
      signer: user1,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: feeAmount, // 0.004 ETH
        feeSwapPath: [],
      },
      transferRequests: {
        tokens: [wnt.address, usdc.address],
        receivers: [glvVault.address, glvVault.address],
        amounts: [wntAmount, usdcAmount],
      },
      account: user1.address,
      params: defaultGlvDepositParams,
      deadline: 9999999999,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainGlvRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount, // 0.002 ETH
    };
  });

  describe("createGlvDeposit", () => {
    it("creates glvDeposit with GM tokens and sends relayer fee", async () => {
      await bridgeInTokens(fixture, { account: user0, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user0, token: usdc, amount: usdcAmount });
      await sendCreateDeposit(createDepositParams); // leaves the residualFee (i.e. executionfee) of 0.004 ETH fee in multichainVault/user's multichain balance
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount }); // add additional fee to user1's multichain balance
      await executeDeposit(fixture, { gasUsageLabel: "executeDeposit" });

      // before glv deposit is created (user has 95k GM and 0 GLV)
      expect(await getGlvDepositCount(dataStore)).eq(0);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).eq(
        expandDecimals(95_000, 18)
      ); // GM
      expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).eq(0); // GM
      expect(await getBalanceOf(ethUsdMarket.marketToken, glvVault.address)).eq(0); // GM
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // GLV

      createGlvDepositParams.params.isMarketTokenDeposit = true;
      createGlvDepositParams.params.addresses.initialLongToken = ethers.constants.AddressZero;
      createGlvDepositParams.params.addresses.initialShortToken = ethers.constants.AddressZero;
      createGlvDepositParams.transferRequests = {
        tokens: [ethUsdMarket.marketToken],
        receivers: [glvVault.address],
        amounts: [expandDecimals(95_000, 18)],
      };

      await sendCreateGlvDeposit(createGlvDepositParams);

      // after glv deposit is created (user has 0 GM and 0 GLV, his 95k GM moved from user to glvVault)
      expect(await getGlvDepositCount(dataStore)).eq(1);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).eq(0); // GM
      expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).eq(0); // GM
      expect(await getBalanceOf(ethUsdMarket.marketToken, glvVault.address)).eq(expandDecimals(95_000, 18)); // GM
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // GLV

      await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });

      // after glv deposit is executed (user has 0 GM and 95k GLV, his 95k GM moved from glvVault to glv pool)
      expect(await getGlvDepositCount(dataStore)).eq(0);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).eq(0); // GM
      expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).eq(expandDecimals(95_000, 18)); // GM
      expect(await getBalanceOf(ethUsdMarket.marketToken, glvVault.address)).eq(0); // GM
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(
        expandDecimals(95_000, 18)
      ); // GLV
    });

    it("creates glvDeposit with long/short tokens and sends relayer fee", async () => {
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });

      expect(await getGlvDepositCount(dataStore)).eq(0);

      await sendCreateGlvDeposit(createGlvDepositParams);

      expect(await getGlvDepositCount(dataStore)).eq(1);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // 0 GLV

      await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });

      expect(await getGlvDepositCount(dataStore)).eq(0);
      expect(await getBalanceOf(ethUsdGlvAddress, multichainVault.address)).eq(expandDecimals(95_000, 18)); // 95k GLV
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(
        expandDecimals(95_000, 18)
      ); // 95k GLV
    });

    it("should revert if signature is invalid due to incorrect signer", async () => {
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

      createGlvDepositParams.signer = user2; // incorrect signer
      await expect(sendCreateGlvDeposit(createGlvDepositParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidRecoveredSigner"
      );

      createGlvDepositParams.signer = user1; // correct signer
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
      await expect(sendCreateGlvDeposit(createGlvDepositParams)).to.not.be.reverted;
    });

    it("should transfer WNT to relayer for relay fee", async () => {
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });

      const relayInitial = await wnt.balanceOf(GELATO_RELAY_ADDRESS);
      await sendCreateGlvDeposit(createGlvDepositParams);
      const relayFinal = await wnt.balanceOf(GELATO_RELAY_ADDRESS);
      expect(relayFinal.sub(relayInitial)).eq(relayFeeAmount);
    });

    it("should revert if deadline has passed", async () => {
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });

      createGlvDepositParams.deadline = 1; // past deadline
      await expect(sendCreateGlvDeposit(createGlvDepositParams)).to.be.revertedWithCustomError(
        errorsContract,
        "DeadlinePassed"
      );

      createGlvDepositParams.deadline = 9999999999; // future deadline
      await expect(sendCreateGlvDeposit(createGlvDepositParams)).to.not.be.reverted;
    });

    it("should revert if any data in params is tampered", async () => {
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });

      createGlvDepositParams.userNonce = 1; // set value upfront to have the same user nonce for relayParams here and when recalculated in sendCreateGlvDeposit
      const relayParams = await getRelayParams(createGlvDepositParams);
      const signature = await getCreateGlvDepositSignature({
        ...createGlvDepositParams,
        relayParams,
        verifyingContract: createGlvDepositParams.relayRouter.address,
      });
      createGlvDepositParams.signature = signature;

      createGlvDepositParams.params.minGlvTokens = 99; // tamper a param field
      await expect(sendCreateGlvDeposit(createGlvDepositParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidRecoveredSigner"
      );

      createGlvDepositParams.params.minGlvTokens = 100; // use the original value again
      await expect(sendCreateGlvDeposit(createGlvDepositParams)).to.not.be.reverted;
    });

    it("should revert if amounts cannot be covered", async () => {
      await expect(sendCreateGlvDeposit(createGlvDepositParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientMultichainBalance"
      );

      // bridge in long + fee tokens, but not USDC
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await expect(sendCreateGlvDeposit(createGlvDepositParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientMultichainBalance"
      );

      // bridge in short token as well
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
      await expect(sendCreateGlvDeposit(createGlvDepositParams)).to.not.be.reverted;
    });

    it("should transfer tokens from MultichainVault to GlvVault", async () => {
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });

      expect(await wnt.balanceOf(multichainVault.address)).to.eq(wntAmount.add(feeAmount));
      expect(await usdc.balanceOf(multichainVault.address)).to.eq(usdcAmount);
      expect(await wnt.balanceOf(glvVault.address)).to.eq(0);
      expect(await usdc.balanceOf(glvVault.address)).to.eq(0);

      await sendCreateGlvDeposit(createGlvDepositParams);

      expect(await wnt.balanceOf(multichainVault.address)).to.eq(0); // transferred out
      expect(await usdc.balanceOf(multichainVault.address)).to.eq(0); // transferred out
      expect(await wnt.balanceOf(glvVault.address)).to.eq(wntAmount.add(executionFee)); // transferred in
      expect(await usdc.balanceOf(glvVault.address)).to.eq(usdcAmount); // transferred in
    });

    it("should revert if user has insufficient multichain balance", async () => {
      // await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      // await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });

      await dataStore.setUint(keys.multichainBalanceKey(user0.address, wnt.address), 0); // remove balance
      await expect(sendCreateGlvDeposit(createGlvDepositParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientMultichainBalance"
      );
    });

    it("should revert if same params are reused (simulate replay)", async () => {
      createGlvDepositParams.userNonce = 1; // set value upfront to have the same user nonce for relayParams here and when recalculated in sendCreateGlvDeposit
      const relayParams = await getRelayParams(createGlvDepositParams);
      const signature = await getCreateGlvDepositSignature({
        ...createGlvDepositParams,
        relayParams,
        verifyingContract: createGlvDepositParams.relayRouter.address,
      });
      createGlvDepositParams.signature = signature;

      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
      await sendCreateGlvDeposit(createGlvDepositParams);

      // reuse exact same params and signature
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
      await expect(sendCreateGlvDeposit(createGlvDepositParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidUserDigest"
      );

      // reset nonce and signature (sendCreateGlvDeposit will recalculate them)
      createGlvDepositParams.userNonce = undefined;
      createGlvDepositParams.signature = undefined;
      await expect(sendCreateGlvDeposit(createGlvDepositParams)).to.not.be.reverted;
    });
  });

  describe("createGlvWithdrawal", () => {
    let defaultGlvWithdrawalParams;
    let createGlvWithdrawalParams: Parameters<typeof sendCreateGlvWithdrawal>[0];
    beforeEach(async () => {
      defaultGlvWithdrawalParams = {
        addresses: {
          receiver: user1.address,
          callbackContract: user2.address,
          uiFeeReceiver: user3.address,
          market: ethUsdMarket.marketToken,
          glv: ethUsdGlvAddress,
          longTokenSwapPath: [],
          shortTokenSwapPath: [],
        },
        minLongTokenAmount: 0,
        minShortTokenAmount: 0,
        shouldUnwrapNativeToken: false,
        executionFee, // 0.002 ETH
        callbackGasLimit: "200000",
        dataList: [],
      };

      createGlvWithdrawalParams = {
        sender: relaySigner,
        signer: user1,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: feeAmount, // 0.004 ETH
          feeSwapPath: [],
        },
        transferRequests: {
          tokens: [ethUsdGlvAddress],
          receivers: [glvVault.address],
          amounts: [expandDecimals(95_000, 18)],
        },
        account: user1.address,
        params: defaultGlvWithdrawalParams,
        deadline: 9999999999,
        chainId,
        srcChainId: chainId,
        desChainId: chainId,
        relayRouter: multichainGlvRouter,
        relayFeeToken: wnt.address,
        relayFeeAmount, // 0.002 ETH
      };
    });

    it("creates glvWithdrawal and sends relayer fee", async () => {
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
      await sendCreateGlvDeposit(createGlvDepositParams);
      await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });

      // before glv withdrawal is created (user has 0 GM and 95k GLV, the 95k GM tokens user initially had are now in ethUsdGlv)
      expect(await getGlvWithdrawalCount(dataStore)).eq(0);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).eq(0); // user's GM
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(
        expandDecimals(95_000, 18)
      ); // user's GLV
      expect(await getBalanceOf(ethUsdGlvAddress, glvVault.address)).eq(0); // GLV in glvVault
      expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).eq(expandDecimals(95_000, 18)); // GM in ethUsdGlv

      // create glvWithdrawal
      await bridgeInTokens(fixture, { account: user1, amount: relayFeeAmount }); // top-up user1's multichain balance to cover the relay fee
      await sendCreateGlvWithdrawal(createGlvWithdrawalParams);

      // before glv withdrawal is executed (user has 0 GM and 95k GLV)
      expect(await getGlvWithdrawalCount(dataStore)).eq(1);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).eq(0); // user's GM
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // user's GLV moved to glvVault
      expect(await getBalanceOf(ethUsdGlvAddress, glvVault.address)).eq(expandDecimals(95_000, 18)); // GLV in glvVault
      expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).eq(expandDecimals(95_000, 18)); // GM
      // user's multicahin assets
      // expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).eq(0);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).eq(0);

      await executeGlvWithdrawal(fixture, { gasUsageLabel: "executeGlvWithdrawal" });

      // after glv withdrawal is executed (user has 0 GM, 0 GLV and receives back 10 ETH and 45,000 USDC)
      expect(await getGlvWithdrawalCount(dataStore)).eq(0);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // GLV
      // user's multicahin assets
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).eq(
        expandDecimals(10, 18).add(executionFee)
      ); // 10.006 ETH
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).eq(
        expandDecimals(45_000, 6)
      ); // 45,000 USDC
    });

    it("should revert if signature is invalid due to incorrect signer", async () => {
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

      createGlvWithdrawalParams.signer = user2; // incorrect signer
      await expect(sendCreateGlvWithdrawal(createGlvWithdrawalParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidRecoveredSigner"
      );

      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(relayFeeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
      await sendCreateGlvDeposit(createGlvDepositParams);
      await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });

      createGlvWithdrawalParams.signer = user1; // correct signer
      await expect(sendCreateGlvWithdrawal(createGlvWithdrawalParams)).to.not.be.reverted;
    });

    it("should transfer WNT to relayer for relay fee", async () => {
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
      await sendCreateGlvDeposit(createGlvDepositParams);
      await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });
      await bridgeInTokens(fixture, { account: user1, amount: relayFeeAmount });

      const relayInitial = await wnt.balanceOf(GELATO_RELAY_ADDRESS);
      await sendCreateGlvWithdrawal(createGlvWithdrawalParams);
      const relayFinal = await wnt.balanceOf(GELATO_RELAY_ADDRESS);
      expect(relayFinal.sub(relayInitial)).eq(relayFeeAmount);
    });

    it("should revert if deadline has passed", async () => {
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
      await sendCreateGlvDeposit(createGlvDepositParams);
      await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });
      await bridgeInTokens(fixture, { account: user1, amount: relayFeeAmount });

      createGlvWithdrawalParams.deadline = 1; // past deadline
      await expect(sendCreateGlvWithdrawal(createGlvWithdrawalParams)).to.be.revertedWithCustomError(
        errorsContract,
        "DeadlinePassed"
      );

      createGlvWithdrawalParams.deadline = 9999999999; // future deadline
      await sendCreateGlvWithdrawal(createGlvWithdrawalParams); // ).to.not.be.reverted;
    });

    it("should revert if any data in params is tampered", async () => {
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
      await sendCreateGlvDeposit(createGlvDepositParams);
      await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });
      await bridgeInTokens(fixture, { account: user1, amount: relayFeeAmount });

      createGlvWithdrawalParams.userNonce = 1; // set value upfront to have the same user nonce for relayParams here and when recalculated in sendCreateGlvWithdrawal
      const relayParams = await getRelayParams(createGlvWithdrawalParams);
      const signature = await getCreateGlvWithdrawalSignature({
        ...createGlvWithdrawalParams,
        relayParams,
        verifyingContract: createGlvWithdrawalParams.relayRouter.address,
      });
      createGlvWithdrawalParams.signature = signature;

      createGlvWithdrawalParams.deadline = 9999999998; // tamper a param field
      // await sendCreateGlvWithdrawal(createGlvWithdrawalParams)
      await expect(sendCreateGlvWithdrawal(createGlvWithdrawalParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidRecoveredSigner"
      );

      createGlvWithdrawalParams.deadline = 9999999999; // use the original value again
      await expect(sendCreateGlvWithdrawal(createGlvWithdrawalParams)).to.not.be.reverted;
    });

    it("should revert if fee cannot be covered", async () => {
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
      await sendCreateGlvDeposit(createGlvDepositParams);
      await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });

      await expect(sendCreateGlvWithdrawal(createGlvWithdrawalParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientMultichainBalance"
      );

      await bridgeInTokens(fixture, { account: user1, amount: relayFeeAmount });
      await expect(sendCreateGlvWithdrawal(createGlvWithdrawalParams)).to.not.be.reverted;
    });

    it("should transfer tokens from MultichainVault to GlvVault", async () => {
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
      await sendCreateGlvDeposit(createGlvDepositParams);
      await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });

      expect(await getBalanceOf(ethUsdGlvAddress, multichainVault.address)).eq(expandDecimals(95_000, 18));
      expect(await getBalanceOf(ethUsdGlvAddress, glvVault.address)).eq(0);

      await bridgeInTokens(fixture, { account: user1, amount: relayFeeAmount });
      await sendCreateGlvWithdrawal(createGlvWithdrawalParams);

      expect(await getBalanceOf(ethUsdGlvAddress, multichainVault.address)).eq(0); // transferred out
      expect(await getBalanceOf(ethUsdGlvAddress, glvVault.address)).eq(expandDecimals(95_000, 18)); // transferred in
    });

    it("should revert if user has insufficient multichain balance", async () => {
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
      await sendCreateGlvDeposit(createGlvDepositParams);
      await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });
      await bridgeInTokens(fixture, { account: user1, amount: relayFeeAmount });

      const withdrawalAmount = expandDecimals(95_000, 18);
      createGlvWithdrawalParams.transferRequests.amounts = [withdrawalAmount.add(1)];
      await expect(sendCreateGlvWithdrawal(createGlvWithdrawalParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientMultichainBalance"
      );

      createGlvWithdrawalParams.transferRequests.amounts = [withdrawalAmount];
      await expect(sendCreateGlvWithdrawal(createGlvWithdrawalParams)).to.not.be.reverted;
    });

    it("should revert if same params are reused (simulate replay)", async () => {
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
      await sendCreateGlvDeposit(createGlvDepositParams);
      await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });

      createGlvWithdrawalParams.userNonce = 1; // set value upfront to have the same user nonce for relayParams here and when recalculated in sendCreateGlvWithdrawal
      createGlvWithdrawalParams.transferRequests.amounts = [expandDecimals(10_000, 18)]; // set lower withdrawal amount to enable multiple withdrawals
      const relayParams = await getRelayParams(createGlvWithdrawalParams);
      const signature = await getCreateGlvWithdrawalSignature({
        ...createGlvWithdrawalParams,
        relayParams,
        verifyingContract: createGlvWithdrawalParams.relayRouter.address,
      });
      createGlvWithdrawalParams.signature = signature;

      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
      await sendCreateGlvWithdrawal(createGlvWithdrawalParams);

      // reuse exact same params and signature
      await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
      await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
      await expect(sendCreateGlvWithdrawal(createGlvWithdrawalParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidUserDigest"
      );

      // reset nonce and signature (sendCreateGlvWithdrawal will recalculate them)
      createGlvWithdrawalParams.userNonce = undefined;
      createGlvWithdrawalParams.signature = undefined;
      await expect(sendCreateGlvWithdrawal(createGlvWithdrawalParams)).to.not.be.reverted;
    });

    describe("bridgeOutFromController", () => {
      const actionType = 3; // ActionType.BridgeOut
      const deadline = Math.floor(Date.now() / 1000) + 3600; // deadline (1 hour from now)
      const providerData = ethers.utils.defaultAbiCoder.encode(["uint32"], [1]); // providerData

      it("create glvDeposit and bridge out from controller the GLV tokens, on the same chain", async () => {
        await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
        await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });

        createGlvDepositParams.params.dataList = encodeBridgeOutDataList(
          actionType,
          chainId, // desChainId
          deadline,
          ethers.constants.AddressZero, // provider (can be the zero address since the tokens are transferred directly to the user's wallet on the same chain)
          providerData,
          0 // minAmountOut
        );

        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).eq(
          wntAmount.add(feeAmount)
        );
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).eq(usdcAmount);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // 0 GLV
        expect(await getBalanceOf(ethUsdGlvAddress, user0.address)).eq(0); // 0 GLV

        await sendCreateGlvDeposit(createGlvDepositParams);
        await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit/bridgeOutFromController" });

        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).eq(executionFee);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // GLV bridged out from user's multichain balance
        expect(await getBalanceOf(ethUsdGlvAddress, user1.address)).eq(expandDecimals(95_000, 18)); // 95k GLV bridged out into user's wallet
      });

      it("creates glvWithdrawal and bridge out from controller the long / short tokens, on the same chain", async () => {
        await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
        await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });
        await sendCreateGlvDeposit(createGlvDepositParams);
        await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });

        expect(await getBalanceOf(ethUsdGlvAddress, user1.address)).eq(0);
        expect(await getBalanceOf(wnt.address, user1.address)).eq(0);
        expect(await getBalanceOf(usdc.address, user1.address)).eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(
          expandDecimals(95_000, 18)
        ); // 95k GLV
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).eq(executionFee); // refund from the glvDeposit execution
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).eq(0); // 0 USDC

        // enable bridge out from controller
        createGlvWithdrawalParams.params.dataList = encodeBridgeOutDataList(
          actionType,
          chainId, // desChainId
          deadline,
          ethers.constants.AddressZero, // provider (can be the zero address since the tokens are transferred directly to the user's wallet on the same chain)
          providerData,
          0, // minAmountOut
          ethers.constants.AddressZero, // secondaryProvider
          providerData,
          0 // secondaryMinAmountOut
        );

        await bridgeInTokens(fixture, { account: user1, amount: relayFeeAmount }); // top-up user1's multichain balance to cover the relay fee
        await sendCreateGlvWithdrawal(createGlvWithdrawalParams);
        await executeGlvWithdrawal(fixture, { gasUsageLabel: "executeGlvWithdrawal" });

        // withdrawn funds are bridged out to user's wallet
        expect(await getBalanceOf(ethUsdGlvAddress, user1.address)).eq(0);
        expect(await getBalanceOf(wnt.address, user1.address)).eq(wntAmount);
        expect(await getBalanceOf(usdc.address, user1.address)).eq(usdcAmount);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // GLV
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).eq(executionFee); // 0.004 ETH
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).eq(0); // 0 USDC
      });
    });
  });
});
