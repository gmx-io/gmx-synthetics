import { expect } from "chai";

import * as keys from "../../utils/keys";
import { deployFixture } from "../../utils/fixture";
import { deployContract } from "../../utils/deploy";
import { grantRole } from "../../utils/role";
import { parseLogs, getEventData } from "../../utils/event";
import { expandDecimals } from "../../utils/math";
import {
  encodeStakeGmxMessage,
  encodeUnstakeGmxMessage,
  encodeHandleStakingRewardsMessage,
  encodeVestEsGmxMessage,
  encodeWithdrawVestingMessage,
  fundMultichainBalance,
  setupEsGmxPrivateTransferMode,
} from "../../utils/multichain";

describe("LayerZeroProvider staking dispatch", () => {
  let fixture;
  let user0;
  let dataStore,
    roleStore,
    wnt,
    usdc,
    gmx,
    esGmx,
    multichainVault,
    layerZeroProvider,
    multichainStakingRouter,
    gmxAccountWalletFactory,
    mockRewardRouterV2,
    mockGmxVester,
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
      roleStore,
      wnt,
      usdc,
      gmx,
      esGmx,
      multichainVault,
      layerZeroProvider,
      multichainStakingRouter,
      gmxAccountWalletFactory,
      mockRewardRouterV2,
      mockGmxVester,
      mockStargatePoolUsdc,
      mockStargatePoolNative,
    } = fixture.contracts);

    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    await setupEsGmxPrivateTransferMode(fixture);

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

  it("dispatches WithdrawVesting via lzCompose", async () => {
    // Vest esGMX via LZ compose
    await fundMultichainBalance(fixture, { account: user0.address, token: esGmx, amount: stakeAmount });
    const vestMessage = await encodeVestEsGmxMessage(getStakingParams({ amount: stakeAmount }), user0.address);
    await mintUsdcAndApprove(user0, usdcAmount);
    await mockStargatePoolUsdc.connect(user0).sendToken(layerZeroProvider.address, usdcAmount, vestMessage);

    const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
    expect(await mockGmxVester.depositedAmounts(walletAddress)).to.equal(stakeAmount);

    // Pretend part of the deposit vested into claimable GMX
    const claimableAmount = expandDecimals(40, 18);
    await gmx.mint(mockGmxVester.address, claimableAmount);
    await mockGmxVester.setClaimable(walletAddress, claimableAmount);

    // WithdrawVesting via LZ compose
    const withdrawMessage = await encodeWithdrawVestingMessage(getStakingParams(), user0.address);
    await mintUsdcAndApprove(user0, usdcAmount);
    await mockStargatePoolUsdc.connect(user0).sendToken(layerZeroProvider.address, usdcAmount, withdrawMessage);

    // Vester position is closed, esGMX and GMX are back in the multichain balance
    expect(await mockGmxVester.depositedAmounts(walletAddress)).to.equal(0);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, esGmx.address))).to.equal(stakeAmount);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, gmx.address))).to.equal(claimableAmount);
  });

  it("resolves the original wallet through a replacement factory, router and provider set", async () => {
    // user0 stakes through the original set
    await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });
    const stakeMessage = await encodeStakeGmxMessage(getStakingParams({ amount: stakeAmount }), user0.address);
    await mintUsdcAndApprove(user0, usdcAmount);
    await mockStargatePoolUsdc.connect(user0).sendToken(layerZeroProvider.address, usdcAmount, stakeMessage);

    const wallet = await gmxAccountWalletFactory.getWallet(user0.address);
    expect(await mockRewardRouterV2.stakedGmxAmounts(wallet)).to.equal(stakeAmount);

    // the factory is replaced; a new staking router and LayerZero provider are wired against it
    const eventEmitter = await hre.ethers.getContract("EventEmitter");
    const factory2 = await deployContract("GmxAccountWalletFactory", [
      roleStore.address,
      dataStore.address,
      eventEmitter.address,
    ]);
    await grantRole(roleStore, factory2.address, "CONTROLLER");

    const routerLibraries = {};
    for (const name of [
      "GasUtils",
      "MultichainUtils",
      "RelayUtils",
      "StakingUtils",
      "MultichainStakingUtils",
      "SignatureUtils",
    ]) {
      routerLibraries[name] = (await hre.ethers.getContract(name)).address;
    }
    const baseParams = {
      router: (await hre.ethers.getContract("Router")).address,
      roleStore: roleStore.address,
      dataStore: dataStore.address,
      eventEmitter: eventEmitter.address,
      oracle: (await hre.ethers.getContract("Oracle")).address,
      orderVault: (await hre.ethers.getContract("OrderVault")).address,
      orderHandler: (await hre.ethers.getContract("OrderHandler")).address,
      swapHandler: (await hre.ethers.getContract("SwapHandler")).address,
      externalHandler: (await hre.ethers.getContract("ExternalHandler")).address,
      multichainVault: multichainVault.address,
    };
    const router2 = await deployContract(
      "MultichainStakingRouter",
      [baseParams, factory2.address, mockRewardRouterV2.address],
      { libraries: routerLibraries }
    );
    await grantRole(roleStore, router2.address, "CONTROLLER");
    await grantRole(roleStore, router2.address, "ROUTER_PLUGIN");

    const providerLibraries = {};
    for (const name of ["MultichainUtils", "LayerZeroProviderUtils"]) {
      providerLibraries[name] = (await hre.ethers.getContract(name)).address;
    }
    const provider2 = await deployContract(
      "LayerZeroProvider",
      [
        dataStore.address,
        roleStore.address,
        eventEmitter.address,
        multichainVault.address,
        (await hre.ethers.getContract("MultichainGmRouter")).address,
        (await hre.ethers.getContract("MultichainGlvRouter")).address,
        (await hre.ethers.getContract("MultichainOrderRouter")).address,
        router2.address,
      ],
      { libraries: providerLibraries }
    );
    await grantRole(roleStore, provider2.address, "CONTROLLER");
    await dataStore.setBool(keys.isRelayFeeExcludedKey(provider2.address), true);

    // an exit dispatched through the replacement set reaches the original wallet
    const unstakeAmount = expandDecimals(40, 18);
    const unstakeMessage = await encodeUnstakeGmxMessage(
      getStakingParams({ amount: unstakeAmount, relayRouter: router2 }),
      user0.address
    );
    await mintUsdcAndApprove(user0, usdcAmount);
    const tx = await mockStargatePoolUsdc.connect(user0).sendToken(provider2.address, usdcAmount, unstakeMessage);

    // outcomes, not just absence of reverts: the action executed, nothing was swallowed
    const parsedLogs = parseLogs(fixture, await tx.wait());
    expect(getEventData(parsedLogs, "MultichainBridgeActionFailed")).to.be.undefined;
    expect(await mockRewardRouterV2.stakedGmxAmounts(wallet)).to.equal(stakeAmount.sub(unstakeAmount));
    expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, gmx.address))).to.equal(unstakeAmount);
  });

  it("swallows a walletless exit into a failure event and preserves the bridged tokens", async () => {
    // user0 has no wallet; an unstake arrives over the bridge
    const message = await encodeUnstakeGmxMessage(getStakingParams({ amount: stakeAmount }), user0.address);
    await mintUsdcAndApprove(user0, usdcAmount);

    const tx = await mockStargatePoolUsdc.connect(user0).sendToken(layerZeroProvider.address, usdcAmount, message);

    // the failure is swallowed into an event, the outer transaction succeeds
    const parsedLogs = parseLogs(fixture, await tx.wait());
    expect(getEventData(parsedLogs, "MultichainBridgeActionFailed")).to.not.be.undefined;

    // bridged tokens are credited, nothing else changes and no wallet is created
    expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).to.equal(usdcAmount);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, gmx.address))).to.equal(0);
    expect(await gmxAccountWalletFactory.getWallet(user0.address)).to.equal(hre.ethers.constants.AddressZero);
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
