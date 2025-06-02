// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./AutoCancelUtils.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";

import "./Order.sol";
import "./OrderVault.sol";
import "./OrderStoreUtils.sol";
import "./OrderEventUtils.sol";

import "../nonce/NonceUtils.sol";
import "../event/EventEmitter.sol";

import "./BaseOrderUtils.sol";
import "./IBaseOrderUtils.sol";

import "../gas/GasUtils.sol";
import "../callback/CallbackUtils.sol";

import "../utils/Array.sol";
import "../utils/AccountUtils.sol";
import "../referral/ReferralUtils.sol";
import "../multichain/MultichainUtils.sol";
import "../position/PositionStoreUtils.sol";

// @title OrderUtils
// @dev Library for order functions
library OrderUtils {
    using Order for Order.Props;
    using Position for Position.Props;
    using Price for Price.Props;
    using Array for uint256[];

    struct CancelOrderParams {
        DataStore dataStore;
        EventEmitter eventEmitter;
        MultichainVault multichainVault;
        OrderVault orderVault;
        bytes32 key;
        address keeper;
        uint256 startingGas;
        bool isExternalCall;
        bool isAutoCancel;
        string reason;
        bytes reasonBytes;
    }

    struct CreateOrderCache {
        bool shouldRecordSeparateExecutionFeeTransfer;
        address wnt;
        uint256 initialCollateralDeltaAmount;
        uint256 estimatedGasLimit;
        uint256 oraclePriceCount;
        uint256 executionFeeDiff;
    }

    // @dev creates an order in the order store
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param orderVault OrderVault
    // @param referralStorage ReferralStorage
    // @param account the order account
    // @param srcChainId the source chain id
    // @param params IBaseOrderUtils.CreateOrderParams
    // @param shouldCapMaxExecutionFee whether to cap the max execution fee
    function createOrder(
        DataStore dataStore,
        EventEmitter eventEmitter,
        OrderVault orderVault,
        IReferralStorage referralStorage,
        address account,
        uint256 srcChainId,
        IBaseOrderUtils.CreateOrderParams memory params,
        bool shouldCapMaxExecutionFee
    ) external returns (bytes32) {
        AccountUtils.validateAccount(account);

        ReferralUtils.setTraderReferralCode(referralStorage, account, params.referralCode);

        CreateOrderCache memory cache;

        cache.wnt = TokenUtils.wnt(dataStore);
        cache.shouldRecordSeparateExecutionFeeTransfer = true;

        if (
            params.orderType == Order.OrderType.MarketSwap ||
            params.orderType == Order.OrderType.LimitSwap ||
            params.orderType == Order.OrderType.MarketIncrease ||
            params.orderType == Order.OrderType.LimitIncrease ||
            params.orderType == Order.OrderType.StopIncrease
        ) {
            // for swaps and increase orders, the initialCollateralDeltaAmount is set based on the amount of tokens
            // transferred to the orderVault
            cache.initialCollateralDeltaAmount = orderVault.recordTransferIn(params.addresses.initialCollateralToken);
            if (params.addresses.initialCollateralToken == cache.wnt) {
                if (cache.initialCollateralDeltaAmount < params.numbers.executionFee) {
                    revert Errors.InsufficientWntAmountForExecutionFee(
                        cache.initialCollateralDeltaAmount,
                        params.numbers.executionFee
                    );
                }
                cache.initialCollateralDeltaAmount -= params.numbers.executionFee;
                cache.shouldRecordSeparateExecutionFeeTransfer = false;
            }
        } else if (
            params.orderType == Order.OrderType.MarketDecrease ||
            params.orderType == Order.OrderType.LimitDecrease ||
            params.orderType == Order.OrderType.StopLossDecrease
        ) {
            // for decrease orders, the initialCollateralDeltaAmount is based on the passed in value
            cache.initialCollateralDeltaAmount = params.numbers.initialCollateralDeltaAmount;
        } else {
            revert Errors.OrderTypeCannotBeCreated(uint256(params.orderType));
        }

        if (cache.shouldRecordSeparateExecutionFeeTransfer) {
            uint256 wntAmount = orderVault.recordTransferIn(cache.wnt);
            if (wntAmount < params.numbers.executionFee) {
                revert Errors.InsufficientWntAmountForExecutionFee(wntAmount, params.numbers.executionFee);
            }

            params.numbers.executionFee = wntAmount;
        }

        if (Order.isPositionOrder(params.orderType)) {
            MarketUtils.validatePositionMarket(dataStore, params.addresses.market);
        } else {
            if (params.addresses.market != address(0)) {
                revert Errors.UnexpectedMarket();
            }
        }

        if (Order.isMarketOrder(params.orderType) && params.numbers.validFromTime != 0) {
            revert Errors.UnexpectedValidFromTime(uint256(params.orderType));
        }

        // validate swap path markets
        MarketUtils.validateSwapPath(dataStore, params.addresses.swapPath);

        Order.Props memory order;

        order.setAccount(account);
        order.setReceiver(params.addresses.receiver);
        order.setCancellationReceiver(params.addresses.cancellationReceiver);
        order.setCallbackContract(params.addresses.callbackContract);
        order.setMarket(params.addresses.market);
        order.setInitialCollateralToken(params.addresses.initialCollateralToken);
        order.setUiFeeReceiver(params.addresses.uiFeeReceiver);
        order.setSwapPath(params.addresses.swapPath);
        order.setOrderType(params.orderType);
        order.setDecreasePositionSwapType(params.decreasePositionSwapType);
        order.setSizeDeltaUsd(params.numbers.sizeDeltaUsd);
        order.setInitialCollateralDeltaAmount(cache.initialCollateralDeltaAmount);
        order.setTriggerPrice(params.numbers.triggerPrice);
        order.setAcceptablePrice(params.numbers.acceptablePrice);
        order.setCallbackGasLimit(params.numbers.callbackGasLimit);
        order.setMinOutputAmount(params.numbers.minOutputAmount);
        order.setValidFromTime(params.numbers.validFromTime);
        order.setSrcChainId(srcChainId);
        order.setIsLong(params.isLong);
        order.setShouldUnwrapNativeToken(params.shouldUnwrapNativeToken);
        order.setAutoCancel(params.autoCancel);
        order.setDataList(params.dataList);

        AccountUtils.validateReceiver(order.receiver());
        if (order.cancellationReceiver() == address(orderVault)) {
            // revert as funds cannot be sent back to the order vault
            revert Errors.InvalidReceiver(order.cancellationReceiver());
        }

        CallbackUtils.validateCallbackGasLimit(dataStore, order.callbackGasLimit());

        cache.estimatedGasLimit = GasUtils.estimateExecuteOrderGasLimit(dataStore, order);
        cache.oraclePriceCount = GasUtils.estimateOrderOraclePriceCount(params.addresses.swapPath.length);
        uint256 executionFee;
        (executionFee, cache.executionFeeDiff) = GasUtils.validateAndCapExecutionFee(
            dataStore,
            cache.estimatedGasLimit,
            params.numbers.executionFee,
            cache.oraclePriceCount,
            shouldCapMaxExecutionFee
        );
        order.setExecutionFee(executionFee);

        if (cache.executionFeeDiff != 0) {
            GasUtils.transferExcessiveExecutionFee(dataStore, eventEmitter, orderVault, order.account(), cache.executionFeeDiff);
        }

        bytes32 key = NonceUtils.getNextKey(dataStore);

        order.touch();

        BaseOrderUtils.validateNonEmptyOrder(order);
        OrderStoreUtils.set(dataStore, key, order);

        updateAutoCancelList(dataStore, key, order, order.autoCancel());
        validateTotalCallbackGasLimitForAutoCancelOrders(dataStore, order);

        _updatePositionLastSrcChainId(dataStore, order);

        OrderEventUtils.emitOrderCreated(eventEmitter, key, order);

        return key;
    }

    function _updatePositionLastSrcChainId(
        DataStore dataStore,
        Order.Props memory order
    ) private {
        bytes32 positionKey = Position.getPositionKey(order.account(), order.market(), order.initialCollateralToken(), order.isLong());
        Position.Props memory position = PositionStoreUtils.get(dataStore, positionKey);

        uint256 positionUpdatedAtTime = position.increasedAtTime() > position.decreasedAtTime()
            ? position.increasedAtTime()
            : position.decreasedAtTime();

        if (order.updatedAtTime() > positionUpdatedAtTime) {
            uint256 srcChainId = order.srcChainId();
            dataStore.setUint(Keys.positionLastSrcChainId(positionKey), srcChainId);
        }
    }

    struct CancelOrderCache {
        uint256 gas;
        uint256 minHandleExecutionErrorGas;
        address executionFeeReceiver;
    }

    function cancelOrder(CancelOrderParams memory params) public {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        if (params.isExternalCall) {
            params.startingGas -= gasleft() / 63;
        }

        CancelOrderCache memory cache;

        cache.gas = gasleft();
        cache.minHandleExecutionErrorGas = GasUtils.getMinHandleExecutionErrorGas(params.dataStore);

        if (cache.gas < cache.minHandleExecutionErrorGas) {
            if (params.isAutoCancel) {
                revert Errors.InsufficientGasForAutoCancellation(cache.gas, cache.minHandleExecutionErrorGas);
            } else {
                revert Errors.InsufficientGasForCancellation(cache.gas, cache.minHandleExecutionErrorGas);
            }
        }

        Order.Props memory order = OrderStoreUtils.get(params.dataStore, params.key);
        BaseOrderUtils.validateNonEmptyOrder(order);

        // this could happen if the order was created in new contracts that support new order types
        // but the order is being cancelled in old contracts
        if (!Order.isSupportedOrder(order.orderType())) {
            if (params.isAutoCancel) {
                revert Errors.UnsupportedOrderTypeForAutoCancellation(uint256(order.orderType()));
            } else {
                revert Errors.UnsupportedOrderType(uint256(order.orderType()));
            }
        }

        OrderStoreUtils.remove(params.dataStore, params.key, order.account());

        if (Order.isIncreaseOrder(order.orderType()) || Order.isSwapOrder(order.orderType())) {
            if (order.initialCollateralDeltaAmount() > 0) {
                address cancellationReceiver = order.cancellationReceiver();
                if (cancellationReceiver == address(0)) {
                    cancellationReceiver = order.account();
                }

                if (order.srcChainId() == 0) {
                    params.orderVault.transferOut(
                        order.initialCollateralToken(),
                        cancellationReceiver,
                        order.initialCollateralDeltaAmount(),
                        order.shouldUnwrapNativeToken()
                    );
                } else {
                    params.orderVault.transferOut(
                        order.initialCollateralToken(),
                        address(params.multichainVault), // receiver
                        order.initialCollateralDeltaAmount(),
                        false // shouldUnwrapNativeToken
                    );
                    MultichainUtils.recordTransferIn(
                        params.dataStore,
                        params.eventEmitter,
                        params.multichainVault,
                        order.initialCollateralToken(),
                        cancellationReceiver,
                        0 // srcChainId is the current block.chainId
                    );
                }
            }
        }

        updateAutoCancelList(params.dataStore, params.key, order, false);

        OrderEventUtils.emitOrderCancelled(
            params.eventEmitter,
            params.key,
            order.account(),
            params.reason,
            params.reasonBytes
        );

        address executionFeeReceiver = order.cancellationReceiver();

        if (executionFeeReceiver == address(0)) {
            executionFeeReceiver = order.receiver();
        }

        {
            EventUtils.EventLogData memory eventData;
            CallbackUtils.afterOrderCancellation(params.key, order, eventData);
        }

        GasUtils.payExecutionFee(
            GasUtils.PayExecutionFeeContracts(
                params.dataStore,
                params.eventEmitter,
                params.multichainVault,
                params.orderVault
            ),
            params.key,
            order.callbackContract(),
            order.executionFee(),
            params.startingGas,
            GasUtils.estimateOrderOraclePriceCount(order.swapPath().length),
            params.keeper,
            executionFeeReceiver,
            order.srcChainId()
        );
    }

    // @dev freezes an order
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param orderVault OrderVault
    // @param key the key of the order to freeze
    // @param keeper the keeper sending the transaction
    // @param startingGas the starting gas of the transaction
    // @param reason the reason the order was frozen
    function freezeOrder(
        DataStore dataStore,
        EventEmitter eventEmitter,
        MultichainVault multichainVault,
        OrderVault orderVault,
        bytes32 key,
        address keeper,
        uint256 startingGas,
        string memory reason,
        bytes memory reasonBytes
    ) external {
        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        startingGas -= gasleft() / 63;

        Order.Props memory order = OrderStoreUtils.get(dataStore, key);
        BaseOrderUtils.validateNonEmptyOrder(order);

        if (order.isFrozen()) {
            revert Errors.OrderAlreadyFrozen();
        }

        uint256 executionFee = order.executionFee();

        order.setExecutionFee(0);
        order.setIsFrozen(true);
        OrderStoreUtils.set(dataStore, key, order);

        OrderEventUtils.emitOrderFrozen(eventEmitter, key, order.account(), reason, reasonBytes);

        {
            EventUtils.EventLogData memory eventData;
            CallbackUtils.afterOrderFrozen(key, order, eventData);
        }

        GasUtils.payExecutionFee(
            GasUtils.PayExecutionFeeContracts(
                dataStore,
                eventEmitter,
                multichainVault,
                orderVault
            ),
            key,
            order.callbackContract(),
            executionFee,
            startingGas,
            GasUtils.estimateOrderOraclePriceCount(order.swapPath().length),
            keeper,
            order.receiver(),
            order.srcChainId()
        );
    }

    function clearAutoCancelOrders(
        DataStore dataStore,
        EventEmitter eventEmitter,
        MultichainVault multichainVault,
        OrderVault orderVault,
        bytes32 positionKey,
        address keeper
    ) internal {
        bytes32[] memory orderKeys = AutoCancelUtils.getAutoCancelOrderKeys(dataStore, positionKey);

        for (uint256 i; i < orderKeys.length; i++) {
            cancelOrder(
                CancelOrderParams(
                    dataStore,
                    eventEmitter,
                    multichainVault,
                    orderVault,
                    orderKeys[i],
                    keeper, // keeper
                    gasleft(), // startingGas
                    false, // isExternalCall
                    true, // isAutoCancel
                    "AUTO_CANCEL", // reason
                    "" // reasonBytes
                )
            );
        }
    }

    function updateAutoCancelList(
        DataStore dataStore,
        bytes32 orderKey,
        Order.Props memory order,
        bool shouldAdd
    ) internal {
        if (
            order.orderType() != Order.OrderType.LimitDecrease && order.orderType() != Order.OrderType.StopLossDecrease
        ) {
            return;
        }

        bytes32 positionKey = BaseOrderUtils.getPositionKey(order);

        if (shouldAdd) {
            AutoCancelUtils.addAutoCancelOrderKey(dataStore, positionKey, orderKey);
        } else {
            AutoCancelUtils.removeAutoCancelOrderKey(dataStore, positionKey, orderKey);
        }
    }

    function validateTotalCallbackGasLimitForAutoCancelOrders(
        DataStore dataStore,
        Order.Props memory order
    ) internal view {
        if (
            order.orderType() != Order.OrderType.LimitDecrease && order.orderType() != Order.OrderType.StopLossDecrease
        ) {
            return;
        }

        bytes32 positionKey = BaseOrderUtils.getPositionKey(order);
        uint256 maxTotal = dataStore.getUint(Keys.MAX_TOTAL_CALLBACK_GAS_LIMIT_FOR_AUTO_CANCEL_ORDERS);
        uint256 total = getTotalCallbackGasLimitForAutoCancelOrders(dataStore, positionKey);

        if (total > maxTotal) {
            revert Errors.MaxTotalCallbackGasLimitForAutoCancelOrdersExceeded(total, maxTotal);
        }
    }

    function getTotalCallbackGasLimitForAutoCancelOrders(
        DataStore dataStore,
        bytes32 positionKey
    ) internal view returns (uint256) {
        bytes32[] memory orderKeys = AutoCancelUtils.getAutoCancelOrderKeys(dataStore, positionKey);

        uint256 total;

        for (uint256 i; i < orderKeys.length; i++) {
            total += dataStore.getUint(keccak256(abi.encode(orderKeys[i], OrderStoreUtils.CALLBACK_GAS_LIMIT)));
        }

        return total;
    }
}
