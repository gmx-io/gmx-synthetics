// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./ExchangeUtils.sol";
import "../role/RoleModule.sol";
import "../feature/FeatureUtils.sol";
import "../callback/CallbackUtils.sol";

import "../adl/AdlUtils.sol";
import "../liquidation/LiquidationUtils.sol";

import "../market/Market.sol";
import "../market/MarketStore.sol";
import "../market/MarketToken.sol";

import "../order/Order.sol";
import "../order/OrderStore.sol";
import "../order/OrderUtils.sol";

import "../position/PositionStore.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleModule.sol";
import "../event/EventEmitter.sol";

import "../utils/Null.sol";
import "../referral/IReferralStorage.sol";

// @title BaseOrderHandler
// @dev Base contract for shared order handler functions
contract BaseOrderHandler is ReentrancyGuard, RoleModule, OracleModule {
    using SafeCast for uint256;
    using Order for Order.Props;
    using Array for uint256[];

    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    MarketStore public immutable marketStore;
    OrderStore public immutable orderStore;
    PositionStore public immutable positionStore;
    SwapHandler public immutable swapHandler;
    Oracle public immutable oracle;
    FeeReceiver public immutable feeReceiver;
    IReferralStorage public immutable referralStorage;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        MarketStore _marketStore,
        OrderStore _orderStore,
        PositionStore _positionStore,
        Oracle _oracle,
        SwapHandler _swapHandler,
        FeeReceiver _feeReceiver,
        IReferralStorage _referralStorage
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        marketStore = _marketStore;
        orderStore = _orderStore;
        positionStore = _positionStore;
        oracle = _oracle;
        swapHandler = _swapHandler;
        feeReceiver = _feeReceiver;
        referralStorage = _referralStorage;
    }

    // @dev get the OrderBaseUtils.ExecuteOrderParams to execute an order
    // @param key the key of the order to execute
    // @param oracleParams OracleUtils.SetPricesParams
    // @param keeper the keeper executing the order
    // @param startingGas the starting gas
    // @return the required OrderBaseUtils.ExecuteOrderParams params to execute the order
    function _getExecuteOrderParams(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams,
        address keeper,
        uint256 startingGas
    ) internal view returns (OrderBaseUtils.ExecuteOrderParams memory) {
        OrderBaseUtils.ExecuteOrderParams memory params;

        params.key = key;
        params.order = orderStore.get(key);
        params.swapPathMarkets = MarketUtils.getEnabledMarkets(dataStore, marketStore, params.order.swapPath());

        params.contracts.dataStore = dataStore;
        params.contracts.eventEmitter = eventEmitter;
        params.contracts.orderStore = orderStore;
        params.contracts.positionStore = positionStore;
        params.contracts.oracle = oracle;
        params.contracts.swapHandler = swapHandler;
        params.contracts.feeReceiver = feeReceiver;
        params.contracts.referralStorage = referralStorage;

        params.oracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedOracleBlockNumbers,
            oracleParams.tokens.length
        );

        if (params.order.market() != address(0)) {
            params.market = MarketUtils.getEnabledMarket(params.contracts.dataStore, marketStore, params.order.market());
        }

        params.keeper = keeper;
        params.startingGas = startingGas;

        return params;
    }
}
