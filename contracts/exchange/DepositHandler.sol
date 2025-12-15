// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./BaseHandler.sol";

import "../market/Market.sol";

import "../deposit/Deposit.sol";
import "../deposit/DepositVault.sol";
import "../deposit/DepositUtils.sol";
import "../deposit/ExecuteDepositUtils.sol";

import "../multichain/MultichainVault.sol";
import "../multichain/IMultichainTransferRouter.sol";

import "./IDepositHandler.sol";

// @title DepositHandler
// @dev Contract to handle creation, execution and cancellation of deposits
contract DepositHandler is IDepositHandler, BaseHandler, ReentrancyGuard {
    using Deposit for Deposit.Props;

    DepositVault public immutable depositVault;
    MultichainVault public immutable multichainVault;
    IMultichainTransferRouter public immutable multichainTransferRouter;
    ISwapHandler public immutable swapHandler;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IOracle _oracle,
        MultichainVault _multichainVault,
        IMultichainTransferRouter _multichainTransferRouter,
        DepositVault _depositVault,
        ISwapHandler _swapHandler
    ) BaseHandler(_roleStore, _dataStore, _eventEmitter, _oracle) {
        multichainVault = _multichainVault;
        multichainTransferRouter = _multichainTransferRouter;
        depositVault = _depositVault;
        swapHandler = _swapHandler;
    }

    // @dev creates a deposit in the deposit store
    // @param account the depositing account
    // @param srcChainId the source chain id
    // @param params IDepositUtils.CreateDepositParams
    function createDeposit(
        address account,
        uint256 srcChainId,
        IDepositUtils.CreateDepositParams calldata params
    ) external override globalNonReentrant onlyController returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.createDepositFeatureDisabledKey(address(this)));
        validateDataListLength(params.dataList.length);

        return DepositUtils.createDeposit(
            dataStore,
            eventEmitter,
            depositVault,
            account,
            srcChainId,
            params
        );
    }

    // @dev cancels a deposit
    // @param key the deposit key
    function cancelDeposit(bytes32 key) external override globalNonReentrant onlyController {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;
        Deposit.Props memory deposit = DepositStoreUtils.get(_dataStore, key);

        FeatureUtils.validateFeature(_dataStore, Keys.cancelDepositFeatureDisabledKey(address(this)));

        validateRequestCancellation(
            deposit.updatedAtTime(),
            "Deposit"
        );

        DepositUtils.cancelDeposit(
            _dataStore,
            eventEmitter,
            multichainVault,
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
        withOraclePrices(oracleParams)
    {
        uint256 startingGas = gasleft();

        Deposit.Props memory deposit = DepositStoreUtils.get(dataStore, key);
        uint256 estimatedGasLimit = GasUtils.estimateExecuteDepositGasLimit(dataStore, deposit);
        GasUtils.validateExecutionGas(dataStore, startingGas, estimatedGasLimit);

        uint256 executionGas = GasUtils.getExecutionGas(dataStore, startingGas);

        try this._executeDeposit{ gas: executionGas }(
            key,
            deposit,
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

    // @dev The executeDepositFromController function was introduced to reduce cross-contract dependencies.
    // This adds an extra external call during deposit execution (e.g. during shifts), which does not adjust
    // params.startingGas for the 63/64 gas rule. As a result, gas usage may be overestimated.
    // Currently, this has no net impact because deposits using this path have executionFee set to zero,
    // so no gas-based fee is charged. If future uses of this function include deposits with a nonzero
    // executionFee, the lack of gas correction should be revisited.
    function executeDepositFromController(
        IExecuteDepositUtils.ExecuteDepositParams calldata executeDepositParams,
        Deposit.Props calldata deposit
    ) external nonReentrant onlyController returns (uint256) {
        FeatureUtils.validateFeature(dataStore, Keys.executeDepositFeatureDisabledKey(address(this)));
        return ExecuteDepositUtils.executeDeposit(executeDepositParams, deposit, true);
    }

    // @dev simulate execution of a deposit to check for any errors
    // @param key the deposit key
    // @param params OracleUtils.SimulatePricesParams
    function simulateExecuteDeposit(
        bytes32 key,
        OracleUtils.SimulatePricesParams memory params
    ) external
        override
        withSimulatedOraclePrices(params)
        globalNonReentrant
    {
        Deposit.Props memory deposit = DepositStoreUtils.get(dataStore, key);

        this._executeDeposit(
            key,
            deposit,
            msg.sender
        );
    }

    // @dev executes a deposit
    // @param oracleParams OracleUtils.SetPricesParams
    // @param keeper the keeper executing the deposit
    // @param startingGas the starting gas
    function _executeDeposit(
        bytes32 key,
        Deposit.Props memory deposit,
        address keeper
    ) external onlySelf {
        uint256 startingGas = gasleft();

        FeatureUtils.validateFeature(dataStore, Keys.executeDepositFeatureDisabledKey(address(this)));

        IExecuteDepositUtils.ExecuteDepositParams memory params = IExecuteDepositUtils.ExecuteDepositParams(
            dataStore,
            eventEmitter,
            multichainVault,
            multichainTransferRouter,
            depositVault,
            oracle,
            swapHandler,
            key,
            keeper,
            startingGas,
            ISwapPricingUtils.SwapPricingType.Deposit,
            true // includeVirtualInventoryImpact
        );

        ExecuteDepositUtils.executeDeposit(params, deposit, false);
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
        GasUtils.validateExecutionErrorGas(dataStore, reasonBytes);

        bytes4 errorSelector = ErrorUtils.getErrorSelectorFromData(reasonBytes);

        validateNonKeeperError(errorSelector, reasonBytes);

        (string memory reason, /* bool hasRevertMessage */) = ErrorUtils.getRevertMessage(reasonBytes);

        DepositUtils.cancelDeposit(
            dataStore,
            eventEmitter,
            multichainVault,
            depositVault,
            key,
            msg.sender,
            startingGas,
            reason,
            reasonBytes
        );
    }
}
