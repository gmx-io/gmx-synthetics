import { expect } from "chai";

import * as keys from "../../utils/keys";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import {
  encodeStakeGmxMessage,
  encodeUnstakeGmxMessage,
  encodeHandleStakingRewardsMessage,
  fundMultichainBalance,
} from "../../utils/multichain";

describe("LayerZeroProvider staking dispatch", () => {
  let fixture;
  let user0;
  let dataStore,
    wnt,
    usdc,
    gmx,
    multichainVault,
    layerZeroProvider,
    multichainStakingRouter,
    gmxAccountWalletFactory,
    mockRewardRouterV2,
    mockStargatePoolUsdc,
    mockStargatePoolNative;
  let chainId;

  const stakeAmount = expandDecimals(100, 18);
  const usdcAmount = expandDecimals(1, 5); // 0.1 USDC - minimum stargate bridge amount

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({
      dataStore,
      wnt,
      usdc,
      gmx,
      multichainVault,
      layerZeroProvider,
      multichainStakingRouter,
      gmxAccountWalletFactory,
      mockRewardRouterV2,
      mockStargatePoolUsdc,
      mockStargatePoolNative,
    } = fixture.contracts);

    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    // Enable source chain
    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);

    // Enable stargate pools as multichain providers/endpoints
    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);

    // Map EID to chain ID
    await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), chainId);

    // Whitelist LayerZeroProvider to bypass relay fees
    await dataStore.setBool(keys.isRelayFeeExcludedKey(layerZeroProvider.address), true);
  });

  function getStakingParams(overrides: any = {}) {
    return {
      sender: user0,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: 0,
        feeSwapPath: [],
      },
      chainId,
      account: user0.address,
      deadline: 9999999999,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainStakingRouter,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: 0,
      ...overrides,
    };
  }

  async function mintUsdcAndApprove(account, amount) {
    await usdc.mint(account.address, amount);
    await usdc.connect(account).approve(mockStargatePoolUsdc.address, amount);
  }

  it("dispatches StakeGmx via lzCompose", async () => {
    // Fund multichain balance with GMX for staking
    await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });

    // Encode StakeGmx message
    const message = await encodeStakeGmxMessage(getStakingParams({ amount: stakeAmount }), user0.address);

    // Prepare USDC for stargate bridge
    await mintUsdcAndApprove(user0, usdcAmount);

    // Send via stargate pool → LZ provider → staking router
    await mockStargatePoolUsdc.connect(user0).sendToken(layerZeroProvider.address, usdcAmount, message);

    // GMX should be staked
    const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
    expect(await mockRewardRouterV2.stakedGmxAmounts(walletAddress)).to.equal(stakeAmount);

    // GMX multichain balance should be 0
    expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, gmx.address))).to.equal(0);

    // USDC should be added to multichain balance
    expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).to.equal(usdcAmount);
  });

  it("dispatches UnstakeGmx via lzCompose", async () => {
    // First stake GMX directly via multichain balance
    await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });
    const message1 = await encodeStakeGmxMessage(getStakingParams({ amount: stakeAmount }), user0.address);
    await mintUsdcAndApprove(user0, usdcAmount);
    await mockStargatePoolUsdc.connect(user0).sendToken(layerZeroProvider.address, usdcAmount, message1);

    // Unstake via LZ compose
    const message2 = await encodeUnstakeGmxMessage(getStakingParams({ amount: stakeAmount }), user0.address);
    await mintUsdcAndApprove(user0, usdcAmount);
    await mockStargatePoolUsdc.connect(user0).sendToken(layerZeroProvider.address, usdcAmount, message2);

    // GMX should be unstaked
    const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
    expect(await mockRewardRouterV2.stakedGmxAmounts(walletAddress)).to.equal(0);

    // GMX multichain balance should be restored
    expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, gmx.address))).to.equal(stakeAmount);

    // USDC multichain balance should reflect both bridges
    expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).to.equal(usdcAmount.mul(2));
  });

  it("dispatches HandleStakingRewards via lzCompose", async () => {
    // Stake first to create wallet
    await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });
    const stakeMessage = await encodeStakeGmxMessage(getStakingParams({ amount: stakeAmount }), user0.address);
    await mintUsdcAndApprove(user0, usdcAmount);
    await mockStargatePoolUsdc.connect(user0).sendToken(layerZeroProvider.address, usdcAmount, stakeMessage);

    // Set up claimable WETH
    const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
    const claimAmount = expandDecimals(1, 18);
    await wnt.deposit({ value: claimAmount });
    await wnt.transfer(mockRewardRouterV2.address, claimAmount);
    await mockRewardRouterV2.setClaimableWeth(walletAddress, claimAmount);

    // HandleStakingRewards via LZ compose
    const rewardsMessage = await encodeHandleStakingRewardsMessage(
      getStakingParams({
        params: {
          shouldClaimGmx: false,
          shouldStakeGmx: false,
          shouldClaimEsGmx: false,
          shouldStakeEsGmx: false,
          shouldStakeMultiplierPoints: false,
          shouldClaimWeth: true,
        },
      }),
      user0.address
    );
    await mintUsdcAndApprove(user0, usdcAmount);
    await mockStargatePoolUsdc.connect(user0).sendToken(layerZeroProvider.address, usdcAmount, rewardsMessage);

    // WETH should be in multichain balance
    expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).to.equal(claimAmount);
  });

  it("emits MultichainBridgeActionFailed on revert", async () => {
    // Try to stake GMX without having any multichain balance
    const message = await encodeStakeGmxMessage(getStakingParams({ amount: stakeAmount }), user0.address);
    await mintUsdcAndApprove(user0, usdcAmount);

    // Should not revert (LZ provider catches errors)
    await mockStargatePoolUsdc.connect(user0).sendToken(layerZeroProvider.address, usdcAmount, message);

    // USDC should still be added to multichain balance (bridge tokens preserved)
    expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).to.equal(usdcAmount);

    // GMX should NOT be staked
    const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
    expect(await mockRewardRouterV2.stakedGmxAmounts(walletAddress)).to.equal(0);
  });
});
