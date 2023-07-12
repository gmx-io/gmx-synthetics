// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../deposit/DepositUtils.sol";
import "../oracle/OracleUtils.sol";

interface IDepositHandler {
    function createDeposit(address account, DepositUtils.CreateDepositParams calldata params) external returns (bytes32);
    function cancelDeposit(bytes32 key) external;
    function simulateExecuteDeposit(bytes32 key, OracleUtils.SimulatePricesParams memory params) external;
}
