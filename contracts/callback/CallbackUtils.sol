// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";

import "./IOrderCallbackReceiver.sol";
import "./IDepositCallbackReceiver.sol";
import "./IWithdrawalCallbackReceiver.sol";

// @title CallbackUtils
// @dev most features require a two step process to complete
// the user first sends a request transaction, then a second transaction is sent
// by a keeper to execute the request
//
// to allow for better composability with other contracts, a callback contract
// can be specified to be called after request executions or cancellations
//
// there are both before and after callbacks and half of the callbackGasLimit
// value is forwarded for each of these since both the before and after functions
// would be called
library CallbackUtils {
    using Address for address;
    using Deposit for Deposit.Props;
    using Withdrawal for Withdrawal.Props;
    using Order for Order.Props;

    // @dev called before a deposit execution
    // @param key the key of the deposit
    // @param deposit the deposit to be executed
    function beforeDepositExecution(bytes32 key, Deposit.Props memory deposit) internal {
        if (!isValidCallbackContract(deposit.callbackContract())) { return; }

        try IDepositCallbackReceiver(deposit.callbackContract()).beforeDepositExecution{ gas: deposit.callbackGasLimit() / 2 }(key, deposit) {
        } catch {}
    }

    // @dev called after a deposit execution
    // @param key the key of the deposit
    // @param deposit the deposit that was executed
    function afterDepositExecution(bytes32 key, Deposit.Props memory deposit) internal {
        if (!isValidCallbackContract(deposit.callbackContract())) { return; }

        try IDepositCallbackReceiver(deposit.callbackContract()).afterDepositExecution{ gas: deposit.callbackGasLimit() / 2 }(key, deposit) {
        } catch {}
    }

    // @dev called after a deposit cancellation
    // @param key the key of the deposit
    // @param deposit the deposit that was cancelled
    function afterDepositCancellation(bytes32 key, Deposit.Props memory deposit) internal {
        if (!isValidCallbackContract(deposit.callbackContract())) { return; }

        try IDepositCallbackReceiver(deposit.callbackContract()).afterDepositCancellation{ gas: deposit.callbackGasLimit() / 2 }(key, deposit) {
        } catch {}
    }

    // @dev called before a withdrawal execution
    // @param key the key of the withdrawal
    // @param withdrawal the withdrawal to be executed
    function beforeWithdrawalExecution(bytes32 key, Withdrawal.Props memory withdrawal) internal {
        if (!isValidCallbackContract(withdrawal.callbackContract)) { return; }

        try IWithdrawalCallbackReceiver(withdrawal.callbackContract).beforeWithdrawalExecution{ gas: withdrawal.callbackGasLimit / 2 }(key, withdrawal) {
        } catch {}
    }

    // @dev called after a withdrawal execution
    // @param key the key of the withdrawal
    // @param withdrawal the withdrawal that was executed
    function afterWithdrawalExecution(bytes32 key, Withdrawal.Props memory withdrawal) internal {
        if (!isValidCallbackContract(withdrawal.callbackContract)) { return; }

        try IWithdrawalCallbackReceiver(withdrawal.callbackContract).afterWithdrawalExecution{ gas: withdrawal.callbackGasLimit / 2 }(key, withdrawal) {
        } catch {}
    }

    // @dev called after a withdrawal cancellation
    // @param key the key of the withdrawal
    // @param withdrawal the withdrawal that was cancelled
    function afterWithdrawalCancellation(bytes32 key, Withdrawal.Props memory withdrawal) internal {
        if (!isValidCallbackContract(withdrawal.callbackContract)) { return; }

        try IWithdrawalCallbackReceiver(withdrawal.callbackContract).afterWithdrawalCancellation{ gas: withdrawal.callbackGasLimit / 2 }(key, withdrawal) {
        } catch {}
    }

    // @dev called before an order execution
    // @param key the key of the order
    // @param order the order to be executed
    function beforeOrderExecution(bytes32 key, Order.Props memory order) internal {
        if (!isValidCallbackContract(order.callbackContract())) { return; }

        try IOrderCallbackReceiver(order.callbackContract()).beforeOrderExecution{ gas: order.callbackGasLimit() / 2 }(key, order) {
        } catch {}
    }

    // @dev called after an order execution
    // @param key the key of the order
    // @param order the order that was executed
    function afterOrderExecution(bytes32 key, Order.Props memory order) internal {
        if (!isValidCallbackContract(order.callbackContract())) { return; }

        try IOrderCallbackReceiver(order.callbackContract()).afterOrderExecution{ gas: order.callbackGasLimit() / 2 }(key, order) {
        } catch {}
    }

    // @dev called after an order cancellation
    // @param key the key of the order
    // @param order the order that was cancelled
    function afterOrderCancellation(bytes32 key, Order.Props memory order) internal {
        if (!isValidCallbackContract(order.callbackContract())) { return; }

        try IOrderCallbackReceiver(order.callbackContract()).afterOrderCancellation{ gas: order.callbackGasLimit() / 2 }(key, order) {
        } catch {}
    }

    // @dev called after an order has been frozen, see OrderUtils.freezeOrder in OrderHandler for more info
    // @param key the key of the order
    // @param order the order that was frozen
    function afterOrderFrozen(bytes32 key, Order.Props memory order) internal {
        if (!isValidCallbackContract(order.callbackContract())) { return; }

        try IOrderCallbackReceiver(order.callbackContract()).afterOrderFrozen{ gas: order.callbackGasLimit() / 2 }(key, order) {
        } catch {}
    }

    // @dev validates that the given address is a contract
    // @param callbackContract the contract to call
    function isValidCallbackContract(address callbackContract) internal view returns (bool) {
        if (callbackContract == address(0)) { return false; }
        if (!callbackContract.isContract()) { return false; }

        return true;
    }
}
