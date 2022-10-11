// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../deposit/Deposit.sol";

interface IDepositCallbackReceiver {
    function depositExecuted(bytes32 key, Deposit.Props memory deposit) external;
}
