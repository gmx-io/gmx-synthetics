// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./IMultichainStakingRouter.sol";
import "./MultichainRouter.sol";
import "./MultichainUtils.sol";
import "../staking/GmxAccountWalletFactory.sol";
import "../staking/IGmxAccountWallet.sol";
import "../v1/IRewardRouterV2.sol";
import "../v1/IVesterV1.sol";
import "../v1/IRewardTrackerV1.sol";
import "../token/TokenUtils.sol";

interface IERC20Votes {
    function delegate(address delegatee) external;
}

contract MultichainStakingRouter is IMultichainStakingRouter, MultichainRouter {
    using SafeERC20 for IERC20;

    GmxAccountWalletFactory public immutable walletFactory;
    IRewardRouterV2 public immutable rewardRouter;

    constructor(
        BaseConstructorParams memory params,
        GmxAccountWalletFactory _walletFactory,
        IRewardRouterV2 _rewardRouter
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {
        walletFactory = _walletFactory;
        rewardRouter = _rewardRouter;
    }

    function stakeGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = RelayUtils.getStakeGmxStructHash(relayParams, amount);
        _validateCall(relayParams, account, structHash, srcChainId);
        _stakeGmx(account, srcChainId, amount);
    }

    function unstakeGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = RelayUtils.getUnstakeGmxStructHash(relayParams, amount);
        _validateCall(relayParams, account, structHash, srcChainId);
        _unstakeGmx(account, srcChainId, amount);
    }

    function stakeEsGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = RelayUtils.getStakeEsGmxStructHash(relayParams, amount);
        _validateCall(relayParams, account, structHash, srcChainId);
        _stakeEsGmx(account, srcChainId, amount);
    }

    function unstakeEsGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = RelayUtils.getUnstakeEsGmxStructHash(relayParams, amount);
        _validateCall(relayParams, account, structHash, srcChainId);
        _unstakeEsGmx(account, srcChainId, amount);
    }

    function handleStakingRewards(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.HandleStakingRewardsParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = RelayUtils.getHandleStakingRewardsStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);
        _handleStakingRewards(account, srcChainId, params);
    }

    function compoundStakingRewards(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = RelayUtils.getCompoundStakingRewardsStructHash(relayParams);
        _validateCall(relayParams, account, structHash, srcChainId);
        _compoundStakingRewards(account);
    }

    function vestEsGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = RelayUtils.getVestEsGmxStructHash(relayParams, amount);
        _validateCall(relayParams, account, structHash, srcChainId);
        _vestEsGmx(account, srcChainId, amount);
    }

    function delegateGovGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address delegatee
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = RelayUtils.getDelegateGovGmxStructHash(relayParams, delegatee);
        _validateCall(relayParams, account, structHash, srcChainId);
        _delegateGovGmx(account, delegatee);
    }

    function signalStakingTransfer(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address receiver
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = RelayUtils.getSignalStakingTransferStructHash(relayParams, receiver);
        _validateCall(relayParams, account, structHash, srcChainId);
        _signalStakingTransfer(account, receiver);
    }

    function acceptStakingTransfer(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address sender
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = RelayUtils.getAcceptStakingTransferStructHash(relayParams, sender);
        _validateCall(relayParams, account, structHash, srcChainId);
        _acceptStakingTransfer(account, sender);
    }

    function withdrawFromWallet(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address token,
        uint256 amount
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = RelayUtils.getWithdrawFromWalletStructHash(relayParams, token, amount);
        _validateCall(relayParams, account, structHash, srcChainId);
        _withdrawFromWallet(account, srcChainId, token, amount);
    }

    // Private implementation functions

    function _stakeGmx(address account, uint256 srcChainId, uint256 amount) private {
        address wallet = walletFactory.getOrCreateWallet(account);
        address gmx = rewardRouter.gmx();

        MultichainUtils.transferOut(dataStore, eventEmitter, multichainVault, gmx, account, wallet, amount, srcChainId);

        IGmxAccountWallet(wallet).execute(gmx, abi.encodeCall(IERC20.approve, (rewardRouter.stakedGmxTracker(), amount)));
        IGmxAccountWallet(wallet).execute(address(rewardRouter), abi.encodeCall(IRewardRouterV2.stakeGmx, (amount)));
    }

    function _unstakeGmx(address account, uint256 srcChainId, uint256 amount) private {
        address wallet = walletFactory.getWalletAddress(account);
        address gmx = rewardRouter.gmx();

        IGmxAccountWallet(wallet).execute(address(rewardRouter), abi.encodeCall(IRewardRouterV2.unstakeGmx, (amount)));

        IGmxAccountWallet(wallet).execute(gmx, abi.encodeCall(IERC20.transfer, (address(multichainVault), amount)));
        MultichainUtils.recordTransferIn(dataStore, eventEmitter, multichainVault, gmx, account, srcChainId);
    }

    function _stakeEsGmx(address account, uint256 srcChainId, uint256 amount) private {
        address wallet = walletFactory.getOrCreateWallet(account);
        address esGmx = rewardRouter.esGmx();

        MultichainUtils.transferOut(dataStore, eventEmitter, multichainVault, esGmx, account, wallet, amount, srcChainId);

        IGmxAccountWallet(wallet).execute(esGmx, abi.encodeCall(IERC20.approve, (rewardRouter.stakedGmxTracker(), amount)));
        IGmxAccountWallet(wallet).execute(address(rewardRouter), abi.encodeCall(IRewardRouterV2.stakeEsGmx, (amount)));
    }

    function _unstakeEsGmx(address account, uint256 srcChainId, uint256 amount) private {
        address wallet = walletFactory.getWalletAddress(account);
        address esGmx = rewardRouter.esGmx();

        IGmxAccountWallet(wallet).execute(address(rewardRouter), abi.encodeCall(IRewardRouterV2.unstakeEsGmx, (amount)));

        IGmxAccountWallet(wallet).execute(esGmx, abi.encodeCall(IERC20.transfer, (address(multichainVault), amount)));
        MultichainUtils.recordTransferIn(dataStore, eventEmitter, multichainVault, esGmx, account, srcChainId);
    }

    function _handleStakingRewards(
        address account,
        uint256 srcChainId,
        IRelayUtils.HandleStakingRewardsParams calldata params
    ) private {
        address wallet = walletFactory.getWalletAddress(account);

        // Record pre-balances
        uint256 wethBefore = IERC20(rewardRouter.weth()).balanceOf(wallet);
        uint256 gmxBefore = IERC20(rewardRouter.gmx()).balanceOf(wallet);
        uint256 esGmxBefore = IERC20(rewardRouter.esGmx()).balanceOf(wallet);

        // Execute handleRewards on V1 (force shouldConvertWethToEth=false for multichain)
        IGmxAccountWallet(wallet).execute(
            address(rewardRouter),
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

        // Sweep any increased token balances from wallet to MultichainVault
        _sweepTokenIncrease(wallet, account, srcChainId, rewardRouter.weth(), wethBefore);
        _sweepTokenIncrease(wallet, account, srcChainId, rewardRouter.gmx(), gmxBefore);
        _sweepTokenIncrease(wallet, account, srcChainId, rewardRouter.esGmx(), esGmxBefore);
    }

    function _compoundStakingRewards(address account) private {
        address wallet = walletFactory.getWalletAddress(account);
        IGmxAccountWallet(wallet).execute(address(rewardRouter), abi.encodeCall(IRewardRouterV2.compound, ()));
    }

    function _vestEsGmx(address account, uint256 srcChainId, uint256 amount) private {
        address wallet = walletFactory.getOrCreateWallet(account);
        address esGmx = rewardRouter.esGmx();
        address gmxVester = rewardRouter.gmxVester();

        MultichainUtils.transferOut(dataStore, eventEmitter, multichainVault, esGmx, account, wallet, amount, srcChainId);

        IGmxAccountWallet(wallet).execute(esGmx, abi.encodeCall(IERC20.approve, (gmxVester, amount)));
        IGmxAccountWallet(wallet).execute(gmxVester, abi.encodeCall(IVester.deposit, (amount)));
    }

    function _delegateGovGmx(address account, address delegatee) private {
        address wallet = walletFactory.getWalletAddress(account);
        IGmxAccountWallet(wallet).execute(rewardRouter.govToken(), abi.encodeCall(IERC20Votes.delegate, (delegatee)));
    }

    function _signalStakingTransfer(address account, address receiver) private {
        address wallet = walletFactory.getWalletAddress(account);

        if (rewardRouter.inStrictTransferMode()) {
            address feeGmxTracker = rewardRouter.feeGmxTracker();
            uint256 balance = IRewardTracker(feeGmxTracker).stakedAmounts(wallet);
            IGmxAccountWallet(wallet).execute(
                feeGmxTracker,
                abi.encodeCall(IERC20.approve, (receiver, balance))
            );
        }

        IGmxAccountWallet(wallet).execute(address(rewardRouter), abi.encodeCall(IRewardRouterV2.signalTransfer, (receiver)));
    }

    function _acceptStakingTransfer(address account, address sender) private {
        address wallet = walletFactory.getOrCreateWallet(account);
        IGmxAccountWallet(wallet).execute(address(rewardRouter), abi.encodeCall(IRewardRouterV2.acceptTransfer, (sender)));
    }

    function _withdrawFromWallet(address account, uint256 srcChainId, address token, uint256 amount) private {
        address wallet = walletFactory.getWalletAddress(account);

        IGmxAccountWallet(wallet).execute(token, abi.encodeCall(IERC20.transfer, (address(multichainVault), amount)));
        MultichainUtils.recordTransferIn(dataStore, eventEmitter, multichainVault, token, account, srcChainId);
    }

    function _sweepTokenIncrease(
        address wallet,
        address account,
        uint256 srcChainId,
        address token,
        uint256 balanceBefore
    ) private {
        uint256 balanceAfter = IERC20(token).balanceOf(wallet);
        if (balanceAfter > balanceBefore) {
            uint256 delta = balanceAfter - balanceBefore;
            IGmxAccountWallet(wallet).execute(token, abi.encodeCall(IERC20.transfer, (address(multichainVault), delta)));
            MultichainUtils.recordTransferIn(dataStore, eventEmitter, multichainVault, token, account, srcChainId);
        }
    }
}
