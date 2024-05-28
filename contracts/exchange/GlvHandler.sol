// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./BaseHandler.sol";
import "../callback/CallbackUtils.sol";
import "../exchange/IDepositHandler.sol";

import "../glv/Glv.sol";
import "../glv/GlvUtils.sol";
import "../glv/GlvDepositUtils.sol";
import "../glv/GlvDepositStoreUtils.sol";
import "../glv/GlvVault.sol";
import "../glv/GlvDeposit.sol";
import "../deposit/DepositUtils.sol";
import "../deposit/ExecuteDepositUtils.sol";

contract GLVHandler is BaseHandler, ReentrancyGuard {
    using GlvDeposit for GlvDeposit.Props;

    IDepositHandler public immutable depositHandler;
    GlvVault public immutable glvVault;
    DepositVault public immutable depositVault;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        IDepositHandler _depositHandler,
        GlvVault _glvVault,
        DepositVault _depositVault
    ) BaseHandler(_roleStore, _dataStore, _eventEmitter, _oracle) {
        depositHandler = _depositHandler;
        glvVault = _glvVault;
        depositVault = _depositVault;
    }

    function createGlvDeposit(
        address account,
        GlvDepositUtils.CreateGlvDepositParams calldata params
    ) external globalNonReentrant onlyController returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.createGlvDepositFeatureDisabledKey(address(this)));

        return GlvDepositUtils.createGlvDeposit(dataStore, eventEmitter, glvVault, account, params);
    }

    function executeGlvDeposit(
        bytes32 key,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external globalNonReentrant onlyOrderKeeper withOraclePrices(oracleParams) {
        uint256 startingGas = gasleft();

        GlvDeposit.Props memory glvDeposit = GlvDepositStoreUtils.get(dataStore, key);
        uint256 marketCount = GlvUtils.getMarketCount(dataStore, glvDeposit.glv());
        uint256 estimatedGasLimit = GasUtils.estimateExecuteGlvDepositGasLimit(dataStore, glvDeposit, marketCount);
        GasUtils.validateExecutionGas(dataStore, startingGas, estimatedGasLimit);

        uint256 executionGas = GasUtils.getExecutionGas(dataStore, startingGas);

        try this._executeGlvDeposit{gas: executionGas}(key, glvDeposit, msg.sender) {} catch (
            bytes memory reasonBytes
        ) {
            _handleGlvDepositError(key, startingGas, reasonBytes);
        }
    }

    function _executeGlvDeposit(bytes32 key, GlvDeposit.Props memory glvDeposit, address keeper) external onlySelf {
        uint256 startingGas = gasleft();

        FeatureUtils.validateFeature(dataStore, Keys.executeGlvDepositFeatureDisabledKey(address(this)));

        GlvDepositUtils.ExecuteGlvDepositParams memory params = GlvDepositUtils.ExecuteGlvDepositParams({
            key: key,
            dataStore: dataStore,
            eventEmitter: eventEmitter,
            depositVault: depositVault,
            glvVault: glvVault,
            oracle: oracle,
            startingGas: startingGas,
            keeper: keeper
        });

        GlvDepositUtils.executeGlvDeposit(params, glvDeposit);
    }

    function _handleGlvDepositError(bytes32 key, uint256 startingGas, bytes memory reasonBytes) internal {
        GasUtils.validateExecutionErrorGas(dataStore, reasonBytes);

        bytes4 errorSelector = ErrorUtils.getErrorSelectorFromData(reasonBytes);

        if (OracleUtils.isOracleError(errorSelector) || errorSelector == Errors.DisabledFeature.selector) {
            ErrorUtils.revertWithCustomError(reasonBytes);
        }

        (string memory reason /* bool hasRevertMessage */, ) = ErrorUtils.getRevertMessage(reasonBytes);

        GlvDepositUtils.cancelGlvDeposit(
            dataStore,
            eventEmitter,
            glvVault,
            key,
            msg.sender,
            startingGas,
            reason,
            reasonBytes
        );
    }

    function cancelGlvDeposit(bytes32 key) external globalNonReentrant onlyController {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;
        FeatureUtils.validateFeature(_dataStore, Keys.cancelGlvDepositFeatureDisabledKey(address(this)));

        GlvDeposit.Props memory glvDeposit = GlvDepositStoreUtils.get(_dataStore, key);
        validateRequestCancellation(glvDeposit.updatedAtTime(), "GlvDeposit");

        GlvDepositUtils.cancelGlvDeposit(
            _dataStore,
            eventEmitter,
            glvVault,
            key,
            msg.sender,
            startingGas,
            Keys.USER_INITIATED_CANCEL,
            ""
        );
    }

    function simulateExecuteGlvDeposit() external {
        // TODO:
    }

    function shift() external {
        // TODO: allow shifting of GM tokens between markets
    }
}
