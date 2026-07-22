// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./IMultichainStakingRouter.sol";
import "./MultichainRouter.sol";
import "./MultichainStakingUtils.sol";
import "../staking/GmxAccountWalletFactory.sol";
import "../v1/IRewardRouterV2.sol";
import "../router/relay/StakingUtils.sol";

contract MultichainStakingRouter is IMultichainStakingRouter, MultichainRouter {
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
        bytes32 structHash = StakingUtils.getStakeGmxStructHash(relayParams, amount);
        _validateCall(relayParams, account, structHash, srcChainId);
        MultichainStakingUtils.stakeGmx(_stakingContracts(), account, srcChainId, amount);
    }

    function unstakeGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = StakingUtils.getUnstakeGmxStructHash(relayParams, amount);
        _validateCall(relayParams, account, structHash, srcChainId);
        MultichainStakingUtils.unstakeGmx(_stakingContracts(), account, srcChainId, amount);
    }

    function stakeEsGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = StakingUtils.getStakeEsGmxStructHash(relayParams, amount);
        _validateCall(relayParams, account, structHash, srcChainId);
        MultichainStakingUtils.stakeEsGmx(_stakingContracts(), account, srcChainId, amount);
    }

    function unstakeEsGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = StakingUtils.getUnstakeEsGmxStructHash(relayParams, amount);
        _validateCall(relayParams, account, structHash, srcChainId);
        MultichainStakingUtils.unstakeEsGmx(_stakingContracts(), account, srcChainId, amount);
    }

    function handleStakingRewards(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.HandleStakingRewardsParams calldata params
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = StakingUtils.getHandleStakingRewardsStructHash(relayParams, params);
        _validateCall(relayParams, account, structHash, srcChainId);
        MultichainStakingUtils.handleStakingRewards(_stakingContracts(), account, srcChainId, params);
    }

    function compoundStakingRewards(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = StakingUtils.getCompoundStakingRewardsStructHash(relayParams);
        _validateCall(relayParams, account, structHash, srcChainId);
        MultichainStakingUtils.compoundStakingRewards(_stakingContracts(), account);
    }

    function vestEsGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = StakingUtils.getVestEsGmxStructHash(relayParams, amount);
        _validateCall(relayParams, account, structHash, srcChainId);
        MultichainStakingUtils.vestEsGmx(_stakingContracts(), account, srcChainId, amount);
    }

    function withdrawVesting(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = StakingUtils.getWithdrawVestingStructHash(relayParams, account);
        _validateCall(relayParams, account, structHash, srcChainId);
        MultichainStakingUtils.withdrawVesting(_stakingContracts(), account, srcChainId);
    }

    function delegateGovGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address delegatee
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = StakingUtils.getDelegateGovGmxStructHash(relayParams, delegatee);
        _validateCall(relayParams, account, structHash, srcChainId);
        MultichainStakingUtils.delegateGovGmx(_stakingContracts(), account, delegatee);
    }

    function signalStakingTransfer(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address receiver
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = StakingUtils.getSignalStakingTransferStructHash(relayParams, receiver);
        _validateCall(relayParams, account, structHash, srcChainId);
        MultichainStakingUtils.signalStakingTransfer(_stakingContracts(), account, receiver);
    }

    function acceptStakingTransfer(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address sender
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = StakingUtils.getAcceptStakingTransferStructHash(relayParams, sender);
        _validateCall(relayParams, account, structHash, srcChainId);
        MultichainStakingUtils.acceptStakingTransfer(_stakingContracts(), account, sender);
    }

    function withdrawFromWallet(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address token,
        uint256 amount
    ) external nonReentrant withRelay(relayParams, account, srcChainId, false) {
        bytes32 structHash = StakingUtils.getWithdrawFromWalletStructHash(relayParams, token, amount);
        _validateCall(relayParams, account, structHash, srcChainId);
        MultichainStakingUtils.withdrawFromWallet(_stakingContracts(), account, srcChainId, token, amount);
    }

    function _stakingContracts() private view returns (MultichainStakingUtils.StakingContracts memory) {
        return MultichainStakingUtils.StakingContracts(walletFactory, rewardRouter, dataStore, eventEmitter, multichainVault);
    }
}
