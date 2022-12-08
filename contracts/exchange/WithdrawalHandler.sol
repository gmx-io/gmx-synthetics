// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../bank/FundReceiver.sol";
import "../feature/FeatureUtils.sol";

import "../market/Market.sol";
import "../market/MarketStore.sol";
import "../market/MarketToken.sol";

import "../withdrawal/Withdrawal.sol";
import "../withdrawal/WithdrawalStore.sol";
import "../withdrawal/WithdrawalUtils.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleModule.sol";

// @title WithdrawalHandler
// @dev Contract to handle creation, execution and cancellation of withdrawals
contract WithdrawalHandler is ReentrancyGuard, FundReceiver, OracleModule {
    EventEmitter public immutable eventEmitter;
    WithdrawalStore public immutable withdrawalStore;
    MarketStore public immutable marketStore;
    Oracle public immutable oracle;
    FeeReceiver public immutable feeReceiver;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        WithdrawalStore _withdrawalStore,
        MarketStore _marketStore,
        Oracle _oracle,
        FeeReceiver _feeReceiver
    ) FundReceiver(_roleStore, _dataStore) {
        eventEmitter = _eventEmitter;
        withdrawalStore = _withdrawalStore;
        marketStore = _marketStore;
        oracle = _oracle;
        feeReceiver = _feeReceiver;
    }

    receive() external payable {}

    // @dev creates a withdrawal in the withdrawal store
    // @param account the withdrawing account
    // @param params WithdrawalUtils.CreateWithdrawalParams
    function createWithdrawal(
        address account,
        WithdrawalUtils.CreateWithdrawalParams calldata params
    ) external nonReentrant onlyController  returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.createWithdrawalFeatureKey(address(this)));

        return WithdrawalUtils.createWithdrawal(
            dataStore,
            eventEmitter,
            withdrawalStore,
            marketStore,
            account,
            params
        );
    }

    // @dev executes a withdrawal
    // @param key the key of the withdrawal to execute
    // @param oracleParams OracleUtils.SetPricesParams
    function executeWithdrawal(
        bytes32 key,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external nonReentrant onlyOrderKeeper {
        uint256 startingGas = gasleft();

        try this._executeWithdrawal(
            key,
            oracleParams,
            msg.sender,
            startingGas
        ) {
        } catch Error(string memory reason) {
            WithdrawalUtils.cancelWithdrawal(
                dataStore,
                eventEmitter,
                withdrawalStore,
                key,
                msg.sender,
                startingGas,
                reason
            );
        } catch (bytes memory _reason) {
            string memory reason = string(abi.encode(_reason));
            WithdrawalUtils.cancelWithdrawal(
                dataStore,
                eventEmitter,
                withdrawalStore,
                key,
                msg.sender,
                startingGas,
                reason
            );
        }
    }

    // @dev executes a withdrawal
    // @param oracleParams OracleUtils.SetPricesParams
    // @param keeper the keeper executing the withdrawal
    // @param startingGas the starting gas
    function _executeWithdrawal(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams,
        address keeper,
        uint256 startingGas
    ) external
        onlySelf
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        FeatureUtils.validateFeature(dataStore, Keys.executeWithdrawalFeatureKey(address(this)));

        uint256[] memory oracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedOracleBlockNumbers,
            oracleParams.tokens.length
        );

        WithdrawalUtils.ExecuteWithdrawalParams memory params = WithdrawalUtils.ExecuteWithdrawalParams(
            dataStore,
            eventEmitter,
            withdrawalStore,
            marketStore,
            oracle,
            feeReceiver,
            key,
            oracleBlockNumbers,
            keeper,
            startingGas
        );

        WithdrawalUtils.executeWithdrawal(params);
    }
}
