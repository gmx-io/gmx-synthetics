// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../router/relay/IRelayUtils.sol";
import "../deposit/IDepositUtils.sol";
import "../withdrawal/IWithdrawalUtils.sol";
import "../shift/IShiftUtils.sol";

interface IMultichainGmRouter {
    function createDeposit(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.TransferRequests calldata transferRequests,
        IDepositUtils.CreateDepositParams calldata params
    ) external returns (bytes32);

    function createWithdrawal(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.TransferRequests calldata transferRequests,
        IWithdrawalUtils.CreateWithdrawalParams calldata params
    ) external returns (bytes32);

    function createShift(
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        IRelayUtils.TransferRequests calldata transferRequests,
        IShiftUtils.CreateShiftParams calldata params
    ) external returns (bytes32);
}
