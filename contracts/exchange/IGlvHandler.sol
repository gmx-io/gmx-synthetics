// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../glv/glvDeposit/GlvDepositUtils.sol";
import "../glv/glvWithdrawal/GlvWithdrawalUtils.sol";
import "../oracle/OracleUtils.sol";

interface IGlvHandler {
    function createGlvDeposit(
        address account,
        GlvDepositUtils.CreateGlvDepositParams calldata params
    ) external payable returns (bytes32);

    function cancelGlvDeposit(bytes32 key) external;

    function simulateExecuteGlvDeposit(bytes32 key, OracleUtils.SimulatePricesParams memory params) external;

    function createGlvWithdrawal(
        address account,
        GlvWithdrawalUtils.CreateGlvWithdrawalParams calldata params
    ) external payable returns (bytes32);

    function cancelGlvWithdrawal(bytes32 key) external;

    function simulateExecuteGlvWithdrawal(bytes32 key, OracleUtils.SimulatePricesParams memory params) external;
}
