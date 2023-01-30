// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

library ReceiverUtils {
    error EmptyReceiver();

    function validateReceiver(address receiver) internal pure {
        if (receiver == address(0)) {
            revert EmptyReceiver();
        }
    }
}
