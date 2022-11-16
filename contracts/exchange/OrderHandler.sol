// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../role/RoleModule.sol";
import "../feature/FeatureUtils.sol";
import "../callback/CallbackUtils.sol";

import "../market/Market.sol";
import "../market/MarketStore.sol";
import "../market/MarketToken.sol";

import "../order/Order.sol";
import "../order/OrderStore.sol";
import "../order/OrderUtils.sol";

import "../position/PositionStore.sol";
import "../oracle/Oracle.sol";
import "../oracle/OracleModule.sol";
import "../events/EventEmitter.sol";

import "../utils/Null.sol";

contract OrderHandler is ReentrancyGuard, RoleModule, OracleModule {
    using Order for Order.Props;

    DataStore immutable dataStore;
    MarketStore immutable marketStore;
    OrderStore immutable orderStore;
    PositionStore immutable positionStore;
    Oracle immutable oracle;
    EventEmitter immutable eventEmitter;
    FeeReceiver immutable feeReceiver;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        MarketStore _marketStore,
        OrderStore _orderStore,
        PositionStore _positionStore,
        Oracle _oracle,
        FeeReceiver _feeReceiver
    ) RoleModule(_roleStore) {
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        marketStore = _marketStore;
        orderStore = _orderStore;
        positionStore = _positionStore;
        oracle = _oracle;
        feeReceiver = _feeReceiver;
    }

    receive() external payable {}

    function createOrder(
        address account,
        OrderBaseUtils.CreateOrderParams calldata params
    ) external nonReentrant onlyController returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.createOrderFeatureKey(address(this), uint256(params.orderType)));

        return OrderUtils.createOrder(
            dataStore,
            eventEmitter,
            orderStore,
            marketStore,
            account,
            params
        );
    }

    function executeOrder(
        bytes32 key,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external nonReentrant onlyOrderKeeper {
        uint256 startingGas = gasleft();

        try this._executeOrder(
            key,
            oracleParams,
            msg.sender,
            startingGas
        ) {
        } catch Error(string memory reason) {
            bytes32 reasonKey = keccak256(abi.encode(reason));

            // note that it is possible for any external contract to spoof these errors
            // this can happen when calling transfers for external tokens, eth transfers, callbacks etc
            // because of that, errors from external calls should be separately caught
            if (
                reasonKey == Keys.ORACLE_ERROR_KEY ||
                reasonKey == Keys.FROZEN_ORDER_ERROR_KEY ||
                reasonKey == Keys.EMPTY_POSITION_ERROR_KEY
            ) {
                revert(reason);
            }

            _handleOrderError(key, startingGas, reason, reasonKey);
        } catch (bytes memory reason) {
            string memory _reason = string(abi.encode(reason));
            bytes32 reasonKey = keccak256(abi.encode(reason));
            _handleOrderError(key, startingGas, _reason, reasonKey);
        }
    }

    function executeLiquidation(
        address account,
        address market,
        address collateralToken,
        bool isLong,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external
        nonReentrant
        onlyLiquidationKeeper
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        uint256 startingGas = gasleft();

        bytes32 key = _createLiquidationOrder(account, market, collateralToken, isLong);

        OrderBaseUtils.ExecuteOrderParams memory params = _getExecuteOrderParams(key, oracleParams, msg.sender, startingGas);

        FeatureUtils.validateFeature(params.dataStore, Keys.executeOrderFeatureKey(address(this), uint256(params.order.orderType())));

        OrderUtils.executeOrder(params);
    }

    function _executeOrder(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams,
        address keeper,
        uint256 startingGas
    ) external
        onlySelf
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
        OrderBaseUtils.ExecuteOrderParams memory params = _getExecuteOrderParams(key, oracleParams, keeper, startingGas);
        // limit swaps require frozen order keeper as well since on creation it can fail due to output amount
        // which would automatically cause the order to be frozen
        // limit increase and decrease positions may fail due to output amount as well and become frozen
        // but only if their acceptablePrice is reached
        if (params.order.isFrozen() || params.order.orderType() == Order.OrderType.LimitSwap) {
            _validateFrozenOrderKeeper(keeper);
        }

        FeatureUtils.validateFeature(params.dataStore, Keys.executeOrderFeatureKey(address(this), uint256(params.order.orderType())));

        OrderUtils.executeOrder(params);
    }

    function _getExecuteOrderParams(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams,
        address keeper,
        uint256 startingGas
    ) internal view returns (OrderBaseUtils.ExecuteOrderParams memory) {
        OrderBaseUtils.ExecuteOrderParams memory params;

        params.key = key;
        params.order = orderStore.get(key);
        params.swapPathMarkets = MarketUtils.getMarkets(marketStore, params.order.swapPath());

        params.dataStore = dataStore;
        params.eventEmitter = eventEmitter;
        params.orderStore = orderStore;
        params.positionStore = positionStore;
        params.oracle = oracle;
        params.feeReceiver = feeReceiver;
        params.oracleBlockNumbers = OracleUtils.getUncompactedOracleBlockNumbers(
            oracleParams.compactedOracleBlockNumbers,
            oracleParams.tokens.length
        );

        if (params.order.market() != address(0)) {
            params.market = marketStore.get(params.order.market());
        }

        params.keeper = keeper;
        params.startingGas = startingGas;

        return params;
    }

    function _handleOrderError(
        bytes32 key,
        uint256 startingGas,
        string memory reason,
        bytes32 reasonKey
    ) internal {
        Order.Props memory order = orderStore.get(key);
        bool isMarketOrder = OrderBaseUtils.isMarketOrder(order.orderType());

        if (isMarketOrder) {
            OrderUtils.cancelOrder(
                dataStore,
                eventEmitter,
                orderStore,
                key,
                msg.sender,
                startingGas,
                reason
            );
        } else {
            if (reasonKey == Keys.UNACCEPTABLE_PRICE_ERROR_KEY) {
                revert(reason);
            }

            // freeze unfulfillable orders to prevent the order system from being gamed
            // an example of gaming would be if a user creates a limit order
            // with size greater than the available amount in the pool
            // the user waits for their limit price to be hit, and if price
            // moves in their favour after, they can deposit into the pool
            // to allow the order to be executed then close the order for a profit
            //
            // frozen order keepers will have additional validations before executing
            // frozen orders to prevent gaming
            //
            // alternatively, the user can call updateOrder to unfreeze the order
            OrderUtils.freezeOrder(
                dataStore,
                eventEmitter,
                orderStore,
                key,
                msg.sender,
                startingGas,
                reason
            );
        }
    }

    function _createLiquidationOrder(
        address account,
        address market,
        address collateralToken,
        bool isLong
    ) internal returns (bytes32) {
        bytes32 positionKey = PositionUtils.getPositionKey(account, market, collateralToken, isLong);
        Position.Props memory position = positionStore.get(positionKey);

        Order.Addresses memory addresses = Order.Addresses(
            account, // account
            account, // receiver
            address(0), // callbackContract
            market, // market
            position.collateralToken, // initialCollateralToken
            new address[](0) // swapPath
        );

        Order.Numbers memory numbers = Order.Numbers(
            position.sizeInUsd, // sizeDeltaUsd
            0, // initialCollateralDeltaAmount
            0, // triggerPrice
            position.isLong ? 0 : type(uint256).max, // acceptablePrice
            0, // executionFee
            0, // callbackGasLimit
            0, // minOutputAmount
            Chain.currentBlockNumber() // updatedAtBlock
        );

        Order.Flags memory flags = Order.Flags(
            Order.OrderType.Liquidation, // orderType
            position.isLong, // isLong
            true, // shouldConvertETH
            false // isFrozen
        );

        Order.Props memory order = Order.Props(
            addresses,
            numbers,
            flags,
            Null.BYTES
        );

        order.touch();

        bytes32 key = NonceUtils.getNextKey(dataStore);
        orderStore.set(key, order);

        return key;
    }


    function _validateFrozenOrderKeeper(address keeper) internal view {
        require(roleStore.hasRole(keeper, Role.FROZEN_ORDER_KEEPER), Keys.FROZEN_ORDER_ERROR);
    }
}
