// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./BaseHandler.sol";

import "../glv/glvShift/GlvShiftUtils.sol";

contract GlvShiftHandler is BaseHandler, ReentrancyGuard {
    using GlvShift for GlvShift.Props;

    MultichainVault public immutable multichainVault;
    GlvVault public immutable glvVault;
    ShiftVault public immutable shiftVault;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IOracle _oracle,
        MultichainVault _multichainVault,
        GlvVault _glvVault,
        ShiftVault _shiftVault
    ) BaseHandler(_roleStore, _dataStore, _eventEmitter, _oracle) {
        multichainVault = _multichainVault;
        glvVault = _glvVault;
        shiftVault = _shiftVault;
    }

    function createGlvShift(
        GlvShiftUtils.CreateGlvShiftParams memory params
    ) external globalNonReentrant onlyOrderKeeper returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.createGlvShiftFeatureDisabledKey(address(this)));

        return GlvShiftUtils.createGlvShift(dataStore, eventEmitter, params);
    }

    // @key glvDeposit key
    // @oracleParams prices for `fromMarket` and `toMarket` are required
    function executeGlvShift(
        bytes32 key,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external globalNonReentrant onlyOrderKeeper withOraclePrices(oracleParams) {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;

        GlvShift.Props memory glvShift = GlvShiftStoreUtils.get(_dataStore, key);
        uint256 estimatedGasLimit = GasUtils.estimateExecuteGlvShiftGasLimit(_dataStore);
        GasUtils.validateExecutionGas(_dataStore, startingGas, estimatedGasLimit);

        uint256 executionGas = GasUtils.getExecutionGas(_dataStore, startingGas);

        try this._executeGlvShift{gas: executionGas}(key, glvShift, msg.sender) {} catch (bytes memory reasonBytes) {
            _handleGlvShiftError(key, reasonBytes);
        }
    }

    function _executeGlvShift(bytes32 key, GlvShift.Props memory glvShift, address keeper) external onlySelf {
        FeatureUtils.validateFeature(dataStore, Keys.executeGlvShiftFeatureDisabledKey(address(this)));

        GlvShiftUtils.ExecuteGlvShiftParams memory params = GlvShiftUtils.ExecuteGlvShiftParams({
            key: key,
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            multichainVault: multichainVault,
            shiftVault: shiftVault,
            glvVault: glvVault,
            oracle: oracle,
            keeper: keeper
        });

        GlvShiftUtils.executeGlvShift(params, glvShift);
    }

    function _handleGlvShiftError(bytes32 key, bytes memory reasonBytes) internal {
        GasUtils.validateExecutionErrorGas(dataStore, reasonBytes);

        bytes4 errorSelector = ErrorUtils.getErrorSelectorFromData(reasonBytes);

        validateNonKeeperError(errorSelector, reasonBytes);

        (string memory reason /* bool hasRevertMessage */, ) = ErrorUtils.getRevertMessage(reasonBytes);

        GlvShiftUtils.cancelGlvShift(
            dataStore,
            eventEmitter,
            key,
            reason,
            reasonBytes
        );
    }
}
