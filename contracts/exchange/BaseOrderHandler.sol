// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseHandler.sol";

import "../market/Market.sol";
import "../order/BaseOrderUtils.sol";
import "../order/OrderVault.sol";
import "../order/Order.sol";
import "../swap/SwapHandler.sol";

import "../referral/IReferralStorage.sol";

// @title BaseOrderHandler
// @dev Base contract for shared order handler functions
contract BaseOrderHandler is BaseHandler {
    using SafeCast for uint256;
    using Order for Order.Props;
    using Array for uint256[];

    MultichainVault public immutable multichainVault;
    OrderVault public immutable orderVault;
    SwapHandler public immutable swapHandler;
    IReferralStorage public immutable referralStorage;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        MultichainVault _multichainVault,
        OrderVault _orderVault,
        SwapHandler _swapHandler,
        IReferralStorage _referralStorage
    ) BaseHandler(_roleStore, _dataStore, _eventEmitter, _oracle) {
        multichainVault = _multichainVault;
        orderVault = _orderVault;
        swapHandler = _swapHandler;
        referralStorage = _referralStorage;
    }

    // @dev get the BaseOrderUtils.ExecuteOrderParams to execute an order
    // @return the required BaseOrderUtils.ExecuteOrderParams params to execute the order
    function _getExecuteOrderParams(
        bytes32 key,
        Order.Props memory order,
        address keeper,
        uint256 startingGas,
        Order.SecondaryOrderType secondaryOrderType
    ) internal view returns (BaseOrderUtils.ExecuteOrderParams memory) {
        BaseOrderUtils.ExecuteOrderParams memory params;

        params.key = key;
        params.order = order;
        params.swapPathMarkets = MarketUtils.getSwapPathMarkets(
            dataStore,
            params.order.swapPath()
        );

        params.contracts.dataStore = dataStore;
        params.contracts.eventEmitter = eventEmitter;
        params.contracts.multichainVault = multichainVault;
        params.contracts.orderVault = orderVault;
        params.contracts.oracle = oracle;
        params.contracts.swapHandler = swapHandler;
        params.contracts.referralStorage = referralStorage;

        params.minOracleTimestamp = oracle.minTimestamp();
        params.maxOracleTimestamp = oracle.maxTimestamp();

        if (params.order.market() != address(0)) {
            params.market = MarketUtils.getEnabledMarket(params.contracts.dataStore, params.order.market());
        }

        params.keeper = keeper;
        params.startingGas = startingGas;

        params.secondaryOrderType = secondaryOrderType;

        return params;
    }
}
