// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../shift/IShiftUtils.sol";
import "../oracle/OracleUtils.sol";

interface IShiftHandler {
    function createShift(address account, uint256 srcChainId, IShiftUtils.CreateShiftParams calldata params) external returns (bytes32);
    function cancelShift(bytes32 key) external;
    function simulateExecuteShift(bytes32 key, OracleUtils.SimulatePricesParams memory params) external;
}
