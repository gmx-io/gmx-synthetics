// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./BaseHandler.sol";

import "../glv/glvShift/GlvShiftUtils.sol";
import "../exchange/IShiftHandler.sol";

contract GlvShiftHandler is BaseHandler, ReentrancyGuard {
    using GlvShift for GlvShift.Props;

    MultichainVault public immutable multichainVault;
    GlvVault public immutable glvVault;
    ShiftVault public immutable shiftVault;
    IShiftHandler public immutable shiftHandler;
    IDepositHandler public immutable depositHandler;
    IWithdrawalHandler public immutable withdrawalHandler;
    ISwapHandler public immutable swapHandler;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IOracle _oracle,
        MultichainVault _multichainVault,
        GlvVault _glvVault,
        ShiftVault _shiftVault,
        IDepositHandler _depositHandler,
        IWithdrawalHandler _withdrawalHandler,
        IShiftHandler _shiftHandler,
        ISwapHandler _swapHandler
    ) BaseHandler(_roleStore, _dataStore, _eventEmitter, _oracle) {
        multichainVault = _multichainVault;
        glvVault = _glvVault;
        shiftVault = _shiftVault;
        depositHandler = _depositHandler;
        withdrawalHandler = _withdrawalHandler;
        shiftHandler = _shiftHandler;
        swapHandler = _swapHandler;
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

        try this.doExecuteGlvShift{gas: executionGas}(key, glvShift, msg.sender, false) {} catch (bytes memory reasonBytes) {
            _handleGlvShiftError(key, reasonBytes);
        }
    }

    // @note the caller function should be protected by global reentrancy guard
    function doExecuteGlvShift(bytes32 key, GlvShift.Props memory glvShift, address keeper, bool skipRemoval) external nonReentrant onlySelfOrController {
        FeatureUtils.validateFeature(dataStore, Keys.executeGlvShiftFeatureDisabledKey(address(this)));

        GlvShiftUtils.ExecuteGlvShiftParams memory params = GlvShiftUtils.ExecuteGlvShiftParams({
            key: key,
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            multichainVault: multichainVault,
            shiftVault: shiftVault,
            glvVault: glvVault,
            depositHandler: depositHandler,
            withdrawalHandler: withdrawalHandler,
            swapHandler: swapHandler,
            shiftHandler: shiftHandler,
            oracle: oracle,
            keeper: keeper
        });

        GlvShiftUtils.executeGlvShift(params, glvShift, skipRemoval);
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

    function addMarketToGlv(address glv, address market) external globalNonReentrant onlyConfigKeeper {
        GlvUtils.addMarketToGlv(dataStore, eventEmitter, glv, market);
    }

    function removeMarketFromGlv(address glv, address market) external globalNonReentrant onlyConfigKeeper {
        GlvUtils.removeMarketFromGlv(dataStore, eventEmitter, glv, market);
    }
}
