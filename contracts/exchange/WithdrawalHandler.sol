// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../role/RoleModule.sol";
import "../feature/FeatureUtils.sol";

import "../market/Market.sol";
import "../market/MarketStore.sol";
import "../market/MarketToken.sol";

import "../withdrawal/Withdrawal.sol";
import "../withdrawal/WithdrawalStore.sol";
import "../withdrawal/WithdrawalUtils.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleModule.sol";

import "../eth/EthUtils.sol";

contract WithdrawalHandler is RoleModule, ReentrancyGuard, OracleModule {

    DataStore public dataStore;
    WithdrawalStore public withdrawalStore;
    MarketStore public marketStore;
    Oracle public oracle;
    FeeReceiver public feeReceiver;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        WithdrawalStore _withdrawalStore,
        MarketStore _marketStore,
        Oracle _oracle,
        FeeReceiver _feeReceiver
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        withdrawalStore = _withdrawalStore;
        marketStore = _marketStore;
        oracle = _oracle;
        feeReceiver = _feeReceiver;
    }

    receive() external payable {
        require(msg.sender == EthUtils.weth(dataStore), "WithdrawalHandler: invalid sender");
    }

    function createWithdrawal(
        address account,
        address market,
        uint256 marketTokensLongAmount,
        uint256 marketTokensShortAmount,
        uint256 minLongTokenAmount,
        uint256 minShortTokenAmount,
        bool hasCollateralInETH,
        uint256 executionFee
    ) nonReentrant onlyController external returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.createWithdrawalFeatureKey(address(this)));

        WithdrawalUtils.CreateWithdrawalParams memory params = WithdrawalUtils.CreateWithdrawalParams(
            dataStore,
            withdrawalStore,
            marketStore,
            account,
            market,
            marketTokensLongAmount,
            marketTokensShortAmount,
            minLongTokenAmount,
            minShortTokenAmount,
            hasCollateralInETH,
            executionFee,
            EthUtils.weth(dataStore)
        );

        Market.Props memory _market = params.marketStore.get(params.market);
        MarketUtils.validateNonEmptyMarket(_market);

        return WithdrawalUtils.createWithdrawal(params);
    }

    function executeWithdrawal(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams
    ) external onlyOrderKeeper {
        uint256 startingGas = gasleft();

        try this._executeWithdrawal(
            key,
            oracleParams,
            msg.sender,
            startingGas
        ) {
        } catch Error(string memory reason) {
            // revert instead of cancel if the reason for failure is due to oracle params
            if (keccak256(abi.encodePacked(reason)) == Keys.ORACLE_ERROR_KEY) {
                revert(reason);
            }

            WithdrawalUtils.cancelWithdrawal(
                dataStore,
                withdrawalStore,
                key,
                msg.sender,
                startingGas
            );
        }
    }

    function _executeWithdrawal(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams,
        address keeper,
        uint256 startingGas
    ) external
        nonReentrant
        onlySelf
        withOraclePrices(oracle, dataStore, oracleParams)
    {
        FeatureUtils.validateFeature(dataStore, Keys.executeWithdrawalFeatureKey(address(this)));

        uint256[] memory oracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedOracleBlockNumbers,
            oracleParams.tokens.length
        );

        WithdrawalUtils.ExecuteWithdrawalParams memory params = WithdrawalUtils.ExecuteWithdrawalParams(
            dataStore,
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
