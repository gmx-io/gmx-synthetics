// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MultichainRouter.sol";
import "../position/PositionStoreUtils.sol";

contract MultichainOrderRouter is MultichainRouter {
    using Order for Order.Props;
    using Position for Position.Props;

    constructor(
        BaseConstructorParams memory params
    ) MultichainRouter(params) BaseRouter(params.router, params.roleStore, params.dataStore, params.eventEmitter) {}

    function createOrder(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        uint256 collateralDeltaAmount,
        IBaseOrderUtils.CreateOrderParams memory params // can't use calldata because need to modify params.numbers.executionFee
    )
        external
        nonReentrant
        withOraclePricesForAtomicAction(relayParams.oracleParams)
        onlyGelatoRelay
        returns (bytes32)
    {
        _validateDesChainId(relayParams.desChainId);
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getCreateOrderStructHash(relayParams, collateralDeltaAmount, params);
        _validateCall(relayParams, account, structHash, srcChainId);

        return _createOrder(relayParams, account, collateralDeltaAmount, srcChainId, params, false);
    }

    function updateOrder(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 key,
        RelayUtils.UpdateOrderParams calldata params,
        bool increaseExecutionFee
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelay {
        _validateDesChainId(relayParams.desChainId);
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getUpdateOrderStructHash(relayParams, key, params, increaseExecutionFee);
        _validateCall(relayParams, account, structHash, srcChainId);

        _handleFeePayment(relayParams, account, srcChainId, key);

        _updateOrder(relayParams, account, key, params, increaseExecutionFee, false);
    }

    function cancelOrder(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 key
    ) external nonReentrant withOraclePricesForAtomicAction(relayParams.oracleParams) onlyGelatoRelay {
        _validateDesChainId(relayParams.desChainId);
        _validateGaslessFeature();

        bytes32 structHash = RelayUtils.getCancelOrderStructHash(relayParams, key);
        _validateCall(relayParams, account, structHash, srcChainId);

        _handleFeePayment(relayParams, account, srcChainId, key);

        _cancelOrder(relayParams, account, key, false /* isSubaccount */);
    }

    function _handleFeePayment(
        RelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 key
    ) internal {
        // check if user has sufficient Multichain balance to pay for fee
        uint256 balance = MultichainUtils.getMultichainBalanceAmount(dataStore, account, relayParams.fee.feeToken);
        if (balance >= relayParams.fee.feeAmount) {
            return;
        }

        Order.Props memory order = OrderStoreUtils.get(dataStore, key);
        bytes32 positionKey = Position.getPositionKey(
            order.account(),
            order.market(),
            order.initialCollateralToken(),
            order.isLong()
        );
        Position.Props memory position = PositionStoreUtils.get(dataStore, positionKey);

        if (relayParams.fee.feeToken != position.collateralToken()) {
            revert Errors.UnableToPayOrderFee();
        }

        uint256 unpaidAmount = relayParams.fee.feeAmount - balance;

        // First try to deduct from order collateral
        uint256 initialCollateralDeltaAmount = order.initialCollateralDeltaAmount();
        if (initialCollateralDeltaAmount > 0) {
            uint256 deductFromOrder = initialCollateralDeltaAmount > unpaidAmount
                ? unpaidAmount
                : initialCollateralDeltaAmount;

            unpaidAmount -= deductFromOrder;
            dataStore.setUint(
                keccak256(abi.encode(key, OrderStoreUtils.INITIAL_COLLATERAL_DELTA_AMOUNT)),
                initialCollateralDeltaAmount - deductFromOrder
            );
            orderVault.transferOut(relayParams.fee.feeToken, address(multichainVault), deductFromOrder);
            MultichainUtils.recordTransferIn(
                dataStore,
                eventEmitter,
                multichainVault,
                relayParams.fee.feeToken,
                account,
                srcChainId
            );

            if (unpaidAmount == 0) {
                return;
            }
        }

        // position collateral cannot be used for a swap order, since there is no position
        if (BaseOrderUtils.isSwapOrder(order.orderType())) {
            revert Errors.UnableToPayOrderFee();
        }

        // Second try to deduct from position collateral
        uint256 positionCollateralAmount = position.collateralAmount();
        if (positionCollateralAmount < unpaidAmount) {
            revert Errors.UnableToPayOrderFeeFromCollateral();
        }

        // if wasPositionCollateralUsedForExecutionFee is true, during order execution, and
        // if the order is cancelled or frozen, excess fees will be sent to the HOLDING_ADDRESS
        // instead of being refunded to the user, to prevent gaming by using the execution fee
        // to reduce collateral and such that negative pnl or other costs cannot be fully paid
        dataStore.setBool(Keys.wasPositionCollateralUsedForExecutionFeeKey(key), true);
        OrderEventUtils.emitPositionCollateralUsedForExecutionFee(
            eventEmitter,
            key,
            relayParams.fee.feeToken,
            unpaidAmount
        );

        position.setCollateralAmount(positionCollateralAmount - unpaidAmount);
        dataStore.setUint(keccak256(abi.encode(key, PositionStoreUtils.COLLATERAL_AMOUNT)), positionCollateralAmount);
        orderVault.transferOut(relayParams.fee.feeToken, address(multichainVault), unpaidAmount);
        MultichainUtils.recordTransferIn(
            dataStore,
            eventEmitter,
            multichainVault,
            relayParams.fee.feeToken,
            account,
            srcChainId
        );
    }
}
