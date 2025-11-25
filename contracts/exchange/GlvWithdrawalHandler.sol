// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./IGlvWithdrawalHandler.sol";
import "./BaseHandler.sol";

import "../glv/glvWithdrawal/GlvWithdrawalUtils.sol";
import "../multichain/IMultichainTransferRouter.sol";

contract GlvWithdrawalHandler is IGlvWithdrawalHandler, BaseHandler, ReentrancyGuard {
    using GlvWithdrawal for GlvWithdrawal.Props;

    MultichainVault public immutable multichainVault;
    IMultichainTransferRouter public immutable multichainTransferRouter;
    GlvVault public immutable glvVault;
    ISwapHandler public immutable swapHandler;
    IWithdrawalHandler public immutable withdrawalHandler;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IOracle _oracle,
        MultichainVault _multichainVault,
        IMultichainTransferRouter _multichainTransferRouter,
        GlvVault _glvVault,
        ISwapHandler _swapHandler,
        IWithdrawalHandler _withdrawalHandler
    ) BaseHandler(_roleStore, _dataStore, _eventEmitter, _oracle) {
        multichainVault = _multichainVault;
        multichainTransferRouter = _multichainTransferRouter;
        glvVault = _glvVault;
        swapHandler = _swapHandler;
        withdrawalHandler = _withdrawalHandler;
    }

    function createGlvWithdrawal(
        address account,
        uint256 srcChainId,
        IGlvWithdrawalUtils.CreateGlvWithdrawalParams calldata params
    ) external globalNonReentrant onlyController returns (bytes32) {
        DataStore _dataStore = dataStore;
        FeatureUtils.validateFeature(_dataStore, Keys.createGlvWithdrawalFeatureDisabledKey(address(this)));
        validateDataListLength(params.dataList.length);

        return GlvWithdrawalUtils.createGlvWithdrawal(_dataStore, eventEmitter, glvVault, account, srcChainId, params);
    }

    // @key glvWithdrawal key
    // @oracleParams prices for all markets in GLV are required
    function executeGlvWithdrawal(
        bytes32 key,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external globalNonReentrant onlyOrderKeeper withOraclePrices(oracleParams) {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;

        GlvWithdrawal.Props memory glvWithdrawal = GlvWithdrawalStoreUtils.get(_dataStore, key);
        uint256 marketCount = GlvUtils.getGlvMarketCount(_dataStore, glvWithdrawal.glv());
        uint256 estimatedGasLimit = GasUtils.estimateExecuteGlvWithdrawalGasLimit(
            _dataStore,
            glvWithdrawal,
            marketCount
        );
        GasUtils.validateExecutionGas(_dataStore, startingGas, estimatedGasLimit);

        uint256 executionGas = GasUtils.getExecutionGas(_dataStore, startingGas);

        try this._executeGlvWithdrawal{gas: executionGas}(key, glvWithdrawal, msg.sender) {} catch (
            bytes memory reasonBytes
        ) {
            _handleGlvWithdrawalError(key, startingGas, reasonBytes);
        }
    }

    function _executeGlvWithdrawal(
        bytes32 key,
        GlvWithdrawal.Props memory glvWithdrawal,
        address keeper
    ) external onlySelf {
        uint256 startingGas = gasleft();

        FeatureUtils.validateFeature(dataStore, Keys.executeGlvWithdrawalFeatureDisabledKey(address(this)));

        GlvWithdrawalUtils.ExecuteGlvWithdrawalParams memory params = GlvWithdrawalUtils.ExecuteGlvWithdrawalParams({
            key: key,
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            multichainVault: multichainVault,
            multichainTransferRouter: multichainTransferRouter,
            glvVault: glvVault,
            oracle: oracle,
            swapHandler: swapHandler,
            withdrawalHandler: withdrawalHandler,
            startingGas: startingGas,
            keeper: keeper
        });

        GlvWithdrawalUtils.executeGlvWithdrawal(params, glvWithdrawal);
    }

    function _handleGlvWithdrawalError(bytes32 key, uint256 startingGas, bytes memory reasonBytes) internal {
        GasUtils.validateExecutionErrorGas(dataStore, reasonBytes);

        bytes4 errorSelector = ErrorUtils.getErrorSelectorFromData(reasonBytes);

        validateNonKeeperError(errorSelector, reasonBytes);

        (string memory reason /* bool hasRevertMessage */, ) = ErrorUtils.getRevertMessage(reasonBytes);

        GlvWithdrawalUtils.CancelGlvWithdrawalParams memory params = GlvWithdrawalUtils.CancelGlvWithdrawalParams({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            multichainVault: multichainVault,
            glvVault: glvVault,
            oracle: oracle,
            key: key,
            keeper: msg.sender,
            startingGas: startingGas,
            reason: reason,
            reasonBytes: reasonBytes
        });
        GlvWithdrawalUtils.cancelGlvWithdrawal(params);
    }

    function cancelGlvWithdrawal(bytes32 key) external globalNonReentrant onlyController {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;
        FeatureUtils.validateFeature(_dataStore, Keys.cancelGlvWithdrawalFeatureDisabledKey(address(this)));

        GlvWithdrawal.Props memory glvWithdrawal = GlvWithdrawalStoreUtils.get(_dataStore, key);
        validateRequestCancellation(glvWithdrawal.updatedAtTime(), "GlvWithdrawal");

        GlvWithdrawalUtils.CancelGlvWithdrawalParams memory params = GlvWithdrawalUtils.CancelGlvWithdrawalParams({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            multichainVault: multichainVault,
            glvVault: glvVault,
            oracle: oracle,
            key: key,
            keeper: glvWithdrawal.account(),
            startingGas: startingGas,
            reason: Keys.USER_INITIATED_CANCEL,
            reasonBytes: ""
        });
        GlvWithdrawalUtils.cancelGlvWithdrawal(params);
    }

    function simulateExecuteGlvWithdrawal(
        bytes32 key,
        OracleUtils.SimulatePricesParams memory params
    ) external onlyController withSimulatedOraclePrices(params) globalNonReentrant {
        GlvWithdrawal.Props memory glvWithdrawal = GlvWithdrawalStoreUtils.get(dataStore, key);

        this._executeGlvWithdrawal(key, glvWithdrawal, msg.sender);
    }
}
