import { expect } from "chai";

import * as keys from "../../utils/keys";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { encodeSetTraderReferralCodeMessage, mintAndBridge } from "../../utils/multichain";
import { hashString } from "../../utils/hash";
import { sendSetTraderReferralCode } from "../../utils/relay/gelatoRelay";

describe("LayerZeroProvider", () => {
  let fixture;
  let user0, user1;
  let dataStore,
    wnt,
    usdc,
    multichainVault,
    layerZeroProvider,
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
      multichainVault,
      layerZeroProvider,
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
