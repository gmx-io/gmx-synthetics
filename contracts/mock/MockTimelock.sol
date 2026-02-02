// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract MockTimelock {
    function signalSetHandler(address /* _target */, address /* _handler */, bool /* _isActive */) external pure {
    }

    function setHandler(address /* _target */, address /* _handler */, bool /* _isActive */) external pure {
    }

    function setKeeper(address /* _keeper */, bool /* _isActive */) external pure {
    }

    function multicall(bytes[] calldata /* data */) external pure returns (bytes[] memory results) {
    }
}
