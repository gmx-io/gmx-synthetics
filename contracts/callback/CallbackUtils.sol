// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";

import "./IOrderCallbackReceiver.sol";
import "./IDepositCallbackReceiver.sol";
import "./IWithdrawalCallbackReceiver.sol";

// half of the callbackGasLimit value is forwarded per call since
// both before and after functions would be called
library CallbackUtils {
    using Address for address;
    using Deposit for Deposit.Props;
    using Withdrawal for Withdrawal.Props;
    using Order for Order.Props;

    function beforeDepositExecution(bytes32 key, Deposit.Props memory deposit) internal {
        if (!isValidCallbackContract(deposit.callbackContract)) { return; }

        try IDepositCallbackReceiver(deposit.callbackContract).beforeDepositExecution{ gas: deposit.callbackGasLimit / 2 }(key, deposit) {
        } catch {}
    }

    function afterDepositExecution(bytes32 key, Deposit.Props memory deposit) internal {
        if (!isValidCallbackContract(deposit.callbackContract)) { return; }

        try IDepositCallbackReceiver(deposit.callbackContract).afterDepositExecution{ gas: deposit.callbackGasLimit / 2 }(key, deposit) {
        } catch {}
    }

    function afterDepositCancellation(bytes32 key, Deposit.Props memory deposit) internal {
        if (!isValidCallbackContract(deposit.callbackContract)) { return; }

        try IDepositCallbackReceiver(deposit.callbackContract).afterDepositCancellation{ gas: deposit.callbackGasLimit / 2 }(key, deposit) {
        } catch {}
    }

    function beforeWithdrawalExecution(bytes32 key, Withdrawal.Props memory withdrawal) internal {
        if (!isValidCallbackContract(withdrawal.callbackContract)) { return; }

        try IWithdrawalCallbackReceiver(withdrawal.callbackContract).beforeWithdrawalExecution{ gas: withdrawal.callbackGasLimit / 2 }(key, withdrawal) {
        } catch {}
    }

    function afterWithdrawalExecution(bytes32 key, Withdrawal.Props memory withdrawal) internal {
        if (!isValidCallbackContract(withdrawal.callbackContract)) { return; }

        try IWithdrawalCallbackReceiver(withdrawal.callbackContract).afterWithdrawalExecution{ gas: withdrawal.callbackGasLimit / 2 }(key, withdrawal) {
        } catch {}
    }

    function afterWithdrawalCancellation(bytes32 key, Withdrawal.Props memory withdrawal) internal {
        if (!isValidCallbackContract(withdrawal.callbackContract)) { return; }

        try IWithdrawalCallbackReceiver(withdrawal.callbackContract).afterWithdrawalCancellation{ gas: withdrawal.callbackGasLimit / 2 }(key, withdrawal) {
        } catch {}
    }

    function beforeOrderExecution(bytes32 key, Order.Props memory order) internal {
        if (!isValidCallbackContract(order.callbackContract())) { return; }

        try IOrderCallbackReceiver(order.callbackContract()).beforeOrderExecution{ gas: order.callbackGasLimit() / 2 }(key, order) {
        } catch {}
    }

    function afterOrderExecution(bytes32 key, Order.Props memory order) internal {
        if (!isValidCallbackContract(order.callbackContract())) { return; }

        try IOrderCallbackReceiver(order.callbackContract()).afterOrderExecution{ gas: order.callbackGasLimit() / 2 }(key, order) {
        } catch {}
    }

    function afterOrderCancellation(bytes32 key, Order.Props memory order) internal {
        if (!isValidCallbackContract(order.callbackContract())) { return; }

        try IOrderCallbackReceiver(order.callbackContract()).afterOrderCancellation{ gas: order.callbackGasLimit() / 2 }(key, order) {
        } catch {}
    }

    function afterOrderFrozen(bytes32 key, Order.Props memory order) internal {
        if (!isValidCallbackContract(order.callbackContract())) { return; }

        try IOrderCallbackReceiver(order.callbackContract()).afterOrderFrozen{ gas: order.callbackGasLimit() / 2 }(key, order) {
        } catch {}
    }

    function isValidCallbackContract(address callbackContract) internal view returns (bool) {
        if (callbackContract == address(0)) { return false; }
        if (!callbackContract.isContract()) { return false; }

        return true;
    }
}
