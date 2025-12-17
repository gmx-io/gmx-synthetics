// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../order/IBaseOrderUtils.sol";
import "../oracle/OracleUtils.sol";
import "../glv/glvShift/GlvShiftUtils.sol";

interface IJitOrderHandler {
    function executeJitOrder(
        GlvShiftUtils.CreateGlvShiftParams[] memory shiftParamsList,
        bytes32 orderKey,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external;

    function simulateExecuteJitOrder(
        GlvShiftUtils.CreateGlvShiftParams[] memory shiftParamsList,
        bytes32 orderKey,
        OracleUtils.SimulatePricesParams memory simulatedOracleParams
    ) external;
}
