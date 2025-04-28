// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/IRelayUtils.sol";

interface IMultichainTransferRouter {
    function bridgeIn(address account, address token, uint256 srcChainId) external payable;

    function bridgeOut(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        BridgeOutParams calldata params
    ) external;

    function bridgeOutFromController(
        RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        BridgeOutParams calldata params
    ) external;

    function transferOut(
        BridgeOutParams calldata params
    ) external;
}
