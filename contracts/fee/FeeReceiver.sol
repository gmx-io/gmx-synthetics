// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

contract FeeReceiver {
    event FeeReceived(bytes32 key, address token, uint256 amount);

    function notifyFeeReceived(bytes32 key, address token, uint256 amount) external {
        emit FeeReceived(key, token, amount);
    }
}
