// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/IRelayUtils.sol";

interface IMultichainTransferRouter {
    function bridgeIn(address account, address token) external payable;

    function bridgeOut(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.BridgeOutParams calldata params
    ) external;

    function bridgeOutFromController(
        address account,
        uint256 srcChainId,
        uint256 desChainId,
        uint256 deadline,
        IRelayUtils.BridgeOutParams calldata params
    ) external;

    function transferOut(
        IRelayUtils.BridgeOutParams calldata params
    ) external;
}
