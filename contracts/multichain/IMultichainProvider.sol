// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/IRelayUtils.sol";

/**
 * @title IMultichainProvider
 */
interface IMultichainProvider {
    enum ActionType {
        None,
        Deposit,
        GlvDeposit,
        BridgeOut,
        SetTraderReferralCode
    }

    function bridgeOut(address account, IRelayUtils.BridgeOutParams memory params) external returns (uint256);

    function withdrawTokens(address token, address receiver, uint256 amount) external;
}
