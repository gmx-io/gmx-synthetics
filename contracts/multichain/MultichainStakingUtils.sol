// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./MultichainUtils.sol";
import "./MultichainVault.sol";
import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../staking/GmxAccountWalletFactory.sol";
import "../staking/IGmxAccountWallet.sol";
import "../v1/IRewardRouterV2.sol";
import "../v1/IVesterV1.sol";
import "../v1/IRewardTrackerV1.sol";
import "../router/relay/IRelayUtils.sol";

interface IERC20Votes {
    function delegate(address delegatee) external;
}

library MultichainStakingUtils {
    struct StakingContracts {
        GmxAccountWalletFactory walletFactory;
        IRewardRouterV2 rewardRouter;
        DataStore dataStore;
        EventEmitter eventEmitter;
        MultichainVault multichainVault;
    }

    struct HandleRewardsCache {
        address wallet;
        uint256 wethBefore;
        uint256 gmxBefore;
        uint256 esGmxBefore;
    }

    function stakeGmx(
        StakingContracts memory contracts,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external {
        address wallet = contracts.walletFactory.getOrCreateWallet(account);
        address gmx = contracts.rewardRouter.gmx();

        MultichainUtils.transferOut(contracts.dataStore, contracts.eventEmitter, contracts.multichainVault, gmx, account, wallet, amount, srcChainId);

        IGmxAccountWallet(wallet).execute(gmx, abi.encodeCall(IERC20.approve, (contracts.rewardRouter.stakedGmxTracker(), amount)));
        IGmxAccountWallet(wallet).execute(address(contracts.rewardRouter), abi.encodeCall(IRewardRouterV2.stakeGmx, (amount)));
    }

    function unstakeGmx(
        StakingContracts memory contracts,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external {
        address wallet = contracts.walletFactory.getWalletAddress(account);
        address gmx = contracts.rewardRouter.gmx();

        IGmxAccountWallet(wallet).execute(address(contracts.rewardRouter), abi.encodeCall(IRewardRouterV2.unstakeGmx, (amount)));

        IGmxAccountWallet(wallet).execute(gmx, abi.encodeCall(IERC20.transfer, (address(contracts.multichainVault), amount)));
        MultichainUtils.recordTransferIn(contracts.dataStore, contracts.eventEmitter, contracts.multichainVault, gmx, account, srcChainId);
    }

    function stakeEsGmx(
        StakingContracts memory contracts,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external {
        address wallet = contracts.walletFactory.getOrCreateWallet(account);
        address esGmx = contracts.rewardRouter.esGmx();

        MultichainUtils.transferOut(contracts.dataStore, contracts.eventEmitter, contracts.multichainVault, esGmx, account, wallet, amount, srcChainId);

        IGmxAccountWallet(wallet).execute(esGmx, abi.encodeCall(IERC20.approve, (contracts.rewardRouter.stakedGmxTracker(), amount)));
        IGmxAccountWallet(wallet).execute(address(contracts.rewardRouter), abi.encodeCall(IRewardRouterV2.stakeEsGmx, (amount)));
    }

    function unstakeEsGmx(
        StakingContracts memory contracts,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external {
        address wallet = contracts.walletFactory.getWalletAddress(account);
        address esGmx = contracts.rewardRouter.esGmx();

        IGmxAccountWallet(wallet).execute(address(contracts.rewardRouter), abi.encodeCall(IRewardRouterV2.unstakeEsGmx, (amount)));

        IGmxAccountWallet(wallet).execute(esGmx, abi.encodeCall(IERC20.transfer, (address(contracts.multichainVault), amount)));
        MultichainUtils.recordTransferIn(contracts.dataStore, contracts.eventEmitter, contracts.multichainVault, esGmx, account, srcChainId);
    }

    function handleStakingRewards(
        StakingContracts memory contracts,
        address account,
        uint256 srcChainId,
        IRelayUtils.HandleStakingRewardsParams calldata params
    ) external {
        HandleRewardsCache memory cache;
        cache.wallet = contracts.walletFactory.getWalletAddress(account);

        cache.wethBefore = IERC20(contracts.rewardRouter.weth()).balanceOf(cache.wallet);
        cache.gmxBefore = IERC20(contracts.rewardRouter.gmx()).balanceOf(cache.wallet);
        cache.esGmxBefore = IERC20(contracts.rewardRouter.esGmx()).balanceOf(cache.wallet);

        IGmxAccountWallet(cache.wallet).execute(
            address(contracts.rewardRouter),
            abi.encodeCall(IRewardRouterV2.handleRewards, (
                params.shouldClaimGmx,
                params.shouldStakeGmx,
                params.shouldClaimEsGmx,
                params.shouldStakeEsGmx,
                params.shouldStakeMultiplierPoints,
                params.shouldClaimWeth,
                false
            ))
        );

        _sweepTokenIncrease(contracts, cache.wallet, account, srcChainId, contracts.rewardRouter.weth(), cache.wethBefore);
        _sweepTokenIncrease(contracts, cache.wallet, account, srcChainId, contracts.rewardRouter.gmx(), cache.gmxBefore);
        _sweepTokenIncrease(contracts, cache.wallet, account, srcChainId, contracts.rewardRouter.esGmx(), cache.esGmxBefore);
    }

    function compoundStakingRewards(
        StakingContracts memory contracts,
        address account
    ) external {
        address wallet = contracts.walletFactory.getWalletAddress(account);
        IGmxAccountWallet(wallet).execute(address(contracts.rewardRouter), abi.encodeCall(IRewardRouterV2.compound, ()));
    }

    function vestEsGmx(
        StakingContracts memory contracts,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external {
        address wallet = contracts.walletFactory.getOrCreateWallet(account);
        address esGmx = contracts.rewardRouter.esGmx();
        address gmxVester = contracts.rewardRouter.gmxVester();

        MultichainUtils.transferOut(contracts.dataStore, contracts.eventEmitter, contracts.multichainVault, esGmx, account, wallet, amount, srcChainId);

        IGmxAccountWallet(wallet).execute(esGmx, abi.encodeCall(IERC20.approve, (gmxVester, amount)));
        IGmxAccountWallet(wallet).execute(gmxVester, abi.encodeCall(IVester.deposit, (amount)));
    }

    function delegateGovGmx(
        StakingContracts memory contracts,
        address account,
        address delegatee
    ) external {
        address wallet = contracts.walletFactory.getWalletAddress(account);
        IGmxAccountWallet(wallet).execute(contracts.rewardRouter.govToken(), abi.encodeCall(IERC20Votes.delegate, (delegatee)));
    }

    function signalStakingTransfer(
        StakingContracts memory contracts,
        address account,
        address receiver
    ) external {
        address wallet = contracts.walletFactory.getWalletAddress(account);

        if (contracts.rewardRouter.inStrictTransferMode()) {
            address feeGmxTracker = contracts.rewardRouter.feeGmxTracker();
            uint256 balance = IRewardTracker(feeGmxTracker).stakedAmounts(wallet);
            IGmxAccountWallet(wallet).execute(
                feeGmxTracker,
                abi.encodeCall(IERC20.approve, (receiver, balance))
            );
        }

        IGmxAccountWallet(wallet).execute(address(contracts.rewardRouter), abi.encodeCall(IRewardRouterV2.signalTransfer, (receiver)));
    }

    function acceptStakingTransfer(
        StakingContracts memory contracts,
        address account,
        address sender
    ) external {
        address wallet = contracts.walletFactory.getOrCreateWallet(account);
        IGmxAccountWallet(wallet).execute(address(contracts.rewardRouter), abi.encodeCall(IRewardRouterV2.acceptTransfer, (sender)));
    }

    function withdrawFromWallet(
        StakingContracts memory contracts,
        address account,
        uint256 srcChainId,
        address token,
        uint256 amount
    ) external {
        address wallet = contracts.walletFactory.getWalletAddress(account);

        IGmxAccountWallet(wallet).execute(token, abi.encodeCall(IERC20.transfer, (address(contracts.multichainVault), amount)));
        MultichainUtils.recordTransferIn(contracts.dataStore, contracts.eventEmitter, contracts.multichainVault, token, account, srcChainId);
    }

    function _sweepTokenIncrease(
        StakingContracts memory contracts,
        address wallet,
        address account,
        uint256 srcChainId,
        address token,
        uint256 balanceBefore
    ) private {
        uint256 balanceAfter = IERC20(token).balanceOf(wallet);
        if (balanceAfter > balanceBefore) {
            uint256 delta = balanceAfter - balanceBefore;
            IGmxAccountWallet(wallet).execute(token, abi.encodeCall(IERC20.transfer, (address(contracts.multichainVault), delta)));
            MultichainUtils.recordTransferIn(contracts.dataStore, contracts.eventEmitter, contracts.multichainVault, token, account, srcChainId);
        }
    }
}
