// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../order/OrderStoreUtils.sol";
import "../order/BaseOrderUtils.sol";
import "../position/PositionUtils.sol";
import "../position/PositionStoreUtils.sol";
import "../referral/IReferralStorage.sol";
import "../router/relay/IRelayUtils.sol";

import "./MultichainVault.sol";
import "./MultichainUtils.sol";

library MultichainOrderRouterUtils {
    using Order for Order.Props;
    using Position for Position.Props;
    using SafeCast for uint256;

    struct TransferFeeFromOrderOrPositionContracts {
        DataStore dataStore;
        EventEmitter eventEmitter;
        MultichainVault multichainVault;
        IOracle oracle;
        IReferralStorage referralStorage;
        OrderVault orderVault;
    }

    struct TransferFeeFromOrderOrPositionCache {
        uint256 unpaidAmount;
        uint256 deductFromOrder;
        uint256 positionCollateralAmount;
        Market.Props market;
        MarketUtils.MarketPrices prices;
        bytes32 positionKey;
    }

    function transferFeeFromOrderOrPosition(
        TransferFeeFromOrderOrPositionContracts memory contracts,
        IRelayUtils.RelayParams calldata relayParams,
        address account,
        uint256 srcChainId,
        bytes32 key
    ) external {
        // check if user has sufficient Multichain balance to pay for fee
        uint256 balance = MultichainUtils.getMultichainBalanceAmount(
            contracts.dataStore,
            account,
            relayParams.fee.feeToken
        );
        if (balance >= relayParams.fee.feeAmount) {
            return;
        }

        Order.Props memory order = OrderStoreUtils.get(contracts.dataStore, key);

        TransferFeeFromOrderOrPositionCache memory cache;

        cache.unpaidAmount = relayParams.fee.feeAmount - balance;

        // First try to deduct from order collateral
        // only increase and swap orders have collateral deposited at creation time and can use initialCollateralAmount to pay for the fee
        if (
            order.initialCollateralToken() == relayParams.fee.feeToken &&
            (BaseOrderUtils.isIncreaseOrder(order.orderType()) || BaseOrderUtils.isSwapOrder(order.orderType()))
        ) {
            uint256 initialCollateralDeltaAmount = order.initialCollateralDeltaAmount();
            if (initialCollateralDeltaAmount > 0) {
                uint256 deductFromOrder = initialCollateralDeltaAmount > cache.unpaidAmount
                    ? cache.unpaidAmount
                    : initialCollateralDeltaAmount;

                cache.unpaidAmount -= deductFromOrder;
                contracts.dataStore.setUint(
                    keccak256(abi.encode(key, OrderStoreUtils.INITIAL_COLLATERAL_DELTA_AMOUNT)),
                    initialCollateralDeltaAmount - deductFromOrder
                );
                contracts.orderVault.transferOut(
                    relayParams.fee.feeToken,
                    address(contracts.multichainVault),
                    deductFromOrder
                );
                MultichainUtils.recordTransferIn(
                    contracts.dataStore,
                    contracts.eventEmitter,
                    contracts.multichainVault,
                    relayParams.fee.feeToken,
                    account,
                    srcChainId
                );

                if (cache.unpaidAmount == 0) {
                    return;
                }
            }
        }

        // Second try to deduct from position collateral
        // position collateral cannot be used for a swap order, since there is no position
        if (BaseOrderUtils.isSwapOrder(order.orderType())) {
            revert Errors.UnableToPayOrderFee();
        }

        cache.positionKey = Position.getPositionKey(
            order.account(),
            order.market(),
            order.initialCollateralToken(),
            order.isLong()
        );
        Position.Props memory position = PositionStoreUtils.get(contracts.dataStore, cache.positionKey);

        if (relayParams.fee.feeToken != position.collateralToken()) {
            revert Errors.UnableToPayOrderFee();
        }

        cache.positionCollateralAmount = position.collateralAmount();
        if (cache.positionCollateralAmount < cache.unpaidAmount) {
            revert Errors.UnableToPayOrderFeeFromCollateral();
        }

        position.setCollateralAmount(cache.positionCollateralAmount - cache.unpaidAmount);
        contracts.dataStore.setUint(
            keccak256(abi.encode(cache.positionKey, PositionStoreUtils.COLLATERAL_AMOUNT)),
            cache.positionCollateralAmount - cache.unpaidAmount
        );

        cache.market = MarketStoreUtils.get(contracts.dataStore, order.market());
        cache.prices = MarketUtils.getMarketPrices(
            contracts.oracle,
            MarketStoreUtils.get(contracts.dataStore, order.market())
        );

        MarketUtils.applyDeltaToCollateralSum(
            contracts.dataStore,
            contracts.eventEmitter,
            position.market(),
            position.collateralToken(),
            position.isLong(),
            cache.unpaidAmount.toInt256() // delta
        );

        PositionUtils.updateFundingAndBorrowingState(
            contracts.dataStore,
            contracts.eventEmitter,
            cache.market,
            cache.prices
        );

        PositionUtils.validatePosition(
            contracts.dataStore,
            contracts.referralStorage,
            position,
            cache.market,
            cache.prices,
            contracts.dataStore.getUint((Keys.ADDITIONAL_ATOMIC_MIN_COLLATERAL_FACTOR)),
            true, // shouldValidateMinPositionSize
            true // shouldValidateMinCollateralUsd
        );

        MarketToken(payable(order.market())).transferOut(
            relayParams.fee.feeToken,
            address(contracts.multichainVault),
            cache.unpaidAmount,
            false // shouldUnwrapNativeToken
        );
        MultichainUtils.recordTransferIn(
            contracts.dataStore,
            contracts.eventEmitter,
            contracts.multichainVault,
            relayParams.fee.feeToken,
            account,
            srcChainId
        );
    }
}
