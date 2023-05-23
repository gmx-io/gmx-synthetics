// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../utils/GlobalReentrancyGuard.sol";

import "./ExchangeUtils.sol";
import "../role/RoleModule.sol";
import "../event/EventEmitter.sol";
import "../feature/FeatureUtils.sol";

import "../market/Market.sol";
import "../market/MarketToken.sol";

import "../deposit/Deposit.sol";
import "../deposit/DepositVault.sol";
import "../deposit/DepositUtils.sol";
import "../deposit/ExecuteDepositUtils.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleModule.sol";

// @title DepositHandler
// @dev Contract to handle creation, execution and cancellation of deposits
contract DepositHandler is GlobalReentrancyGuard, RoleModule, OracleModule {
    using Deposit for Deposit.Props;

    EventEmitter public immutable eventEmitter;
    DepositVault public immutable depositVault;
    Oracle public immutable oracle;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        DepositVault _depositVault,
        Oracle _oracle
    ) RoleModule(_roleStore) GlobalReentrancyGuard(_dataStore) {
        eventEmitter = _eventEmitter;
        depositVault = _depositVault;
        oracle = _oracle;
    }

    // @dev creates a deposit in the deposit store
    // @param account the depositing account
    // @param params DepositUtils.CreateDepositParams
    function createDeposit(
        address account,
        DepositUtils.CreateDepositParams calldata params
    ) external globalNonReentrant onlyController returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.createDepositFeatureDisabledKey(address(this)));

        return DepositUtils.createDeposit(
            dataStore,
            eventEmitter,
            depositVault,
            account,
            params
        );
    }

    // @dev cancels a deposit
    // @param key the deposit key
    function cancelDeposit(bytes32 key) external globalNonReentrant onlyController {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;
        Deposit.Props memory deposit = DepositStoreUtils.get(_dataStore, key);

        FeatureUtils.validateFeature(_dataStore, Keys.cancelDepositFeatureDisabledKey(address(this)));

        ExchangeUtils.validateRequestCancellation(
            _dataStore,
            deposit.updatedAtBlock(),
            "Deposit"
        );

        DepositUtils.cancelDeposit(
            _dataStore,
            eventEmitter,
            depositVault,
            key,
            deposit.account(),
            startingGas,
            Keys.USER_INITIATED_CANCEL,
            ""
        );
    }

    // @dev executes a deposit
    // @param key the key of the deposit to execute
    // @param oracleParams OracleUtils.SetPricesParams
    function executeDeposit(
        bytes32 key,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external
        globalNonReentrant
        onlyOrderKeeper
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        uint256 startingGas = gasleft();
        uint256 executionGas = GasUtils.getExecutionGas(dataStore, startingGas);

        try this._executeDeposit{ gas: executionGas }(
            key,
            oracleParams,
            msg.sender
        ) {
        } catch (bytes memory reasonBytes) {
            _handleDepositError(
                key,
                startingGas,
                reasonBytes
            );
        }
    }

    // @dev simulate execution of a deposit to check for any errors
    // @param key the deposit key
    // @param params OracleUtils.SimulatePricesParams
    function simulateExecuteDeposit(
        bytes32 key,
        OracleUtils.SimulatePricesParams memory params
    ) external
        onlyController
        withSimulatedOraclePrices(oracle, params)
        globalNonReentrant
    {

        OracleUtils.SetPricesParams memory oracleParams;

        this._executeDeposit(
            key,
            oracleParams,
            msg.sender
        );
    }

    // @dev executes a deposit
    // @param oracleParams OracleUtils.SetPricesParams
    // @param keeper the keeper executing the deposit
    // @param startingGas the starting gas
    function _executeDeposit(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams,
        address keeper
    ) external onlySelf {
        uint256 startingGas = gasleft();

        FeatureUtils.validateFeature(dataStore, Keys.executeDepositFeatureDisabledKey(address(this)));

        uint256[] memory minOracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedMinOracleBlockNumbers,
            oracleParams.tokens.length
        );

        uint256[] memory maxOracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedMaxOracleBlockNumbers,
            oracleParams.tokens.length
        );

        ExecuteDepositUtils.ExecuteDepositParams memory params = ExecuteDepositUtils.ExecuteDepositParams(
            dataStore,
            eventEmitter,
            depositVault,
            oracle,
            key,
            minOracleBlockNumbers,
            maxOracleBlockNumbers,
            keeper,
            startingGas
        );

        ExecuteDepositUtils.executeDeposit(params);
    }

    // @dev handle errors from deposits
    // @param key the deposit key
    // @param startingGas the starting gas of the txn
    // @param reasonBytes the reason bytes of the error
    function _handleDepositError(
        bytes32 key,
        uint256 startingGas,
        bytes memory reasonBytes
    ) internal {
        bytes4 errorSelector = ErrorUtils.getErrorSelectorFromData(reasonBytes);

        if (
            OracleUtils.isOracleError(errorSelector) ||
            errorSelector == Errors.DisabledFeature.selector
        ) {
            ErrorUtils.revertWithCustomError(reasonBytes);
        }

        (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);

        DepositUtils.cancelDeposit(
            dataStore,
            eventEmitter,
            depositVault,
            key,
            msg.sender,
            startingGas,
            reason,
            reasonBytes
        );
    }
}
