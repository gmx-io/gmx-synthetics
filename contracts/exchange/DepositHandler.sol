// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../role/RoleModule.sol";
import "../feature/FeatureUtils.sol";

import "../market/Market.sol";
import "../market/MarketStore.sol";
import "../market/MarketToken.sol";

import "../deposit/Deposit.sol";
import "../deposit/DepositStore.sol";
import "../deposit/DepositUtils.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleModule.sol";

contract DepositHandler is RoleModule, ReentrancyGuard, OracleModule {

    DataStore public dataStore;
    DepositStore public depositStore;
    MarketStore public marketStore;
    Oracle public oracle;
    FeeReceiver public feeReceiver;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        DepositStore _depositStore,
        MarketStore _marketStore,
        Oracle _oracle,
        FeeReceiver _feeReceiver
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        depositStore = _depositStore;
        marketStore = _marketStore;
        oracle = _oracle;
        feeReceiver = _feeReceiver;
    }

    receive() external payable {
        require(msg.sender == EthUtils.weth(dataStore), "DepositHandler: invalid sender");
    }

    function createDeposit(
        address account,
        address market,
        uint256 minMarketTokens,
        bool hasCollateralInETH,
        uint256 executionFee
    ) external nonReentrant onlyController returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.createDepositFeatureKey(address(this)));

        DepositUtils.CreateDepositParams memory params = DepositUtils.CreateDepositParams(
            dataStore,
            depositStore,
            marketStore,
            account,
            market,
            minMarketTokens,
            hasCollateralInETH,
            executionFee,
            EthUtils.weth(dataStore)
        );

        return DepositUtils.createDeposit(params);
    }

    function executeDeposit(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams
    ) external onlyOrderKeeper {
        uint256 startingGas = gasleft();

        try this._executeDeposit(
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

            DepositUtils.cancelDeposit(
                dataStore,
                depositStore,
                marketStore,
                key,
                msg.sender,
                startingGas
            );
        }
    }

    function _executeDeposit(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams,
        address keeper,
        uint256 startingGas
    ) public
        nonReentrant
        onlySelf
        withOraclePrices(oracle, dataStore, oracleParams)
    {
        FeatureUtils.validateFeature(dataStore, Keys.executeDepositFeatureKey(address(this)));

        uint256[] memory oracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedOracleBlockNumbers,
            oracleParams.tokens.length
        );

        DepositUtils.ExecuteDepositParams memory params = DepositUtils.ExecuteDepositParams(
            dataStore,
            depositStore,
            marketStore,
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
