// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../withdrawal/Withdrawal.sol";

interface IWithdrawalCallbackReceiver {
    function beforeWithdrawalExecution(bytes32 key, Withdrawal.Props memory withdrawal) external;
    function afterWithdrawalExecution(bytes32 key, Withdrawal.Props memory withdrawal) external;
    function afterWithdrawalCancellation(bytes32 key, Withdrawal.Props memory withdrawal) external;
}
