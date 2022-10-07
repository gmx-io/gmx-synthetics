// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../role/RoleModule.sol";
import "../feature/FeatureUtils.sol";

import "../market/Market.sol";
import "../market/MarketStore.sol";
import "../market/MarketToken.sol";

import "../order/Order.sol";
import "../order/OrderStore.sol";
import "../order/OrderUtils.sol";
import "../order/LiquidationUtils.sol";
import "../position/PositionStore.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleModule.sol";

contract LiquidationHandler is RoleModule, ReentrancyGuard, OracleModule {
    using Order for Order.Props;

    DataStore immutable dataStore;
    EventEmitter immutable eventEmitter;
    MarketStore immutable marketStore;
    PositionStore immutable positionStore;
    Oracle immutable oracle;
    FeeReceiver immutable feeReceiver;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        MarketStore _marketStore,
        PositionStore _positionStore,
        Oracle _oracle,
        FeeReceiver _feeReceiver
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        marketStore = _marketStore;
        positionStore = _positionStore;
        oracle = _oracle;
        feeReceiver = _feeReceiver;
    }

    function liquidatePosition(
        address account,
        address market,
        address collateralToken,
        bool isLong,
        OracleUtils.SetPricesParams memory oracleParams
    ) external
        nonReentrant
        onlyLiquidationKeeper
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        FeatureUtils.validateFeature(dataStore, Keys.liquidatePositionFeatureKey(address(this)));

        OrderUtils.ExecuteOrderParams memory params;

        params.dataStore = dataStore;
        params.positionStore = positionStore;
        params.oracle = oracle;
        params.feeReceiver = feeReceiver;
        params.oracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedOracleBlockNumbers,
            oracleParams.tokens.length
        );

        params.market = marketStore.get(market);

        LiquidationUtils.processLiquidation(params, account, collateralToken, isLong);
    }
}
