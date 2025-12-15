// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/IRelayUtils.sol";

interface IMultichainOrderRouter {
    function batch(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.BatchParams calldata params
    ) external returns (bytes32[] memory);

    function createOrder(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IBaseOrderUtils.CreateOrderParams calldata params
    ) external returns (bytes32);

    function updateOrder(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.UpdateOrderParams calldata params
    ) external;

    function cancelOrder(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 key
    ) external;

    function setTraderReferralCode(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 referralCode
    ) external;

    function registerCode(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 referralCode
    ) external;
}
