// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/IRelayUtils.sol";

interface IMultichainStakingRouter {
    function stakeGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external;

    function unstakeGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external;

    function stakeEsGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external;

    function unstakeEsGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external;

    function handleStakingRewards(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.HandleStakingRewardsParams calldata params
    ) external;

    function compoundStakingRewards(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId
    ) external;

    function vestEsGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 amount
    ) external;

    function delegateGovGmx(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address delegatee
    ) external;

    function signalStakingTransfer(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address receiver
    ) external;

    function acceptStakingTransfer(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address sender
    ) external;

    function withdrawFromWallet(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        address token,
        uint256 amount
    ) external;
}
