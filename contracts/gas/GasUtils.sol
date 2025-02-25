// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../callback/CallbackUtils.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../utils/Precision.sol";

import "../deposit/Deposit.sol";
import "../withdrawal/Withdrawal.sol";
import "../shift/Shift.sol";
import "../order/Order.sol";
import "../order/BaseOrderUtils.sol";
import "../glv/glvWithdrawal/GlvWithdrawal.sol";

import "../bank/StrictBank.sol";

// @title GasUtils
// @dev Library for execution fee estimation and payments
library GasUtils {
    using Deposit for Deposit.Props;
    using Withdrawal for Withdrawal.Props;
    using Shift for Shift.Props;
    using Order for Order.Props;
    using GlvDeposit for GlvDeposit.Props;
    using GlvWithdrawal for GlvWithdrawal.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    // @param keeper address of the keeper
    // @param amount the amount of execution fee received
    event KeeperExecutionFee(address keeper, uint256 amount);
    // @param user address of the user
    // @param amount the amount of execution fee refunded
    event UserRefundFee(address user, uint256 amount);

    function getMinHandleExecutionErrorGas(DataStore dataStore) internal view returns (uint256) {
        return dataStore.getUint(Keys.MIN_HANDLE_EXECUTION_ERROR_GAS);
    }

    function getMinHandleExecutionErrorGasToForward(DataStore dataStore) internal view returns (uint256) {
        return dataStore.getUint(Keys.MIN_HANDLE_EXECUTION_ERROR_GAS_TO_FORWARD);
    }

    function getMinAdditionalGasForExecution(DataStore dataStore) internal view returns (uint256) {
        return dataStore.getUint(Keys.MIN_ADDITIONAL_GAS_FOR_EXECUTION);
    }

    function getExecutionGas(DataStore dataStore, uint256 startingGas) external view returns (uint256) {
        uint256 minHandleExecutionErrorGasToForward = getMinHandleExecutionErrorGasToForward(dataStore);
        if (startingGas < minHandleExecutionErrorGasToForward) {
            revert Errors.InsufficientExecutionGasForErrorHandling(startingGas, minHandleExecutionErrorGasToForward);
        }

        return startingGas - minHandleExecutionErrorGasToForward;
    }

    function validateExecutionGas(DataStore dataStore, uint256 startingGas, uint256 estimatedGasLimit) external view {
        uint256 minAdditionalGasForExecution = getMinAdditionalGasForExecution(dataStore);
        if (startingGas < estimatedGasLimit + minAdditionalGasForExecution) {
            revert Errors.InsufficientExecutionGas(startingGas, estimatedGasLimit, minAdditionalGasForExecution);
        }
    }

    // a minimum amount of gas is required to be left for cancellation
    // to prevent potential blocking of cancellations by malicious contracts using e.g. large revert reasons
    //
    // during the estimateGas call by keepers, an insufficient amount of gas may be estimated
    // the amount estimated may be insufficient for execution but sufficient for cancellaton
    // this could lead to invalid cancellations due to insufficient gas used by keepers
    //
    // to help prevent this, out of gas errors are attempted to be caught and reverted for estimateGas calls
    //
    // a malicious user could cause the estimateGas call of a keeper to fail, in which case the keeper could
    // still attempt to execute the transaction with a reasonable gas limit
    function validateExecutionErrorGas(DataStore dataStore, bytes memory reasonBytes) external view {
        // skip the validation if the execution did not fail due to an out of gas error
        // also skip the validation if this is not invoked in an estimateGas call (tx.origin != address(0))
        if (reasonBytes.length != 0 || tx.origin != address(0)) {
            return;
        }

        uint256 gas = gasleft();
        uint256 minHandleExecutionErrorGas = getMinHandleExecutionErrorGas(dataStore);

        if (gas < minHandleExecutionErrorGas) {
            revert Errors.InsufficientHandleExecutionErrorGas(gas, minHandleExecutionErrorGas);
        }
    }

    struct PayExecutionFeeCache {
        uint256 refundFeeAmount;
        bool refundWasSent;
    }

    // @dev pay the keeper the execution fee and refund any excess amount
    //
    // @param dataStore DataStore
    // @param bank the StrictBank contract holding the execution fee
    // @param executionFee the executionFee amount
    // @param startingGas the starting gas
    // @param oraclePriceCount number of oracle prices
    // @param keeper the keeper to pay
    // @param refundReceiver the account that should receive any excess gas refunds
    // @param isSubaccount whether the order is a subaccount order
    function payExecutionFee(
        DataStore dataStore,
        EventEmitter eventEmitter,
        StrictBank bank,
        bytes32 key,
        address callbackContract,
        uint256 executionFee,
        uint256 startingGas,
        uint256 oraclePriceCount,
        address keeper,
        address refundReceiver
    ) external {
        if (executionFee == 0) {
            return;
        }

        // 63/64 gas is forwarded to external calls, reduce the startingGas to account for this
        startingGas -= gasleft() / 63;
        uint256 gasUsed = startingGas - gasleft();

        // each external call forwards 63/64 of the remaining gas
        uint256 executionFeeForKeeper = adjustGasUsage(dataStore, gasUsed, oraclePriceCount) * tx.gasprice;

        if (executionFeeForKeeper > executionFee) {
            executionFeeForKeeper = executionFee;
        }

        bank.transferOutNativeToken(keeper, executionFeeForKeeper);

        emitKeeperExecutionFee(eventEmitter, keeper, executionFeeForKeeper);

        PayExecutionFeeCache memory cache;

        cache.refundFeeAmount = executionFee - executionFeeForKeeper;
        if (cache.refundFeeAmount == 0) {
            return;
        }

        address _wnt = dataStore.getAddress(Keys.WNT);
        bank.transferOut(_wnt, address(this), cache.refundFeeAmount);

        IWNT(_wnt).withdraw(cache.refundFeeAmount);

        EventUtils.EventLogData memory eventData;

        cache.refundWasSent = CallbackUtils.refundExecutionFee(
            dataStore,
            key,
            callbackContract,
            cache.refundFeeAmount,
            eventData
        );

        if (cache.refundWasSent) {
            emitExecutionFeeRefundCallback(eventEmitter, callbackContract, cache.refundFeeAmount);
        } else {
            TokenUtils.sendNativeToken(dataStore, refundReceiver, cache.refundFeeAmount);
            emitExecutionFeeRefund(eventEmitter, refundReceiver, cache.refundFeeAmount);
        }
    }

    // @dev validate that the provided executionFee is sufficient based on the estimatedGasLimit
    // @param dataStore DataStore
    // @param estimatedGasLimit the estimated gas limit
    // @param executionFee the execution fee provided
    // @param oraclePriceCount
    function validateExecutionFee(
        DataStore dataStore,
        uint256 estimatedGasLimit,
        uint256 executionFee,
        uint256 oraclePriceCount
    ) internal view returns (uint256, uint256) {
        uint256 gasLimit = adjustGasLimitForEstimate(dataStore, estimatedGasLimit, oraclePriceCount);
        uint256 minExecutionFee = gasLimit * tx.gasprice;
        if (executionFee < minExecutionFee) {
            revert Errors.InsufficientExecutionFee(minExecutionFee, executionFee);
        }
        return (gasLimit, minExecutionFee);
    }

    // @dev validate that the provided executionFee is sufficient based on the estimatedGasLimit
    // @param dataStore DataStore
    // @param estimatedGasLimit the estimated gas limit
    // @param executionFee the execution fee provided
    // @param oraclePriceCount
    // @param shouldCapMaxExecutionFee whether to cap the max execution fee
    function validateAndCapExecutionFee(
        DataStore dataStore,
        uint256 estimatedGasLimit,
        uint256 executionFee,
        uint256 oraclePriceCount,
        bool shouldCapMaxExecutionFee
    ) internal view returns (uint256, uint256) {
        (uint256 gasLimit, uint256 minExecutionFee) = GasUtils.validateExecutionFee(dataStore, estimatedGasLimit, executionFee, oraclePriceCount);

        if (!shouldCapMaxExecutionFee) {
            return (executionFee, 0);
        }
        // a malicious subaccount could provide a large executionFee
        // and receive most of it as a refund sent to a callbackContract
        // capping the max execution fee by multiplier * gasLimit * basefee should limit the potential loss

        // this capping should be applied for subaccount orders with a callbackContract if execution fee is increased
        // i.e. there is no need to cap the max execution fee for previously created orders even if it's high because it has already been capped

        // some blockchains may not support EIP-1559 and will return 0 for block.basefee
        // also block.basefee is 0 inside eth_call and eth_estimateGas
        uint256 basefee = block.basefee != 0 ? block.basefee : tx.gasprice;

        uint256 maxExecutionFeeMultiplierFactor = dataStore.getUint(Keys.MAX_EXECUTION_FEE_MULTIPLIER_FACTOR);
        uint256 maxExecutionFee = Precision.applyFactor(gasLimit * basefee, maxExecutionFeeMultiplierFactor);

        if (maxExecutionFee < minExecutionFee) {
            revert Errors.InvalidExecutionFee(executionFee, minExecutionFee, maxExecutionFee);
        }

        if (executionFee <= maxExecutionFee) {
            return (executionFee, 0);
        }

        uint256 executionFeeDiff = executionFee - maxExecutionFee;
        return (maxExecutionFee, executionFeeDiff);
    }

    function transferExcessiveExecutionFee(DataStore dataStore, EventEmitter eventEmitter, Bank bank, address account, uint256 executionFeeDiff) external {
        address wnt = TokenUtils.wnt(dataStore);
        address holdingAddress = dataStore.getAddress(Keys.HOLDING_ADDRESS);
        bank.transferOut(wnt, holdingAddress, executionFeeDiff);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "account", account);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "executionFeeDiff", executionFeeDiff);

        eventEmitter.emitEventLog1("ExcessiveExecutionFee", Cast.toBytes32(account), eventData);
    }

    // @dev adjust the gas usage to pay a small amount to keepers
    // @param dataStore DataStore
    // @param gasUsed the amount of gas used
    // @param oraclePriceCount number of oracle prices
    function adjustGasUsage(
        DataStore dataStore,
        uint256 gasUsed,
        uint256 oraclePriceCount
    ) internal view returns (uint256) {
        // gas measurements are done after the call to withOraclePrices
        // withOraclePrices may consume a significant amount of gas
        // the baseGasLimit used to calculate the execution cost
        // should be adjusted to account for this
        // additionally, a transaction could fail midway through an execution transaction
        // before being cancelled, the possibility of this additional gas cost should
        // be considered when setting the baseGasLimit
        uint256 baseGasLimit = dataStore.getUint(Keys.EXECUTION_GAS_FEE_BASE_AMOUNT_V2_1);
        baseGasLimit += dataStore.getUint(Keys.EXECUTION_GAS_FEE_PER_ORACLE_PRICE) * oraclePriceCount;
        // the gas cost is estimated based on the gasprice of the request txn
        // the actual cost may be higher if the gasprice is higher in the execution txn
        // the multiplierFactor should be adjusted to account for this
        uint256 multiplierFactor = dataStore.getUint(Keys.EXECUTION_GAS_FEE_MULTIPLIER_FACTOR);
        uint256 gasLimit = baseGasLimit + Precision.applyFactor(gasUsed, multiplierFactor);
        return gasLimit;
    }

    // @dev adjust the estimated gas limit to help ensure the execution fee is sufficient during
    // the actual execution
    // @param dataStore DataStore
    // @param estimatedGasLimit the estimated gas limit
    function adjustGasLimitForEstimate(
        DataStore dataStore,
        uint256 estimatedGasLimit,
        uint256 oraclePriceCount
    ) internal view returns (uint256) {
        uint256 baseGasLimit = dataStore.getUint(Keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1);
        baseGasLimit += dataStore.getUint(Keys.ESTIMATED_GAS_FEE_PER_ORACLE_PRICE) * oraclePriceCount;
        uint256 multiplierFactor = dataStore.getUint(Keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR);
        uint256 gasLimit = baseGasLimit + Precision.applyFactor(estimatedGasLimit, multiplierFactor);
        return gasLimit;
    }

    // @dev get estimated number of oracle prices for deposit
    // @param swapsCount number of swaps in the deposit
    function estimateDepositOraclePriceCount(uint256 swapsCount) internal pure returns (uint256) {
        return 3 + swapsCount;
    }

    // @dev get estimated number of oracle prices for withdrawal
    // @param swapsCount number of swaps in the withdrawal
    function estimateWithdrawalOraclePriceCount(uint256 swapsCount) external pure returns (uint256) {
        return 3 + swapsCount;
    }

    // @dev get estimated number of oracle prices for order
    // @param swapsCount number of swaps in the order
    function estimateOrderOraclePriceCount(uint256 swapsCount) external pure returns (uint256) {
        return 3 + swapsCount;
    }

    // @dev get estimated number of oracle prices for shift
    function estimateShiftOraclePriceCount() external pure returns (uint256) {
        // for single asset markets only 3 prices will be required
        // and keeper will slightly overpay
        // it should not be an issue because execution fee goes back to keeper
        return 4;
    }

    function estimateGlvDepositOraclePriceCount(
        uint256 marketCount,
        uint256 swapsCount
    ) external pure returns (uint256) {
        // for single asset markets oracle price count will be overestimated by 1
        // it should not be an issue for GLV with multiple markets
        // because relative difference would be insignificant
        return 2 + marketCount + swapsCount;
    }

    function estimateGlvWithdrawalOraclePriceCount(
        uint256 marketCount,
        uint256 swapsCount
    ) internal pure returns (uint256) {
        // for single asset markets oracle price count will be overestimated by 1
        // it should not be an issue for GLV with multiple markets
        // because relative difference would be insignificant
        return 2 + marketCount + swapsCount;
    }

    // @dev the estimated gas limit for deposits
    // @param dataStore DataStore
    // @param deposit the deposit to estimate the gas limit for
    function estimateExecuteDepositGasLimit(
        DataStore dataStore,
        Deposit.Props memory deposit
    ) internal view returns (uint256) {
        uint256 gasPerSwap = dataStore.getUint(Keys.singleSwapGasLimitKey());
        uint256 swapCount = deposit.longTokenSwapPath().length + deposit.shortTokenSwapPath().length;
        uint256 gasForSwaps = swapCount * gasPerSwap;

        return dataStore.getUint(Keys.depositGasLimitKey()) + deposit.callbackGasLimit() + gasForSwaps;
    }

    // @dev the estimated gas limit for withdrawals
    // @param dataStore DataStore
    // @param withdrawal the withdrawal to estimate the gas limit for
    function estimateExecuteWithdrawalGasLimit(
        DataStore dataStore,
        Withdrawal.Props memory withdrawal
    ) external view returns (uint256) {
        uint256 gasPerSwap = dataStore.getUint(Keys.singleSwapGasLimitKey());
        uint256 swapCount = withdrawal.longTokenSwapPath().length + withdrawal.shortTokenSwapPath().length;
        uint256 gasForSwaps = swapCount * gasPerSwap;

        return dataStore.getUint(Keys.withdrawalGasLimitKey()) + withdrawal.callbackGasLimit() + gasForSwaps;
    }

    // @dev the estimated gas limit for shifts
    // @param dataStore DataStore
    // @param shift the shift to estimate the gas limit for
    function estimateExecuteShiftGasLimit(
        DataStore dataStore,
        Shift.Props memory shift
    ) external view returns (uint256) {
        return dataStore.getUint(Keys.shiftGasLimitKey()) + shift.callbackGasLimit();
    }

    // @dev the estimated gas limit for orders
    // @param dataStore DataStore
    // @param order the order to estimate the gas limit for
    function estimateExecuteOrderGasLimit(
        DataStore dataStore,
        Order.Props memory order
    ) external view returns (uint256) {
        if (BaseOrderUtils.isIncreaseOrder(order.orderType())) {
            return estimateExecuteIncreaseOrderGasLimit(dataStore, order);
        }

        if (BaseOrderUtils.isDecreaseOrder(order.orderType())) {
            return estimateExecuteDecreaseOrderGasLimit(dataStore, order);
        }

        if (BaseOrderUtils.isSwapOrder(order.orderType())) {
            return estimateExecuteSwapOrderGasLimit(dataStore, order);
        }

        revert Errors.UnsupportedOrderType(uint256(order.orderType()));
    }

    // @dev the estimated gas limit for increase orders
    // @param dataStore DataStore
    // @param order the order to estimate the gas limit for
    function estimateExecuteIncreaseOrderGasLimit(
        DataStore dataStore,
        Order.Props memory order
    ) internal view returns (uint256) {
        uint256 gasPerSwap = dataStore.getUint(Keys.singleSwapGasLimitKey());
        return
            dataStore.getUint(Keys.increaseOrderGasLimitKey()) +
            gasPerSwap *
            order.swapPath().length +
            order.callbackGasLimit();
    }

    // @dev the estimated gas limit for decrease orders
    // @param dataStore DataStore
    // @param order the order to estimate the gas limit for
    function estimateExecuteDecreaseOrderGasLimit(
        DataStore dataStore,
        Order.Props memory order
    ) internal view returns (uint256) {
        uint256 gasPerSwap = dataStore.getUint(Keys.singleSwapGasLimitKey());
        uint256 swapCount = order.swapPath().length;
        if (order.decreasePositionSwapType() != Order.DecreasePositionSwapType.NoSwap) {
            swapCount += 1;
        }

        return dataStore.getUint(Keys.decreaseOrderGasLimitKey()) + gasPerSwap * swapCount + order.callbackGasLimit();
    }

    // @dev the estimated gas limit for swap orders
    // @param dataStore DataStore
    // @param order the order to estimate the gas limit for
    function estimateExecuteSwapOrderGasLimit(
        DataStore dataStore,
        Order.Props memory order
    ) internal view returns (uint256) {
        uint256 gasPerSwap = dataStore.getUint(Keys.singleSwapGasLimitKey());
        return
            dataStore.getUint(Keys.swapOrderGasLimitKey()) +
            gasPerSwap *
            order.swapPath().length +
            order.callbackGasLimit();
    }

    // @dev the estimated gas limit for glv deposits
    // @param dataStore DataStore
    // @param deposit the deposit to estimate the gas limit for
    function estimateExecuteGlvDepositGasLimit(
        DataStore dataStore,
        GlvDeposit.Props memory glvDeposit,
        uint256 marketCount
    ) external view returns (uint256) {
        // glv deposit execution gas consumption depends on the amount of markets
        uint256 gasPerGlvPerMarket = dataStore.getUint(Keys.glvPerMarketGasLimitKey());
        uint256 gasForGlvMarkets = gasPerGlvPerMarket * marketCount;
        uint256 glvDepositGasLimit = dataStore.getUint(Keys.glvDepositGasLimitKey());

        uint256 gasLimit = glvDepositGasLimit + glvDeposit.callbackGasLimit() + gasForGlvMarkets;

        if (glvDeposit.isMarketTokenDeposit()) {
            // user provided GM, no separate deposit will be created and executed in this case
            return gasLimit;
        }

        uint256 gasPerSwap = dataStore.getUint(Keys.singleSwapGasLimitKey());
        uint256 swapCount = glvDeposit.longTokenSwapPath().length + glvDeposit.shortTokenSwapPath().length;
        uint256 gasForSwaps = swapCount * gasPerSwap;

        return gasLimit + dataStore.getUint(Keys.depositGasLimitKey()) + gasForSwaps;
    }

    // @dev the estimated gas limit for glv withdrawals
    // @param dataStore DataStore
    // @param withdrawal the withdrawal to estimate the gas limit for
    function estimateExecuteGlvWithdrawalGasLimit(
        DataStore dataStore,
        GlvWithdrawal.Props memory glvWithdrawal,
        uint256 marketCount
    ) internal view returns (uint256) {
        // glv withdrawal execution gas consumption depends on the amount of markets
        uint256 gasPerGlvPerMarket = dataStore.getUint(Keys.glvPerMarketGasLimitKey());
        uint256 gasForGlvMarkets = gasPerGlvPerMarket * marketCount;
        uint256 glvWithdrawalGasLimit = dataStore.getUint(Keys.glvWithdrawalGasLimitKey());

        uint256 gasLimit = glvWithdrawalGasLimit + glvWithdrawal.callbackGasLimit() + gasForGlvMarkets;

        uint256 gasPerSwap = dataStore.getUint(Keys.singleSwapGasLimitKey());
        uint256 swapCount = glvWithdrawal.longTokenSwapPath().length + glvWithdrawal.shortTokenSwapPath().length;
        uint256 gasForSwaps = swapCount * gasPerSwap;

        return gasLimit + dataStore.getUint(Keys.withdrawalGasLimitKey()) + gasForSwaps;
    }

    function estimateExecuteGlvShiftGasLimit(DataStore dataStore) external view returns (uint256) {
        return dataStore.getUint(Keys.glvShiftGasLimitKey());
    }

    function emitKeeperExecutionFee(EventEmitter eventEmitter, address keeper, uint256 executionFeeAmount) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "keeper", keeper);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "executionFeeAmount", executionFeeAmount);

        eventEmitter.emitEventLog1("KeeperExecutionFee", Cast.toBytes32(keeper), eventData);
    }

    function emitExecutionFeeRefund(EventEmitter eventEmitter, address receiver, uint256 refundFeeAmount) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "receiver", receiver);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "refundFeeAmount", refundFeeAmount);

        eventEmitter.emitEventLog1("ExecutionFeeRefund", Cast.toBytes32(receiver), eventData);
    }

    function emitExecutionFeeRefundCallback(
        EventEmitter eventEmitter,
        address callbackContract,
        uint256 refundFeeAmount
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "callbackContract", callbackContract);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "refundFeeAmount", refundFeeAmount);

        eventEmitter.emitEventLog1("ExecutionFeeRefundCallback", Cast.toBytes32(callbackContract), eventData);
    }
}
