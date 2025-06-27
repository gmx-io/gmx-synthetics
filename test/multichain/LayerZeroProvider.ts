import { expect } from "chai";

import * as keys from "../../utils/keys";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import {
  encodeDepositMessage,
  encodeGlvDepositMessage,
  encodeSetTraderReferralCodeMessage,
  encodeWithdrawalMessage,
  mintAndBridge,
} from "../../utils/multichain";
import { hashString } from "../../utils/hash";
import { sendSetTraderReferralCode } from "../../utils/relay/gelatoRelay";
import { sendCreateDeposit, sendCreateGlvDeposit, sendCreateWithdrawal } from "../../utils/relay/multichain";
import { executeDeposit, getDepositCount } from "../../utils/deposit";
import { executeGlvDeposit, getGlvDepositCount } from "../../utils/glv";
import { executeWithdrawal, getWithdrawalCount } from "../../utils/withdrawal";

describe("LayerZeroProvider", () => {
  let fixture;
  let user0, user1;
  let dataStore,
    wnt,
    usdc,
    ethUsdMarket,
    ethUsdGlvAddress,
    depositVault,
    withdrawalVault,
    glvVault,
    multichainVault,
    layerZeroProvider,
    multichainGmRouter,
    multichainGlvRouter,
    multichainOrderRouter,
    mockStargatePoolWnt,
    mockStargatePoolUsdc,
    referralStorage;
  let chainId;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({
      dataStore,
      wnt,
      usdc,
      ethUsdMarket,
      ethUsdGlvAddress,
      depositVault,
      withdrawalVault,
      glvVault,
      multichainVault,
      layerZeroProvider,
      multichainGmRouter,
      multichainGlvRouter,
      multichainOrderRouter,
      mockStargatePoolWnt,
      mockStargatePoolUsdc,
      referralStorage,
    } = fixture.contracts);

    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);

    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolWnt.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolWnt.address), true);

    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
  });

  describe("lzCompose", async () => {
    const wntAmount = expandDecimals(9, 18);
    const usdcAmount = expandDecimals(45_000, 6);
    const executionFee = expandDecimals(4, 15); // 0.004 ETH

    it("mintAndBridge: usdc", async () => {
      await mintAndBridge(fixture, {
        token: usdc,
        tokenAmount: usdcAmount,
      });

      // usdc has been transterred from LayerZeroProvider to MultichainVault and recorded under the user's multicahin balance
      expect(await usdc.balanceOf(layerZeroProvider.address)).eq(0);
      expect(await usdc.balanceOf(multichainVault.address)).eq(usdcAmount);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).eq(usdcAmount);
    });

    describe("actionType: Deposit, Withdrawal", () => {
      let createDepositParams: Parameters<typeof sendCreateDeposit>[0];
      beforeEach(async () => {
        const defaultDepositParams = {
          addresses: {
            receiver: user1.address,
            callbackContract: user1.address,
            uiFeeReceiver: user1.address,
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
        createDepositParams = {
          sender: user1, // sender is user1 on the source chain, not GELATO_RELAY_ADDRESS
          signer: user1,
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
          account: user1.address,
          params: defaultDepositParams,
          deadline: 9999999999,
          chainId,
          srcChainId: chainId, // 0 would mean same chain action
          desChainId: chainId,
          relayRouter: multichainGmRouter,
          relayFeeToken: wnt.address,
          relayFeeAmount: 0,
        };
      });

      beforeEach(async () => {
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), chainId);
        // whitelist LayerZeroProvider to be excluded from paying the relay fee
        await dataStore.setBool(keys.isRelayFeeExcludedKey(layerZeroProvider.address), true);
      });

      it("creates deposit without paying relayFee if LayerZeroProvider is whitelisted", async () => {
        await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: wntAmount.add(executionFee) });
        await usdc.mint(user1.address, usdcAmount);
        await usdc.connect(user1).approve(mockStargatePoolUsdc.address, usdcAmount);

        expect(await getDepositCount(dataStore)).eq(0);
        expect(await usdc.balanceOf(user1.address)).to.eq(usdcAmount);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);
        expect(await usdc.balanceOf(layerZeroProvider.address)).to.eq(0);

        const message = await encodeDepositMessage(createDepositParams, user1.address);
        await mockStargatePoolUsdc.connect(user1).sendToken(layerZeroProvider.address, usdcAmount, message);

        expect(await getDepositCount(dataStore)).eq(1);
        expect(await usdc.balanceOf(user1.address)).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(0);
        expect(await usdc.balanceOf(layerZeroProvider.address)).to.eq(0); // does not change

        await executeDeposit(fixture, { gasUsageLabel: "executeDeposit" });

        expect(await getDepositCount(dataStore)).eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(
          expandDecimals(90_000, 18)
        ); // 90,000 GM
      });

      it("creates withdrawal without paying relayFee if LayerZeroProvider is whitelisted", async () => {
        // first create and execute deposit
        await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: wntAmount.add(executionFee) });
        await usdc.mint(user1.address, usdcAmount);
        await usdc.connect(user1).approve(mockStargatePoolUsdc.address, usdcAmount);
        const depositMessage = await encodeDepositMessage(createDepositParams, user1.address);
        await mockStargatePoolUsdc.connect(user1).sendToken(layerZeroProvider.address, usdcAmount, depositMessage);
        await executeDeposit(fixture, { gasUsageLabel: "executeDeposit" });

        const defaultWithdrawalParams = {
          addresses: {
            receiver: user1.address,
            callbackContract: user1.address,
            uiFeeReceiver: user1.address,
            market: ethUsdMarket.marketToken,
            longTokenSwapPath: [],
            shortTokenSwapPath: [],
          },
          minLongTokenAmount: 0,
          minShortTokenAmount: 0,
          shouldUnwrapNativeToken: false,
          executionFee,
          callbackGasLimit: "200000",
          dataList: [],
        };
        const createWithdrawalParams = {
          sender: user1, // sender is user1 on the source chain, not GELATO_RELAY_ADDRESS
          signer: user1,
          feeParams: {
            feeToken: wnt.address,
            feeAmount: executionFee,
            feeSwapPath: [],
          },
          transferRequests: {
            tokens: [ethUsdMarket.marketToken],
            receivers: [withdrawalVault.address],
            amounts: [expandDecimals(22_500, 18)], // withdraw 25% of GM tokens
          },
          account: user1.address, // user1 was the receiver of the deposit
          params: defaultWithdrawalParams,
          deadline: 9999999999,
          chainId,
          srcChainId: chainId,
          desChainId: chainId,
          relayRouter: multichainGmRouter,
          relayFeeToken: wnt.address,
          relayFeeAmount: 0,
        };

        expect(await getWithdrawalCount(dataStore)).eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(executionFee);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(
          expandDecimals(90_000, 18)
        ); // 90,000 GM

        const withdrawalMessage = await encodeWithdrawalMessage(createWithdrawalParams, user1.address);
        // await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: executionFee });
        const minBridgingAmount = expandDecimals(1, 6); // minimum amount required by a stargate pool to bridge a message
        await usdc.mint(user1.address, minBridgingAmount);
        await usdc.connect(user1).approve(mockStargatePoolUsdc.address, minBridgingAmount);
        await mockStargatePoolUsdc
          .connect(user1)
          .sendToken(layerZeroProvider.address, minBridgingAmount, withdrawalMessage);

        expect(await getWithdrawalCount(dataStore)).eq(1);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(
          minBridgingAmount
        );
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(
          expandDecimals(67_500, 18)
        ); // 90,000 - 22,500 = 67,500 GM

        // GM tokens are burned and wnt/usdc are sent to multichainVault and user's multichain balance is increased
        await executeWithdrawal(fixture, { gasUsageLabel: "executeWithdrawal" });

        expect(await getWithdrawalCount(dataStore)).eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          wntAmount.div(4).add(executionFee)
        ); // 25% of GM tokens were withdrawn, so 25% of wnt is sent to multichainVault
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(
          usdcAmount.div(4).add(minBridgingAmount)
        ); // 25% of GM tokens were withdrawn, so 25% of usdc is sent to multichainVault
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(
          expandDecimals(67_500, 18)
        ); // 90,000 - 22,500 = 67,500 GM
      });
    });

    describe("actionType: GlvDeposit", () => {
      let createGlvDepositParams: Parameters<typeof sendCreateGlvDeposit>[0];
      beforeEach(async () => {
        const defaultGlvDepositParams = {
          addresses: {
            glv: ethUsdGlvAddress,
            receiver: user1.address,
            callbackContract: user1.address,
            uiFeeReceiver: user1.address,
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
          sender: user1, // sender is user1 on the source chain, not GELATO_RELAY_ADDRESS
          signer: user1,
          feeParams: {
            feeToken: wnt.address,
            feeAmount: executionFee, // 0.004 ETH
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
          relayFeeAmount: 0,
        };
      });

      it("creates glvDeposit, using long / short tokens, without paying relayFee if LayerZeroProvider is whitelisted", async () => {
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), chainId);
        // whitelist LayerZeroProvider to be excluded from paying the relay fee
        await dataStore.setBool(keys.isRelayFeeExcludedKey(layerZeroProvider.address), true);

        await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: wntAmount.add(executionFee) });
        await usdc.mint(user1.address, usdcAmount);
        await usdc.connect(user1).approve(mockStargatePoolUsdc.address, usdcAmount);

        expect(await getGlvDepositCount(dataStore)).eq(0);
        expect(await usdc.balanceOf(user1.address)).to.eq(usdcAmount);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);
        expect(await usdc.balanceOf(layerZeroProvider.address)).to.eq(0);

        const message = await encodeGlvDepositMessage(createGlvDepositParams, user1.address);
        await mockStargatePoolUsdc.connect(user1).sendToken(layerZeroProvider.address, usdcAmount, message);

        expect(await getGlvDepositCount(dataStore)).eq(1);
        expect(await usdc.balanceOf(user1.address)).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).to.eq(0);
        expect(await usdc.balanceOf(layerZeroProvider.address)).to.eq(0); // does not change

        await executeGlvDeposit(fixture, { gasUsageLabel: "executeDeposit" });

        expect(await getGlvDepositCount(dataStore)).eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).to.eq(
          expandDecimals(90_000, 18)
        ); // 90,000 GM
      });
    });

    describe("actionType: SetTraderReferralCode", () => {
      const referralCode = hashString("referralCode");

      let setTraderReferralCodeParams: Parameters<typeof sendSetTraderReferralCode>[0];
      beforeEach(async () => {
        setTraderReferralCodeParams = {
          sender: user1, // sender is user1 on the source chain, not GELATO_RELAY_ADDRESS
          signer: user1,
          feeParams: {
            feeToken: wnt.address,
            feeAmount: 0,
            feeSwapPath: [],
          },
          account: user1.address,
          referralCode,
          deadline: 9999999999,
          srcChainId: chainId, // 0 means non-multichain action
          desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
          relayRouter: multichainOrderRouter,
          chainId,
          gelatoRelayFeeToken: wnt.address,
          gelatoRelayFeeAmount: 0,
        };
      });

      it("sets trader referral code without paying relayFee if LayerZeroProvider is whitelisted", async () => {
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), chainId);
        // whitelist LayerZeroProvider to be excluded from paying the relay fee
        await dataStore.setBool(keys.isRelayFeeExcludedKey(layerZeroProvider.address), true);
        // enable MultichainOrderRouter to call ReferralStorage.setTraderReferralCode
        await referralStorage.setHandler(multichainOrderRouter.address, true);

        const usdcAmount = expandDecimals(1, 5); // 0.1 USDC --> e.g. minimum amount required by a stargate pool to bridge a message
        await usdc.mint(user1.address, usdcAmount);
        await usdc.connect(user1).approve(mockStargatePoolUsdc.address, usdcAmount);

        expect(await usdc.balanceOf(user1.address)).to.eq(usdcAmount);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);
        expect(await usdc.balanceOf(layerZeroProvider.address)).to.eq(0);
        expect(await referralStorage.traderReferralCodes(user0.address)).eq(ethers.constants.HashZero);

        const message = await encodeSetTraderReferralCodeMessage(
          setTraderReferralCodeParams,
          referralCode,
          user1.address
        );
        await mockStargatePoolUsdc.connect(user1).sendToken(layerZeroProvider.address, usdcAmount, message);

        // referralCode is set, usdcAmount is added to user's multichain balance
        expect(await usdc.balanceOf(user1.address)).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(usdcAmount);
        expect(await usdc.balanceOf(layerZeroProvider.address)).to.eq(0); // does not change
        expect(await referralStorage.traderReferralCodes(user1.address)).eq(referralCode);
      });
    });
  });
});
