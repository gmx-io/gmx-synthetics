// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseOrderHandler.sol";

// @title OrderHandler
// @dev Contract to handle creation, execution and cancellation of orders
contract OrderHandler is BaseOrderHandler {
    using SafeCast for uint256;
    using Order for Order.Props;
    using Array for uint256[];

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        OrderVault _orderVault,
        Oracle _oracle,
        SwapHandler _swapHandler,
        FeeReceiver _feeReceiver,
        IReferralStorage _referralStorage
    ) BaseOrderHandler(
        _roleStore,
        _dataStore,
        _eventEmitter,
        _orderVault,
        _oracle,
        _swapHandler,
        _feeReceiver,
        _referralStorage
    ) {}

    // @dev creates an order in the order store
    // @param account the order's account
    // @param params BaseOrderUtils.CreateOrderParams
    function createOrder(
        address account,
        BaseOrderUtils.CreateOrderParams calldata params
    ) external nonReentrant onlyController returns (bytes32) {
        FeatureUtils.validateFeature(dataStore, Keys.createOrderFeatureKey(address(this), uint256(params.orderType)));

        return OrderUtils.createOrder(
            dataStore,
            eventEmitter,
            orderVault,
            account,
            params
        );
    }

    /**
     * @dev Updates the given order with the specified size delta, acceptable price, and trigger price.
     * The `updateOrder()` feature must be enabled for the given order type. The caller must be the owner
     * of the order, and the order must not be a market order. The size delta, trigger price, and
     * acceptable price are updated on the order, and the order is unfrozen. Any additional WNT that is
     * transferred to the contract is added to the order's execution fee. The updated order is then saved
     * in the order store, and an `OrderUpdated` event is emitted.
     *
     * @param key The unique ID of the order to be updated
     * @param sizeDeltaUsd The new size delta for the order
     * @param acceptablePrice The new acceptable price for the order
     * @param triggerPrice The new trigger price for the order
     */
    function updateOrder(
        bytes32 key,
        uint256 sizeDeltaUsd,
        uint256 acceptablePrice,
        uint256 triggerPrice,
        uint256 minOutputAmount,
        Order.Props memory order
    ) external payable nonReentrant {
        FeatureUtils.validateFeature(dataStore, Keys.updateOrderFeatureKey(address(this), uint256(order.orderType())));

        if (BaseOrderUtils.isMarketOrder(order.orderType())) {
            revert("OrderHandler: invalid orderType");
        }

        order.setSizeDeltaUsd(sizeDeltaUsd);
        order.setTriggerPrice(triggerPrice);
        order.setAcceptablePrice(acceptablePrice);
        order.setMinOutputAmount(minOutputAmount);
        order.setIsFrozen(false);

        // allow topping up of executionFee as partially filled or frozen orders
        // will have their executionFee reduced
        address wnt = TokenUtils.wnt(dataStore);
        uint256 receivedWnt = orderVault.recordTransferIn(wnt);
        order.setExecutionFee(order.executionFee() + receivedWnt);

        uint256 estimatedGasLimit = GasUtils.estimateExecuteOrderGasLimit(dataStore, order);
        GasUtils.validateExecutionFee(dataStore, estimatedGasLimit, order.executionFee());

        order.touch();
        OrderStoreUtils.set(dataStore, key, order);

        OrderEventUtils.emitOrderUpdated(eventEmitter, key, sizeDeltaUsd, triggerPrice, acceptablePrice);
    }

    /**
     * @dev Cancels the given order. The `cancelOrder()` feature must be enabled for the given order
     * type. The caller must be the owner of the order, and the order must not be a market order. The
     * order is cancelled by calling the `cancelOrder()` function in the `OrderUtils` contract. This
     * function also records the starting gas amount and the reason for cancellation, which is passed to
     * the `cancelOrder()` function.
     *
     * @param key The unique ID of the order to be cancelled
     */
    function cancelOrder(
        bytes32 key,
        Order.Props memory order
    ) external nonReentrant onlyController {
        uint256 startingGas = gasleft();

        DataStore _dataStore = dataStore;

        FeatureUtils.validateFeature(_dataStore, Keys.cancelOrderFeatureKey(address(this), uint256(order.orderType())));

        if (BaseOrderUtils.isMarketOrder(order.orderType())) {
            ExchangeUtils.validateRequestCancellation(
                _dataStore,
                order.updatedAtBlock(),
                "ExchangeRouter: order not yet expired"
            );
        }

        OrderUtils.cancelOrder(
            dataStore,
            eventEmitter,
            orderVault,
            key,
            order.account(),
            startingGas,
            "USER_INITIATED_CANCEL"
        );
    }

    function simulateExecuteOrder(
        bytes32 key,
        OracleUtils.SimulatePricesParams memory params
    ) external
        onlyController
        withSimulatedOraclePrices(oracle, params)
    {
        uint256 startingGas = gasleft();

        OracleUtils.SetPricesParams memory oracleParams;

        this._executeOrder(
            key,
            oracleParams,
            msg.sender,
            startingGas
        );
    }

    // @dev executes an order
    // @param key the key of the order to execute
    // @param oracleParams OracleUtils.SetPricesParams
    function executeOrder(
        bytes32 key,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external
        onlyOrderKeeper
        withOraclePrices(oracle, dataStore, eventEmitter, oracleParams)
    {
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
                reasonKey == Keys.EMPTY_PRICE_ERROR_KEY ||
                reasonKey == Keys.FROZEN_ORDER_ERROR_KEY ||
                reasonKey == Keys.EMPTY_POSITION_ERROR_KEY
            ) {
                revert(reason);
            }

            _handleOrderError(key, startingGas, bytes(reason), reasonKey);
        } catch (bytes memory reason) {
            bytes32 reasonKey = keccak256(abi.encode(reason));
            _handleOrderError(key, startingGas, reason, reasonKey);
        }
    }

    // @dev executes an order
    // @param key the key of the order to execute
    // @param oracleParams OracleUtils.SetPricesParams
    // @param keeper the keeper executing the order
    // @param startingGas the starting gas
    function _executeOrder(
        bytes32 key,
        OracleUtils.SetPricesParams memory oracleParams,
        address keeper,
        uint256 startingGas
    ) external nonReentrant onlySelf {
        BaseOrderUtils.ExecuteOrderParams memory params = _getExecuteOrderParams(key, oracleParams, keeper, startingGas);
        // limit swaps require frozen order keeper as well since on creation it can fail due to output amount
        // which would automatically cause the order to be frozen
        // limit increase and decrease positions may fail due to output amount as well and become frozen
        // but only if their acceptablePrice is reached
        if (params.order.isFrozen() || params.order.orderType() == Order.OrderType.LimitSwap) {
            _validateFrozenOrderKeeper(keeper);
        }

        FeatureUtils.validateFeature(params.contracts.dataStore, Keys.executeOrderFeatureKey(address(this), uint256(params.order.orderType())));

        OrderUtils.executeOrder(params);
    }

    // @dev handle a caught order error
    // @param key the order's key
    // @param startingGas the starting gas
    // @param reason the error reason
    // @param reasonKey the hash or the error reason
    function _handleOrderError(
        bytes32 key,
        uint256 startingGas,
        bytes memory reason,
        bytes32 reasonKey
    ) internal {
        Order.Props memory order = OrderStoreUtils.get(dataStore, key);
        bool isMarketOrder = BaseOrderUtils.isMarketOrder(order.orderType());

        if (isMarketOrder) {
            OrderUtils.cancelOrder(
                dataStore,
                eventEmitter,
                orderVault,
                key,
                msg.sender,
                startingGas,
                reason
            );
        } else {
            if (reasonKey == Keys.UNACCEPTABLE_PRICE_ERROR_KEY) {
                revert(string(reason));
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
                orderVault,
                key,
                msg.sender,
                startingGas,
                reason
            );
        }
    }

    // @dev validate that the keeper is a frozen order keeper
    // @param keeper address of the keeper
    function _validateFrozenOrderKeeper(address keeper) internal view {
        require(roleStore.hasRole(keeper, Role.FROZEN_ORDER_KEEPER), Keys.FROZEN_ORDER_ERROR);
    }
}
