// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

/**
 * @title IMultichainProvider
 */
interface IMultichainProvider {
    enum ActionType {
        None,
        Deposit,
        GlvDeposit,
        BridgeOut
    }

    struct BridgeOutParams {
        address provider;
        address account;
        address token;
        uint256 amount;
        bytes data;
    }

    function bridgeOut(BridgeOutParams memory params) external returns (uint256);

    function withdrawTokens(address token, address receiver, uint256 amount) external;
}
