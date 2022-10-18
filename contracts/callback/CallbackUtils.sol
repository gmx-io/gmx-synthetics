// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";

import "./IOrderCallbackReceiver.sol";
import "./IDepositCallbackReceiver.sol";
import "./IWithdrawalCallbackReceiver.sol";

library CallbackUtils {
    using Address for address;
    using Deposit for Deposit.Props;
    using Withdrawal for Withdrawal.Props;
    using Order for Order.Props;

    function handleExecution(bytes32 key, Deposit.Props memory deposit) internal {
        if (!isValidCallbackContract(deposit.callbackContract)) { return; }

        try IDepositCallbackReceiver(deposit.callbackContract).depositExecuted{ gas: deposit.callbackGasLimit }(key, deposit) {
        } catch {}
    }

    function handleCancellation(bytes32 key, Deposit.Props memory deposit) internal {
        if (!isValidCallbackContract(deposit.callbackContract)) { return; }

        try IDepositCallbackReceiver(deposit.callbackContract).depositCancelled{ gas: deposit.callbackGasLimit }(key, deposit) {
        } catch {}
    }

    function handleExecution(bytes32 key, Withdrawal.Props memory withdrawal) internal {
        if (!isValidCallbackContract(withdrawal.callbackContract)) { return; }

        try IWithdrawalCallbackReceiver(withdrawal.callbackContract).withdrawalExecuted{ gas: withdrawal.callbackGasLimit }(key, withdrawal) {
        } catch {}
    }

    function handleCancellation(bytes32 key, Withdrawal.Props memory withdrawal) internal {
        if (!isValidCallbackContract(withdrawal.callbackContract)) { return; }

        try IWithdrawalCallbackReceiver(withdrawal.callbackContract).withdrawalCancelled{ gas: withdrawal.callbackGasLimit }(key, withdrawal) {
        } catch {}
    }

    function handleExecution(bytes32 key, Order.Props memory order) internal {
        if (!isValidCallbackContract(order.callbackContract())) { return; }

        try IOrderCallbackReceiver(order.callbackContract()).orderExecuted{ gas: order.callbackGasLimit() }(key, order) {
        } catch {}
    }

    function handleCancellation(bytes32 key, Order.Props memory order) internal {
        if (!isValidCallbackContract(order.callbackContract())) { return; }

        try IOrderCallbackReceiver(order.callbackContract()).orderCancelled{ gas: order.callbackGasLimit() }(key, order) {
        } catch {}
    }

    function isValidCallbackContract(address callbackContract) internal view returns (bool) {
        if (callbackContract == address(0)) { return false; }
        if (!callbackContract.isContract()) { return false; }

        return true;
    }
}
