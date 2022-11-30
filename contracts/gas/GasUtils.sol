// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../utils/Precision.sol";

import "../deposit/Deposit.sol";
import "../withdrawal/Withdrawal.sol";
import "../order/Order.sol";
import "../order/OrderBaseUtils.sol";

import "../bank/StrictBank.sol";

library GasUtils {
    using Order for Order.Props;

    event KeeperExecutionFee(address keeper, uint256 amount);
    event UserRefundFee(address keeper, uint256 amount);

    error InsufficientExecutionFee(uint256 minExecutionFee, uint256 executionFee);

    function payExecutionFee(
        DataStore dataStore,
        StrictBank bank,
        uint256 executionFee,
        uint256 startingGas,
        address keeper,
        address user
    ) external {
        address wnt = TokenUtils.wnt(dataStore);
        bank.transferOut(dataStore, wnt, executionFee, address(this));
        IWNT(wnt).withdraw(executionFee);

        uint256 gasUsed = startingGas - gasleft();
        uint256 executionFeeForKeeper = adjustGasLimit(dataStore, gasUsed) * tx.gasprice;

        if (executionFeeForKeeper > executionFee) {
            executionFeeForKeeper = executionFee;
        }

        TokenUtils.transferNativeToken(
            dataStore,
            keeper,
            executionFeeForKeeper
        );

        emit KeeperExecutionFee(keeper, executionFeeForKeeper);

        uint256 refundFeeForUser = executionFee - executionFeeForKeeper;
        if (refundFeeForUser == 0) {
            return;
        }

        TokenUtils.transferNativeToken(
            dataStore,
            user,
            refundFeeForUser
        );

        emit UserRefundFee(user, refundFeeForUser);
    }

    function validateExecutionFee(DataStore dataStore, uint256 estimatedGasLimit, uint256 executionFee) internal view {
        uint256 gasLimit = adjustGasLimitForEstimate(dataStore, estimatedGasLimit);
        uint256 minExecutionFee = gasLimit * tx.gasprice;
        if (executionFee < minExecutionFee) {
            revert InsufficientExecutionFee(minExecutionFee, executionFee);
        }
    }

    function adjustGasLimit(DataStore dataStore, uint256 estimatedGasLimit) internal view returns (uint256) {
        uint256 baseGasLimit = dataStore.getUint(Keys.EXECUTION_FEE_BASE_GAS_LIMIT);
        uint256 multiplierFactor = dataStore.getUint(Keys.EXECUTION_FEE_MULTIPLIER_FACTOR);
        uint256 gasLimit = baseGasLimit + Precision.applyFactor(estimatedGasLimit, multiplierFactor);
        return gasLimit;
    }

    function adjustGasLimitForEstimate(DataStore dataStore, uint256 estimatedGasLimit) internal view returns (uint256) {
        uint256 baseGasLimit = dataStore.getUint(Keys.ESTIMATED_FEE_BASE_GAS_LIMIT);
        uint256 multiplierFactor = dataStore.getUint(Keys.ESTIMATED_FEE_MULTIPLIER_FACTOR);
        uint256 gasLimit = baseGasLimit + Precision.applyFactor(estimatedGasLimit, multiplierFactor);
        return gasLimit;
    }

    function estimateExecuteDepositGasLimit(DataStore dataStore, Deposit.Props memory deposit) internal view returns (uint256) {
        if (deposit.longTokenAmount == 0 || deposit.shortTokenAmount == 0) {
            return dataStore.getUint(Keys.depositGasLimitKey(true)) + deposit.callbackGasLimit;
        }

        return dataStore.getUint(Keys.depositGasLimitKey(false)) + deposit.callbackGasLimit;
    }

    function estimateExecuteWithdrawalGasLimit(DataStore dataStore, Withdrawal.Props memory withdrawal) internal view returns (uint256) {
        if (withdrawal.marketTokensLongAmount == 0 || withdrawal.marketTokensShortAmount == 0) {
            return dataStore.getUint(Keys.withdrawalGasLimitKey(true)) + withdrawal.callbackGasLimit;
        }

        return dataStore.getUint(Keys.withdrawalGasLimitKey(false)) + withdrawal.callbackGasLimit;
    }

    function estimateExecuteOrderGasLimit(DataStore dataStore, Order.Props memory order) internal view returns (uint256) {
        if (OrderBaseUtils.isIncreaseOrder(order.orderType())) {
            return estimateExecuteIncreaseOrderGasLimit(dataStore, order);
        }

        if (OrderBaseUtils.isDecreaseOrder(order.orderType())) {
            return estimateExecuteDecreaseOrderGasLimit(dataStore, order);
        }

        if (OrderBaseUtils.isSwapOrder(order.orderType())) {
            return estimateExecuteSwapOrderGasLimit(dataStore, order);
        }

        OrderBaseUtils.revertUnsupportedOrderType();
    }

    function estimateExecuteIncreaseOrderGasLimit(DataStore dataStore, Order.Props memory order) internal view returns (uint256) {
        uint256 gasPerSwap = dataStore.getUint(Keys.singleSwapGasLimitKey());
        return dataStore.getUint(Keys.increaseOrderGasLimitKey()) + gasPerSwap * order.swapPath().length + order.callbackGasLimit();
    }

    function estimateExecuteDecreaseOrderGasLimit(DataStore dataStore, Order.Props memory order) internal view returns (uint256) {
        uint256 gasPerSwap = dataStore.getUint(Keys.singleSwapGasLimitKey());
        return dataStore.getUint(Keys.decreaseOrderGasLimitKey()) + gasPerSwap * order.swapPath().length + order.callbackGasLimit();
    }

    function estimateExecuteSwapOrderGasLimit(DataStore dataStore, Order.Props memory order) internal view returns (uint256) {
        uint256 gasPerSwap = dataStore.getUint(Keys.singleSwapGasLimitKey());
        return dataStore.getUint(Keys.swapOrderGasLimitKey()) + gasPerSwap * order.swapPath().length + order.callbackGasLimit();
    }
}
