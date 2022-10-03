// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../utils/Precision.sol";

import "../deposit/Deposit.sol";
import "../withdrawal/Withdrawal.sol";
import "../order/Order.sol";
import "../order/OrderUtils.sol";

import "../bank/StrictBank.sol";
import "../eth/EthUtils.sol";
import "../eth/IWETH.sol";

library GasUtils {
    using Order for Order.Props;

    event KeeperExecutionFee(address keeper, uint256 amount);
    event UserRefundFee(address keeper, uint256 amount, bool success);

    error InsufficientExecutionFee(uint256 minExecutionFee, uint256 executionFee);

    function payExecutionFee(
        DataStore dataStore,
        StrictBank bank,
        uint256 executionFee,
        uint256 startingGas,
        address keeper,
        address user
    ) external {
        address weth = EthUtils.weth(dataStore);
        bank.transferOut(weth, executionFee, address(this));
        IWETH(weth).withdraw(executionFee);

        uint256 gasUsed = startingGas - gasleft();
        uint256 executionFeeForKeeper = adjustGasLimit(dataStore, gasUsed) * tx.gasprice;

        if (executionFeeForKeeper > executionFee) {
            executionFeeForKeeper = executionFee;
        }

        payable(keeper).transfer(executionFeeForKeeper);
        emit KeeperExecutionFee(keeper, executionFeeForKeeper);

        uint256 refundFeeForUser = executionFee - executionFeeForKeeper;
        if (refundFeeForUser == 0) {
            return;
        }

        // it is possible to force a transaction to fail by having the user
        // be a contract and modifying the receive function
        // this can cause front-running issues, due to that `send` is used instead
        //  of `transfer` so that the transaction will not revert
        bool success = payable(user).send(refundFeeForUser);
        emit UserRefundFee(user, refundFeeForUser, success);
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
            return dataStore.getUint(Keys.depositGasLimitKey(true));
        }

        return dataStore.getUint(Keys.depositGasLimitKey(false));
    }

    function estimateExecuteWithdrawalGasLimit(DataStore dataStore, Withdrawal.Props memory withdrawal) internal view returns (uint256) {
        if (withdrawal.marketTokensLongAmount == 0 || withdrawal.marketTokensShortAmount == 0) {
            return dataStore.getUint(Keys.withdrawalGasLimitKey(true));
        }

        return dataStore.getUint(Keys.withdrawalGasLimitKey(false));
    }

    function estimateExecuteOrderGasLimit(DataStore dataStore, Order.Props memory order) internal view returns (uint256) {
        if (OrderUtils.isIncreaseOrder(order.orderType())) {
            return estimateExecuteIncreaseOrderGasLimit(dataStore, order);
        }

        if (OrderUtils.isDecreaseOrder(order.orderType())) {
            return estimateExecuteDecreaseOrderGasLimit(dataStore, order);
        }

        if (OrderUtils.isSwapOrder(order.orderType())) {
            return estimateExecuteSwapOrderGasLimit(dataStore, order);
        }

        OrderUtils.revertUnsupportedOrderType();
    }

    function estimateExecuteIncreaseOrderGasLimit(DataStore dataStore, Order.Props memory order) internal view returns (uint256) {
        uint256 gasPerSwap = dataStore.getUint(Keys.singleSwapGasLimitKey());
        return dataStore.getUint(Keys.increaseOrderGasLimitKey()) + gasPerSwap * order.swapPath().length;
    }

    function estimateExecuteDecreaseOrderGasLimit(DataStore dataStore, Order.Props memory order) internal view returns (uint256) {
        uint256 gasPerSwap = dataStore.getUint(Keys.singleSwapGasLimitKey());
        return dataStore.getUint(Keys.decreaseOrderGasLimitKey()) + gasPerSwap * order.swapPath().length;
    }

    function estimateExecuteSwapOrderGasLimit(DataStore dataStore, Order.Props memory order) internal view returns (uint256) {
        uint256 gasPerSwap = dataStore.getUint(Keys.singleSwapGasLimitKey());
        return dataStore.getUint(Keys.swapOrderGasLimitKey()) + gasPerSwap * order.swapPath().length;
    }
}
