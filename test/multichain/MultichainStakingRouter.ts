import { expect } from "chai";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import {
  sendStakeGmx,
  sendUnstakeGmx,
  sendStakeEsGmx,
  sendUnstakeEsGmx,
  sendHandleStakingRewards,
  sendCompoundStakingRewards,
  sendVestEsGmx,
  sendDelegateGovGmx,
  sendSignalStakingTransfer,
  sendAcceptStakingTransfer,
  sendWithdrawFromWallet,
} from "../../utils/relay/gelatoRelay";
import { grantRole } from "../../utils/role";
import { fundMultichainBalance } from "../../utils/multichain";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("MultichainStakingRouter", () => {
  let fixture;
  let user0, user1;
  let dataStore,
    roleStore,
    multichainVault,
    multichainStakingRouter,
    gmxAccountWalletFactory,
    mockRewardRouterV2,
    mockGovToken,
    mockGmxVester,
    gmx,
    esGmx,
    wnt;
  let relaySigner;
  let chainId;

  const stakeAmount = expandDecimals(100, 18);
  const relayFeeAmount = expandDecimals(2, 15); // 0.002 ETH

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({
      dataStore,
      roleStore,
      multichainVault,
      multichainStakingRouter,
      gmxAccountWalletFactory,
      mockRewardRouterV2,
      mockGovToken,
      mockGmxVester,
      gmx,
      esGmx,
      wnt,
    } = fixture.contracts);

    await impersonateAccount(GELATO_RELAY_ADDRESS);
    await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(1, 16));

    relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);
    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    // Enable source chain
    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
  });

  function getDefaultStakingRelayParams(overrides: any = {}) {
    return {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: 0,
        feeSwapPath: [],
      },
      chainId,
      account: user0.address,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainStakingRouter,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: 0,
      ...overrides,
    };
  }

  describe("stakeGmx", () => {
    it("stakes GMX: transfers from multichain balance to V1 via wallet", async () => {
      await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });

      // Verify initial multichain balance
      const balanceBefore = await dataStore.getUint(keys.multichainBalanceKey(user0.address, gmx.address));
      expect(balanceBefore).to.equal(stakeAmount);

      // Stake
      await sendStakeGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));

      // Multichain balance should be reduced
      const balanceAfter = await dataStore.getUint(keys.multichainBalanceKey(user0.address, gmx.address));
      expect(balanceAfter).to.equal(0);

      // Wallet should be deployed
      const walletCode = await hre.ethers.provider.getCode(
        await gmxAccountWalletFactory.getWalletAddress(user0.address)
      );
      expect(walletCode).to.not.equal("0x");

      // GMX should be in the mock reward router (staked)
      const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      expect(await mockRewardRouterV2.stakedGmxAmounts(walletAddress)).to.equal(stakeAmount);

      // GMX should be held by mock reward router
      expect(await gmx.balanceOf(mockRewardRouterV2.address)).to.equal(stakeAmount);
    });

    it("creates wallet on first stake, reuses on second", async () => {
      await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount.mul(2) });

      // First stake creates wallet
      const tx1 = await sendStakeGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));
      const receipt1 = await tx1.wait();
      // Check for WalletCreated event in the logs
      const walletCreatedTopic = gmxAccountWalletFactory.interface.getEventTopic("WalletCreated");
      const walletCreatedLogs1 = receipt1.logs.filter((l) => l.topics[0] === walletCreatedTopic);
      expect(walletCreatedLogs1.length).to.equal(1);

      // Second stake reuses wallet
      const tx2 = await sendStakeGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));
      const receipt2 = await tx2.wait();
      const walletCreatedLogs2 = receipt2.logs.filter((l) => l.topics[0] === walletCreatedTopic);
      expect(walletCreatedLogs2.length).to.equal(0);
    });
  });

  describe("unstakeGmx", () => {
    it("unstakes GMX: V1 → wallet → multichain balance", async () => {
      // Stake first
      await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });
      await sendStakeGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));

      // Unstake
      await sendUnstakeGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));

      // Multichain balance should be restored
      const balanceAfter = await dataStore.getUint(keys.multichainBalanceKey(user0.address, gmx.address));
      expect(balanceAfter).to.equal(stakeAmount);

      // GMX should be in the multichainVault
      expect(await gmx.balanceOf(multichainVault.address)).to.be.gte(stakeAmount);

      // Staked amount should be 0
      const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      expect(await mockRewardRouterV2.stakedGmxAmounts(walletAddress)).to.equal(0);
    });
  });

  describe("stakeEsGmx", () => {
    it("stakes esGMX from multichain balance", async () => {
      await fundMultichainBalance(fixture, { account: user0.address, token: esGmx, amount: stakeAmount });

      await sendStakeEsGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));

      // Multichain esGMX balance should be 0
      const balanceAfter = await dataStore.getUint(keys.multichainBalanceKey(user0.address, esGmx.address));
      expect(balanceAfter).to.equal(0);

      // esGMX should be staked
      const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      expect(await mockRewardRouterV2.stakedEsGmxAmounts(walletAddress)).to.equal(stakeAmount);
    });
  });

  describe("unstakeEsGmx", () => {
    it("unstakes esGMX to multichain balance", async () => {
      await fundMultichainBalance(fixture, { account: user0.address, token: esGmx, amount: stakeAmount });
      await sendStakeEsGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));

      await sendUnstakeEsGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));

      // Multichain esGMX balance should be restored
      const balanceAfter = await dataStore.getUint(keys.multichainBalanceKey(user0.address, esGmx.address));
      expect(balanceAfter).to.equal(stakeAmount);
    });
  });

  describe("handleStakingRewards", () => {
    it("claims WETH and sweeps to multichain balance", async () => {
      // First stake so wallet exists
      await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });
      await sendStakeGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));

      const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      const claimAmount = expandDecimals(1, 18);

      // Fund mock with WETH for claims and set claimable amount
      await wnt.deposit({ value: claimAmount });
      await wnt.transfer(mockRewardRouterV2.address, claimAmount);
      await mockRewardRouterV2.setClaimableWeth(walletAddress, claimAmount);

      // Handle rewards: claim WETH only
      await sendHandleStakingRewards(
        getDefaultStakingRelayParams({
          params: {
            shouldClaimGmx: false,
            shouldStakeGmx: false,
            shouldClaimEsGmx: false,
            shouldStakeEsGmx: false,
            shouldStakeMultiplierPoints: false,
            shouldClaimWeth: true,
          },
        })
      );

      // WETH should be in multichain balance
      const wethBalance = await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address));
      expect(wethBalance).to.equal(claimAmount);
    });

    it("claims GMX and stakes (no sweep)", async () => {
      await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });
      await sendStakeGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));

      const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      const claimAmount = expandDecimals(10, 18);

      // Fund mock with GMX for claims
      await gmx.mint(mockRewardRouterV2.address, claimAmount);
      await mockRewardRouterV2.setClaimableGmx(walletAddress, claimAmount);

      // Handle rewards: claim and stake GMX
      await sendHandleStakingRewards(
        getDefaultStakingRelayParams({
          params: {
            shouldClaimGmx: true,
            shouldStakeGmx: true,
            shouldClaimEsGmx: false,
            shouldStakeEsGmx: false,
            shouldStakeMultiplierPoints: false,
            shouldClaimWeth: false,
          },
        })
      );

      // GMX multichain balance should NOT increase (it was restaked)
      const gmxBalance = await dataStore.getUint(keys.multichainBalanceKey(user0.address, gmx.address));
      expect(gmxBalance).to.equal(0);

      // Wallet's GMX balance should be 0 (restaked in mock)
      expect(await gmx.balanceOf(walletAddress)).to.equal(0);
    });

    it("claims and sweeps multiple tokens", async () => {
      await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });
      await sendStakeGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));

      const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      const wethClaim = expandDecimals(1, 18);
      const gmxClaim = expandDecimals(5, 18);
      const esGmxClaim = expandDecimals(10, 18);

      // Fund mock with tokens for claims
      await wnt.deposit({ value: wethClaim });
      await wnt.transfer(mockRewardRouterV2.address, wethClaim);
      await gmx.mint(mockRewardRouterV2.address, gmxClaim);
      await esGmx.mint(mockRewardRouterV2.address, esGmxClaim);

      await mockRewardRouterV2.setClaimableWeth(walletAddress, wethClaim);
      await mockRewardRouterV2.setClaimableGmx(walletAddress, gmxClaim);
      await mockRewardRouterV2.setClaimableEsGmx(walletAddress, esGmxClaim);

      // Claim all, don't stake
      await sendHandleStakingRewards(
        getDefaultStakingRelayParams({
          params: {
            shouldClaimGmx: true,
            shouldStakeGmx: false,
            shouldClaimEsGmx: true,
            shouldStakeEsGmx: false,
            shouldStakeMultiplierPoints: false,
            shouldClaimWeth: true,
          },
        })
      );

      // All three tokens should be in multichain balance
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).to.equal(wethClaim);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, gmx.address))).to.equal(gmxClaim);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, esGmx.address))).to.equal(esGmxClaim);
    });
  });

  describe("compoundStakingRewards", () => {
    it("calls compound on V1 via wallet", async () => {
      await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });
      await sendStakeGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));

      await sendCompoundStakingRewards(getDefaultStakingRelayParams());

      const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      expect(await mockRewardRouterV2.compoundCalled(walletAddress)).to.be.true;
    });
  });

  describe("vestEsGmx", () => {
    it("pulls esGMX from multichain balance, approves gmxVester and deposits", async () => {
      // Fund multichain balance with esGMX
      await fundMultichainBalance(fixture, { account: user0.address, token: esGmx, amount: stakeAmount });

      // Vest — should pull esGMX from multichain balance → wallet → vester
      await sendVestEsGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));

      const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);

      // MockGmxVester should have received the esGMX
      expect(await mockGmxVester.depositedAmounts(walletAddress)).to.equal(stakeAmount);

      // Multichain balance should be 0
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, esGmx.address))).to.equal(0);
    });
  });

  describe("delegateGovGmx", () => {
    it("delegates govGMX voting power", async () => {
      // Stake GMX to get govGMX minted to wallet
      await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });
      await sendStakeGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));

      const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);

      // govGMX should have been minted to wallet
      expect(await mockGovToken.balanceOf(walletAddress)).to.equal(stakeAmount);

      // Delegate
      await sendDelegateGovGmx(getDefaultStakingRelayParams({ delegatee: user1.address }));

      // Check delegation
      expect(await mockGovToken.delegates(walletAddress)).to.equal(user1.address);
    });
  });

  describe("signalStakingTransfer", () => {
    it("signals transfer to receiver", async () => {
      await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });
      await sendStakeGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));

      const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      const receiverWalletAddress = await gmxAccountWalletFactory.getWalletAddress(user1.address);

      await sendSignalStakingTransfer(getDefaultStakingRelayParams({ receiver: receiverWalletAddress }));

      expect(await mockRewardRouterV2.pendingReceivers(walletAddress)).to.equal(receiverWalletAddress);
    });
  });

  describe("acceptStakingTransfer", () => {
    it("accepts transfer from sender", async () => {
      // User0 stakes and signals transfer to user1
      await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });
      await sendStakeGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));

      const senderWalletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      const receiverWalletAddress = await gmxAccountWalletFactory.getWalletAddress(user1.address);

      await sendSignalStakingTransfer(getDefaultStakingRelayParams({ receiver: receiverWalletAddress }));

      // User1 accepts
      await sendAcceptStakingTransfer(
        getDefaultStakingRelayParams({
          signer: user1,
          account: user1.address,
          stakingSender: senderWalletAddress,
        })
      );

      // Pending receiver should be cleared
      expect(await mockRewardRouterV2.pendingReceivers(senderWalletAddress)).to.equal(hre.ethers.constants.AddressZero);
    });
  });

  describe("withdrawFromWallet", () => {
    it("withdraws tokens from wallet to multichain balance", async () => {
      // Create wallet by staking
      await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });
      await sendStakeGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));

      const walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      const withdrawAmount = expandDecimals(50, 18);

      // Mint tokens directly to wallet (simulating tokens received from claims etc.)
      await gmx.mint(walletAddress, withdrawAmount);

      await sendWithdrawFromWallet(
        getDefaultStakingRelayParams({
          token: gmx.address,
          amount: withdrawAmount,
        })
      );

      // Tokens should be in multichain balance
      const balance = await dataStore.getUint(keys.multichainBalanceKey(user0.address, gmx.address));
      expect(balance).to.equal(withdrawAmount);

      // Wallet should be empty
      expect(await gmx.balanceOf(walletAddress)).to.equal(0);
    });
  });

  // The account is part of each staking hash, so two accounts signing the same params
  // get different digests and both go through. userNonce is pinned so the payloads only
  // differ by account (the default nonce is random per call).
  describe("account-bound digests", () => {
    it("two accounts can submit identical stakeGmx payloads", async () => {
      await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });
      await fundMultichainBalance(fixture, { account: user1.address, token: gmx, amount: stakeAmount });

      const sharedNonce = 424242;
      const sharedDeadline = Math.floor(Date.now() / 1000) + 3600;
      const user0Params = getDefaultStakingRelayParams({
        amount: stakeAmount,
        userNonce: sharedNonce,
        deadline: sharedDeadline,
        signer: user0,
        account: user0.address,
      });

      // same params, signed by a different account
      const user1Params = {
        ...user0Params,
        signer: user1,
        account: user1.address,
      };

      // both go through — the digests differ by account
      await sendStakeGmx(user0Params);
      await expect(sendStakeGmx(user1Params)).to.not.be.reverted;

      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, gmx.address))).to.equal(0);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, gmx.address))).to.equal(0);
    });

    it("two accounts can submit identical compoundStakingRewards payloads", async () => {
      // compound has no action params, only the account
      await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });
      await fundMultichainBalance(fixture, { account: user1.address, token: gmx, amount: stakeAmount });
      // stake so both wallets exist
      await sendStakeGmx(getDefaultStakingRelayParams({ amount: stakeAmount }));
      await sendStakeGmx(getDefaultStakingRelayParams({ amount: stakeAmount, signer: user1, account: user1.address }));

      const sharedNonce = 515151;
      const sharedDeadline = Math.floor(Date.now() / 1000) + 3600;
      const user0Params = getDefaultStakingRelayParams({
        userNonce: sharedNonce,
        deadline: sharedDeadline,
        signer: user0,
        account: user0.address,
      });
      const user1Params = {
        ...user0Params,
        signer: user1,
        account: user1.address,
      };

      await sendCompoundStakingRewards(user0Params);
      await sendCompoundStakingRewards(user1Params);

      const user0Wallet = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      const user1Wallet = await gmxAccountWalletFactory.getWalletAddress(user1.address);
      expect(await mockRewardRouterV2.compoundCalled(user0Wallet)).to.be.true;
      expect(await mockRewardRouterV2.compoundCalled(user1Wallet)).to.be.true;
    });

    it("the same signed staking payload cannot be submitted twice", async () => {
      await fundMultichainBalance(fixture, { account: user0.address, token: gmx, amount: stakeAmount });

      const params = getDefaultStakingRelayParams({
        amount: stakeAmount,
        userNonce: 626262,
        deadline: Math.floor(Date.now() / 1000) + 3600,
      });

      await sendStakeGmx(params);
      await expect(sendStakeGmx(params)).to.be.revertedWithCustomError(errorsContract, "InvalidUserDigest");
    });
  });
});
