// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./IOrderCallbackReceiver.sol";
import "./IDepositCallbackReceiver.sol";
import "./IWithdrawalCallbackReceiver.sol";

library CallbackUtils {
    using Deposit for Deposit.Props;
    using Withdrawal for Withdrawal.Props;
    using Order for Order.Props;

    function handleCallback(bytes32 key, Deposit.Props memory deposit) internal {
        if (deposit.callbackContract == address(0)) { return; }

        try IDepositCallbackReceiver(deposit.callbackContract).depositExecuted{ gas: deposit.callbackGasLimit }(key, deposit) {
        } catch {}
    }

    function handleCallback(bytes32 key, Withdrawal.Props memory withdrawal) internal {
        if (withdrawal.callbackContract == address(0)) { return; }

        try IWithdrawalCallbackReceiver(withdrawal.callbackContract).withdrawalExecuted{ gas: withdrawal.callbackGasLimit }(key, withdrawal) {
        } catch {}
    }

    function handleCallback(bytes32 key, Order.Props memory order) internal {
        if (order.callbackContract() == address(0)) { return; }

        try IOrderCallbackReceiver(order.callbackContract()).orderExecuted{ gas: order.callbackGasLimit() }(key, order) {
        } catch {}
    }

}
