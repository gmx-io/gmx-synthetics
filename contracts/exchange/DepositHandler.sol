// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./ExchangeUtils.sol";
import "../role/RoleModule.sol";
import "../event/EventEmitter.sol";
import "../feature/FeatureUtils.sol";

import "../market/Market.sol";
import "../market/MarketStore.sol";
import "../market/MarketToken.sol";

import "../deposit/Deposit.sol";
import "../deposit/DepositVault.sol";
import "../deposit/DepositUtils.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleModule.sol";

// @title DepositHandler
// @dev Contract to handle creation, execution and cancellation of deposits
contract DepositHandler is ReentrancyGuard, RoleModule, OracleModule {
    using Deposit for Deposit.Props;

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    MarketStore public immutable marketStore;
    DepositVault public immutable depositVault;
    Oracle public immutable oracle;
    FeeReceiver public immutable feeReceiver;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        MarketStore _marketStore,
        DepositVault _depositVault,
        Oracle _oracle,
        FeeReceiver _feeReceiver
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        depositVault = _depositVault;
        marketStore = _marketStore;
        oracle = _oracle;
        feeReceiver = _feeReceiver;
    }

    // @dev creates a deposit in the deposit store
    // @param account the depositing account
    // @param params DepositUtils.CreateDepositParams
    function createDeposit(
        address account,
        DepositUtils.CreateDepositParams calldata params
    ) external nonReentrant onlyController returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.createDepositFeatureKey(address(this)));

        return DepositUtils.createDeposit(
            dataStore,
            eventEmitter,
            depositVault,
            marketStore,
            account,
            params
        );
    }

    function cancelDeposit(
        bytes32 key,
        Deposit.Props memory deposit
    ) external nonReentrant onlyController {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;

        FeatureUtils.validateFeature(_dataStore, Keys.cancelDepositFeatureKey(address(this)));

        ExchangeUtils.validateRequestCancellation(
            _dataStore,
            deposit.updatedAtBlock(),
            "ExchangeRouter: deposit not yet expired"
        );

        DepositUtils.cancelDeposit(
            _dataStore,
            eventEmitter,
            depositVault,
            marketStore,
            key,
            deposit.account(),
            startingGas,
            "USER_INITIATED_CANCEL"
        );
    }

    // @dev executes a deposit
    // @param key the key of the deposit to execute
    // @param oracleParams OracleUtils.SetPricesParams
    function executeDeposit(
        bytes32 key,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external
        onlyOrderKeeper
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        uint256 startingGas = gasleft();

        try this._executeDeposit(
            key,
            oracleParams,
            msg.sender,
            startingGas
        ) {
        } catch Error(string memory reason) {
            bytes32 reasonKey = keccak256(abi.encode(reason));
            if (reasonKey == Keys.EMPTY_PRICE_ERROR_KEY) {
                revert(reason);
            }

            DepositUtils.cancelDeposit(
                dataStore,
                eventEmitter,
                depositVault,
                marketStore,
                key,
                msg.sender,
                startingGas,
                bytes(reason)
            );
        } catch (bytes memory reason) {
            DepositUtils.cancelDeposit(
                dataStore,
                eventEmitter,
                depositVault,
                marketStore,
                key,
                msg.sender,
                startingGas,
                reason
            );
        }
    }

    // @dev executes a deposit
    // @param oracleParams OracleUtils.SetPricesParams
    // @param keeper the keeper executing the deposit
    // @param startingGas the starting gas
    function _executeDeposit(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams,
        address keeper,
        uint256 startingGas
    ) external nonReentrant onlySelf {
        FeatureUtils.validateFeature(dataStore, Keys.executeDepositFeatureKey(address(this)));

        uint256[] memory oracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedOracleBlockNumbers,
            oracleParams.tokens.length
        );

        DepositUtils.ExecuteDepositParams memory params = DepositUtils.ExecuteDepositParams(
            dataStore,
            eventEmitter,
            marketStore,
            depositVault,
            oracle,
            feeReceiver,
            key,
            oracleBlockNumbers,
            keeper,
            startingGas
        );

        DepositUtils.executeDeposit(params);
    }
}
