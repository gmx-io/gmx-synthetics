// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../deposit/Deposit.sol";

interface IDepositCallbackReceiver {
    function beforeDepositExecution(bytes32 key, Deposit.Props memory deposit) external;
    function afterDepositExecution(bytes32 key, Deposit.Props memory deposit) external;
    function afterDepositCancellation(bytes32 key, Deposit.Props memory deposit) external;
}
