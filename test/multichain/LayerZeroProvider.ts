import { expect } from "chai";

import * as keys from "../../utils/keys";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { encodeDepositMessage, encodeSetTraderReferralCodeMessage, mintAndBridge } from "../../utils/multichain";
import { hashString } from "../../utils/hash";
import { sendSetTraderReferralCode } from "../../utils/relay/gelatoRelay";
import { sendCreateDeposit } from "../../utils/relay/multichain";
import { executeDeposit, getDepositCount } from "../../utils/deposit";

describe("LayerZeroProvider", () => {
  let fixture;
  let user0, user1;
  let dataStore,
    wnt,
    usdc,
    ethUsdMarket,
    depositVault,
    multichainVault,
    layerZeroProvider,
    multichainGmRouter,
    multichainOrderRouter,
    mockStargatePoolWnt,
    mockStargatePoolUsdc,
    referralStorage;
  let chainId;
  const referralCode = hashString("referralCode");

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({
      dataStore,
      wnt,
      usdc,
      ethUsdMarket,
      depositVault,
      multichainVault,
      layerZeroProvider,
      multichainGmRouter,
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
    it("mintAndBridge: usdc", async () => {
      const amount = expandDecimals(1000, 6);

      await mintAndBridge(fixture, {
        token: usdc,
        tokenAmount: amount,
      });

      // usdc has been transterred from LayerZeroProvider to MultichainVault and recorded under the user's multicahin balance
      expect(await usdc.balanceOf(layerZeroProvider.address)).eq(0);
      expect(await usdc.balanceOf(multichainVault.address)).eq(amount);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).eq(amount);
    });

    describe("actionType: Deposit", () => {
      const wntAmount = expandDecimals(9, 18);
      const usdcAmount = expandDecimals(45_000, 6);
      const executionFee = expandDecimals(4, 15); // 0.004 ETH

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

      it("creates deposit without paying relayFee if LayerZeroProvider is whitelisted", async () => {
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), chainId);
        // whitelist LayerZeroProvider to be excluded from paying the relay fee
        await dataStore.setBool(keys.isRelayFeeExcludedKey(layerZeroProvider.address), true);
        // enable MultichainOrderRouter to call ReferralStorage.setTraderReferralCode
        await referralStorage.setHandler(multichainOrderRouter.address, true);

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
    });

    describe("actionType: SetTraderReferralCode", () => {
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
