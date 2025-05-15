// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../glv/glvDeposit/IGlvDepositUtils.sol";
import "../oracle/OracleUtils.sol";

interface IGlvDepositHandler {
    function createGlvDeposit(
        address account,
        uint256 srcChainId,
        IGlvDepositUtils.CreateGlvDepositParams calldata params
    ) external returns (bytes32);

    function cancelGlvDeposit(bytes32 key) external;

    function simulateExecuteGlvDeposit(bytes32 key, OracleUtils.SimulatePricesParams memory params) external;
}
