// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/IRelayUtils.sol";

interface IMultichainMessagingRouter {
    function setTraderReferralCode(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 referralCode
    ) external;
}
