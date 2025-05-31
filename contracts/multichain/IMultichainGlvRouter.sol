// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/IRelayUtils.sol";
import "../glv/glvDeposit/IGlvDepositUtils.sol";
import "../glv/glvWithdrawal/IGlvWithdrawalUtils.sol";

interface IMultichainGlvRouter {
    function createGlvDeposit(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.TransferRequests calldata transferRequests,
        IGlvDepositUtils.CreateGlvDepositParams memory params
    ) external returns (bytes32);

    function createGlvWithdrawal(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.TransferRequests calldata transferRequests,
        IGlvWithdrawalUtils.CreateGlvWithdrawalParams memory params
    ) external returns (bytes32);
}
