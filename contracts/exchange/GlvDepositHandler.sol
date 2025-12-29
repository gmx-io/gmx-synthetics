// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./IGlvDepositHandler.sol";
import "./BaseHandler.sol";

import "../glv/glvDeposit/GlvDepositUtils.sol";
import "../glv/glvDeposit/ExecuteGlvDepositUtils.sol";

contract GlvDepositHandler is IGlvDepositHandler, BaseHandler, ReentrancyGuard {
    using GlvDeposit for GlvDeposit.Props;

    MultichainVault public immutable multichainVault;
    IMultichainTransferRouter public immutable multichainTransferRouter;
    GlvVault public immutable glvVault;
    ISwapHandler public immutable swapHandler;
    IDepositHandler public immutable depositHandler;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IOracle _oracle,
        MultichainVault _multichainVault,
        IMultichainTransferRouter _multichainTransferRouter,
        GlvVault _glvVault,
        ISwapHandler _swapHandler,
        IDepositHandler _depositHandler
    ) BaseHandler(_roleStore, _dataStore, _eventEmitter, _oracle) {
        multichainVault = _multichainVault;
        multichainTransferRouter = _multichainTransferRouter;
        glvVault = _glvVault;
        swapHandler = _swapHandler;
        depositHandler = _depositHandler;
    }

    function createGlvDeposit(
        address account,
        uint256 srcChainId,
        IGlvDepositUtils.CreateGlvDepositParams calldata params
    ) external globalNonReentrant onlyController returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.createGlvDepositFeatureDisabledKey(address(this)));
        validateDataListLength(params.dataList.length);

        return GlvDepositUtils.createGlvDeposit(dataStore, eventEmitter, glvVault, account, srcChainId, params);
    }

    // @key glvDeposit key
    // @oracleParams prices for all markets in GLV are required
    function executeGlvDeposit(
        bytes32 key,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external globalNonReentrant onlyOrderKeeper withOraclePrices(oracleParams) {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;

        GlvDeposit.Props memory glvDeposit = GlvDepositStoreUtils.get(_dataStore, key);
        uint256 marketCount = GlvUtils.getGlvMarketCount(_dataStore, glvDeposit.glv());
        uint256 estimatedGasLimit = GasUtils.estimateExecuteGlvDepositGasLimit(_dataStore, glvDeposit, marketCount);
        GasUtils.validateExecutionGas(_dataStore, startingGas, estimatedGasLimit);

        uint256 executionGas = GasUtils.getExecutionGas(_dataStore, startingGas);

        try this._executeGlvDeposit{gas: executionGas}(key, glvDeposit, msg.sender) {} catch (
            bytes memory reasonBytes
        ) {
            _handleGlvDepositError(key, startingGas, reasonBytes);
        }
    }

    function _executeGlvDeposit(bytes32 key, GlvDeposit.Props memory glvDeposit, address keeper) external onlySelf {
        uint256 startingGas = gasleft();

        FeatureUtils.validateFeature(dataStore, Keys.executeGlvDepositFeatureDisabledKey(address(this)));

        ExecuteGlvDepositUtils.ExecuteGlvDepositParams memory params = ExecuteGlvDepositUtils.ExecuteGlvDepositParams({
            key: key,
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            depositHandler: depositHandler,
            multichainVault: multichainVault,
            multichainTransferRouter: multichainTransferRouter,
            glvVault: glvVault,
            oracle: oracle,
            swapHandler: swapHandler,
            startingGas: startingGas,
            keeper: keeper
        });

        ExecuteGlvDepositUtils.executeGlvDeposit(params, glvDeposit);
    }

    function _handleGlvDepositError(bytes32 key, uint256 startingGas, bytes memory reasonBytes) internal {
        GasUtils.validateExecutionErrorGas(dataStore, reasonBytes);

        bytes4 errorSelector = ErrorUtils.getErrorSelectorFromData(reasonBytes);

        validateNonKeeperError(errorSelector, reasonBytes);

        (string memory reason /* bool hasRevertMessage */, ) = ErrorUtils.getRevertMessage(reasonBytes);

        GlvDepositUtils.CancelGlvDepositParams memory params = GlvDepositUtils.CancelGlvDepositParams({
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
        GlvDepositUtils.cancelGlvDeposit(params);
    }

    function cancelGlvDeposit(bytes32 key) external globalNonReentrant onlyController {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;
        FeatureUtils.validateFeature(_dataStore, Keys.cancelGlvDepositFeatureDisabledKey(address(this)));

        GlvDeposit.Props memory glvDeposit = GlvDepositStoreUtils.get(_dataStore, key);
        validateRequestCancellation(glvDeposit.updatedAtTime(), "GlvDeposit");

        GlvDepositUtils.CancelGlvDepositParams memory params = GlvDepositUtils.CancelGlvDepositParams({
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            multichainVault: multichainVault,
            glvVault: glvVault,
            oracle: oracle,
            key: key,
            keeper: glvDeposit.account(),
            startingGas: startingGas,
            reason: Keys.USER_INITIATED_CANCEL,
            reasonBytes: ""
        });
        GlvDepositUtils.cancelGlvDeposit(params);
    }

    function simulateExecuteGlvDeposit(
        bytes32 key,
        OracleUtils.SimulatePricesParams memory params
    ) external onlyController withSimulatedOraclePrices(params) globalNonReentrant {
        GlvDeposit.Props memory glvDeposit = GlvDepositStoreUtils.get(dataStore, key);

        this._executeGlvDeposit(key, glvDeposit, msg.sender);
    }
}
