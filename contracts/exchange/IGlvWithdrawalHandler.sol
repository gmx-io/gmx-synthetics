// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../glv/glvWithdrawal/IGlvWithdrawalUtils.sol";
import "../oracle/OracleUtils.sol";

interface IGlvWithdrawalHandler {
    function createGlvWithdrawal(
        address account,
        uint256 srcChainId,
        IGlvWithdrawalUtils.CreateGlvWithdrawalParams calldata params
    ) external returns (bytes32);

    function cancelGlvWithdrawal(bytes32 key) external;

    function simulateExecuteGlvWithdrawal(bytes32 key, OracleUtils.SimulatePricesParams memory params) external;
}
