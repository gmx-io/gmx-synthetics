// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";

import "./IOrderCallbackReceiver.sol";
import "./IDepositCallbackReceiver.sol";
import "./IWithdrawalCallbackReceiver.sol";
import "./IShiftCallbackReceiver.sol";
import "./IGasFeeCallbackReceiver.sol";
import "./IGlvDepositCallbackReceiver.sol";
import "./IGlvWithdrawalCallbackReceiver.sol";

// @title CallbackUtils
// @dev most features require a two step process to complete
// the user first sends a request transaction, then a second transaction is sent
// by a keeper to execute the request
//
// to allow for better composability with other contracts, a callback contract
// can be specified to be called after request executions or cancellations
//
// in case it is necessary to add "before" callbacks, extra care should be taken
// to ensure that important state cannot be changed during the before callback
// for example, if an order can be cancelled in the "before" callback during
// order execution, it may lead to an order being executed even though the user
// was already refunded for its cancellation
//
// the details from callback errors are not processed to avoid cases where a malicious
// callback contract returns a very large value to cause transactions to run out of gas
library CallbackUtils {
    using Address for address;
    using Deposit for Deposit.Props;
    using Withdrawal for Withdrawal.Props;
    using Shift for Shift.Props;
    using Order for Order.Props;
    using GlvDeposit for GlvDeposit.Props;
    using GlvWithdrawal for GlvWithdrawal.Props;

    event AfterDepositExecutionError(bytes32 key, Deposit.Props deposit);
    event AfterDepositCancellationError(bytes32 key, Deposit.Props deposit);

    event AfterWithdrawalExecutionError(bytes32 key, Withdrawal.Props withdrawal);
    event AfterWithdrawalCancellationError(bytes32 key, Withdrawal.Props withdrawal);

    event AfterShiftExecutionError(bytes32 key, Shift.Props shift);
    event AfterShiftCancellationError(bytes32 key, Shift.Props shift);

    event AfterOrderExecutionError(bytes32 key, Order.Props order);
    event AfterOrderCancellationError(bytes32 key, Order.Props order);
    event AfterOrderFrozenError(bytes32 key, Order.Props order);

    event AfterGlvDepositExecutionError(bytes32 key, GlvDeposit.Props glvDeposit);
    event AfterGlvDepositCancellationError(bytes32 key, GlvDeposit.Props glvDeposit);
    event AfterGlvWithdrawalExecutionError(bytes32 key, GlvWithdrawal.Props glvWithdrawal);
    event AfterGlvWithdrawalCancellationError(bytes32 key, GlvWithdrawal.Props glvWithdrawal);

    // @dev validate that the callbackGasLimit is less than the max specified value
    // this is to prevent callback gas limits which are larger than the max gas limits per block
    // as this would allow for callback contracts that can consume all gas and conditionally cause
    // executions to fail
    // @param dataStore DataStore
    // @param callbackGasLimit the callback gas limit
    function validateCallbackGasLimit(DataStore dataStore, uint256 callbackGasLimit) internal view {
        uint256 maxCallbackGasLimit = dataStore.getUint(Keys.MAX_CALLBACK_GAS_LIMIT);
        if (callbackGasLimit > maxCallbackGasLimit) {
            revert Errors.MaxCallbackGasLimitExceeded(callbackGasLimit, maxCallbackGasLimit);
        }
    }

    function validateGasLeftForCallback(uint256 callbackGasLimit) internal view {
        uint256 gasToBeForwarded = gasleft() / 64 * 63;
        if (gasToBeForwarded < callbackGasLimit) {
            revert Errors.InsufficientGasLeftForCallback(gasToBeForwarded, callbackGasLimit);
        }
    }

    function setSavedCallbackContract(DataStore dataStore, address account, address market, address callbackContract) external {
        dataStore.setAddress(Keys.savedCallbackContract(account, market), callbackContract);
    }

    function getSavedCallbackContract(DataStore dataStore, address account, address market) internal view returns (address) {
        return dataStore.getAddress(Keys.savedCallbackContract(account, market));
    }

    function refundExecutionFee(
        DataStore dataStore,
        bytes32 key,
        address callbackContract,
        uint256 refundFeeAmount,
        EventUtils.EventLogData memory eventData
    ) internal returns (bool) {
        if (!isValidCallbackContract(callbackContract)) { return false; }

        uint256 gasLimit = dataStore.getUint(Keys.REFUND_EXECUTION_FEE_GAS_LIMIT);

        validateGasLeftForCallback(gasLimit);

        try IGasFeeCallbackReceiver(callbackContract).refundExecutionFee{ gas: gasLimit, value: refundFeeAmount }(
            key,
            eventData
        ) {
            return true;
        } catch {
            return false;
        }
    }

    // @dev called after a deposit execution
    // @param key the key of the deposit
    // @param deposit the deposit that was executed
    function afterDepositExecution(
        bytes32 key,
        Deposit.Props memory deposit,
        EventUtils.EventLogData memory eventData
    ) internal {
        if (!isValidCallbackContract(deposit.callbackContract())) { return; }

        validateGasLeftForCallback(deposit.callbackGasLimit());

        try IDepositCallbackReceiver(deposit.callbackContract()).afterDepositExecution{ gas: deposit.callbackGasLimit() }(
            key,
            deposit,
            eventData
        ) {
        } catch {
            emit AfterDepositExecutionError(key, deposit);
        }
    }

    // @dev called after a deposit cancellation
    // @param key the key of the deposit
    // @param deposit the deposit that was cancelled
    function afterDepositCancellation(
        bytes32 key,
        Deposit.Props memory deposit,
        EventUtils.EventLogData memory eventData
    ) internal {
        if (!isValidCallbackContract(deposit.callbackContract())) { return; }

        validateGasLeftForCallback(deposit.callbackGasLimit());

        try IDepositCallbackReceiver(deposit.callbackContract()).afterDepositCancellation{ gas: deposit.callbackGasLimit() }(
            key,
            deposit,
            eventData
        ) {
        } catch {
            emit AfterDepositCancellationError(key, deposit);
        }
    }

    // @dev called after a withdrawal execution
    // @param key the key of the withdrawal
    // @param withdrawal the withdrawal that was executed
    function afterWithdrawalExecution(
        bytes32 key,
        Withdrawal.Props memory withdrawal,
        EventUtils.EventLogData memory eventData
    ) internal {
        if (!isValidCallbackContract(withdrawal.callbackContract())) { return; }

        validateGasLeftForCallback(withdrawal.callbackGasLimit());

        try IWithdrawalCallbackReceiver(withdrawal.callbackContract()).afterWithdrawalExecution{ gas: withdrawal.callbackGasLimit() }(
            key,
            withdrawal,
            eventData
        ) {
        } catch {
            emit AfterWithdrawalExecutionError(key, withdrawal);
        }
    }

    // @dev called after a withdrawal cancellation
    // @param key the key of the withdrawal
    // @param withdrawal the withdrawal that was cancelled
    function afterWithdrawalCancellation(
        bytes32 key,
        Withdrawal.Props memory withdrawal,
        EventUtils.EventLogData memory eventData
    ) internal {
        if (!isValidCallbackContract(withdrawal.callbackContract())) { return; }

        validateGasLeftForCallback(withdrawal.callbackGasLimit());

        try IWithdrawalCallbackReceiver(withdrawal.callbackContract()).afterWithdrawalCancellation{ gas: withdrawal.callbackGasLimit() }(
            key,
            withdrawal,
            eventData
        ) {
        } catch {
            emit AfterWithdrawalCancellationError(key, withdrawal);
        }
    }

    function afterShiftExecution(
        bytes32 key,
        Shift.Props memory shift,
        EventUtils.EventLogData memory eventData
    ) internal {
        if (!isValidCallbackContract(shift.callbackContract())) { return; }

        validateGasLeftForCallback(shift.callbackGasLimit());

        try IShiftCallbackReceiver(shift.callbackContract()).afterShiftExecution{ gas: shift.callbackGasLimit() }(
            key,
            shift,
            eventData
        ) {
        } catch {
            emit AfterShiftExecutionError(key, shift);
        }
    }
    function afterShiftCancellation(
        bytes32 key,
        Shift.Props memory shift,
        EventUtils.EventLogData memory eventData
    ) internal {
        if (!isValidCallbackContract(shift.callbackContract())) { return; }

        validateGasLeftForCallback(shift.callbackGasLimit());

        try IShiftCallbackReceiver(shift.callbackContract()).afterShiftCancellation{ gas: shift.callbackGasLimit() }(
            key,
            shift,
            eventData
        ) {
        } catch {
            emit AfterShiftCancellationError(key, shift);
        }
    }

    // @dev called after an order execution
    // note that the order.size, order.initialCollateralDeltaAmount and other
    // properties may be updated during execution, the new values may not be
    // updated in the order object for the callback
    // @param key the key of the order
    // @param order the order that was executed
    function afterOrderExecution(
        bytes32 key,
        Order.Props memory order,
        EventUtils.EventLogData memory eventData
    ) internal {
        if (!isValidCallbackContract(order.callbackContract())) { return; }

        validateGasLeftForCallback(order.callbackGasLimit());

        try IOrderCallbackReceiver(order.callbackContract()).afterOrderExecution{ gas: order.callbackGasLimit() }(
            key,
            order,
            eventData
        ) {
        } catch {
            emit AfterOrderExecutionError(key, order);
        }
    }

    // @dev called after an order cancellation
    // @param key the key of the order
    // @param order the order that was cancelled
    function afterOrderCancellation(
        bytes32 key,
        Order.Props memory order,
        EventUtils.EventLogData memory eventData
    ) internal {
        if (!isValidCallbackContract(order.callbackContract())) { return; }

        validateGasLeftForCallback(order.callbackGasLimit());

        try IOrderCallbackReceiver(order.callbackContract()).afterOrderCancellation{ gas: order.callbackGasLimit() }(
            key,
            order,
            eventData
        ) {
        } catch {
            emit AfterOrderCancellationError(key, order);
        }
    }

    // @dev called after an order has been frozen, see OrderUtils.freezeOrder in OrderHandler for more info
    // @param key the key of the order
    // @param order the order that was frozen
    function afterOrderFrozen(
        bytes32 key,
        Order.Props memory order,
        EventUtils.EventLogData memory eventData
    ) internal {
        if (!isValidCallbackContract(order.callbackContract())) { return; }

        validateGasLeftForCallback(order.callbackGasLimit());

        try IOrderCallbackReceiver(order.callbackContract()).afterOrderFrozen{ gas: order.callbackGasLimit() }(
            key,
            order,
            eventData
        ) {
        } catch {
            emit AfterOrderFrozenError(key, order);
        }
    }

    // @dev called after a glvDeposit execution
    // @param key the key of the glvDeposit
    // @param glvDeposit the glvDeposit that was executed
    function afterGlvDepositExecution(
        bytes32 key,
        GlvDeposit.Props memory glvDeposit,
        EventUtils.EventLogData memory eventData
    ) internal {
        if (!isValidCallbackContract(glvDeposit.callbackContract())) {
            return;
        }

        validateGasLeftForCallback(glvDeposit.callbackGasLimit());

        try IGlvDepositCallbackReceiver(glvDeposit.callbackContract()).afterGlvDepositExecution{ gas: glvDeposit.callbackGasLimit() }(
            key,
            glvDeposit,
            eventData
        ) {
        } catch {
            emit AfterGlvDepositExecutionError(key, glvDeposit);
        }
    }

    // @dev called after a glvDeposit cancellation
    // @param key the key of the glvDeposit
    // @param glvDeposit the glvDeposit that was cancelled
    function afterGlvDepositCancellation(
        bytes32 key,
        GlvDeposit.Props memory glvDeposit,
        EventUtils.EventLogData memory eventData
    ) internal {
        if (!isValidCallbackContract(glvDeposit.callbackContract())) { return; }

        validateGasLeftForCallback(glvDeposit.callbackGasLimit());

        try IGlvDepositCallbackReceiver(glvDeposit.callbackContract()).afterGlvDepositCancellation{ gas: glvDeposit.callbackGasLimit() }(
            key,
            glvDeposit,
            eventData
        ) {
        } catch {
            emit AfterGlvDepositCancellationError(key, glvDeposit);
        }
    }

    // @dev called after a glvWithdrawal execution
    // @param key the key of the glvWithdrawal
    // @param glvWithdrawal the glvWithdrawal that was executed
    function afterGlvWithdrawalExecution(
        bytes32 key,
        GlvWithdrawal.Props memory glvWithdrawal,
        EventUtils.EventLogData memory eventData
    ) internal {
        if (!isValidCallbackContract(glvWithdrawal.callbackContract())) { return; }

        validateGasLeftForCallback(glvWithdrawal.callbackGasLimit());

        try IGlvWithdrawalCallbackReceiver(glvWithdrawal.callbackContract()).afterGlvWithdrawalExecution{ gas: glvWithdrawal.callbackGasLimit() }(
            key,
            glvWithdrawal,
            eventData
        ) {
        } catch {
            emit AfterGlvWithdrawalExecutionError(key, glvWithdrawal);
        }
    }

    // @dev called after a glvWithdrawal cancellation
    // @param key the key of the glvWithdrawal
    // @param glvWithdrawal the glvWithdrawal that was cancelled
    function afterGlvWithdrawalCancellation(
        bytes32 key,
        GlvWithdrawal.Props memory glvWithdrawal,
        EventUtils.EventLogData memory eventData
    ) internal {
        if (!isValidCallbackContract(glvWithdrawal.callbackContract())) { return; }

        validateGasLeftForCallback(glvWithdrawal.callbackGasLimit());

        try IGlvWithdrawalCallbackReceiver(glvWithdrawal.callbackContract()).afterGlvWithdrawalCancellation{ gas: glvWithdrawal.callbackGasLimit() }(
            key,
            glvWithdrawal,
            eventData
        ) {
        } catch {
            emit AfterGlvWithdrawalCancellationError(key, glvWithdrawal);
        }
    }

    // @dev validates that the given address is a contract
    // @param callbackContract the contract to call
    function isValidCallbackContract(address callbackContract) internal view returns (bool) {
        if (callbackContract == address(0)) { return false; }
        if (!callbackContract.isContract()) { return false; }

        return true;
    }
}
