// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../mock/MintableToken.sol";

contract ReentrantToken is MintableToken {
    address public reenterTarget;
    bytes public reenterCalldata;
    uint256 public reenterValue;
    uint256 public reenterMaxDepth;
    bool public reenterBubbleRevert;

    uint256 public reenterDepth;
    bool public lastReenterSuccess;
    bytes public lastReenterResult;

    event ReenterAttempt(address indexed target, uint256 depth, bool success, bytes data);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) MintableToken(name_, symbol_, decimals_) {}

    function setReenterConfig(
        address _target,
        bytes calldata _calldata,
        uint256 _value,
        uint256 _maxDepth,
        bool _bubbleRevert
    ) external {
        reenterTarget = _target;
        reenterCalldata = _calldata;
        reenterValue = _value;
        reenterMaxDepth = _maxDepth;
        reenterBubbleRevert = _bubbleRevert;

        reenterDepth = 0;
        lastReenterSuccess = false;
        delete lastReenterResult;
    }

    function clearReenterConfig() external {
        reenterTarget = address(0);
        delete reenterCalldata;
        reenterValue = 0;
        reenterMaxDepth = 0;
        reenterBubbleRevert = false;

        reenterDepth = 0;
        lastReenterSuccess = false;
        delete lastReenterResult;
    }

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        super._afterTokenTransfer(from, to, amount);
        if (from == address(0) || to == address(0)) {
            return;
        }
        _onTransfer();
    }

    function _onTransfer() internal {
        if (reenterTarget == address(0) || reenterDepth >= reenterMaxDepth) return;

        reenterDepth++;
        (bool success, bytes memory result) = reenterTarget.call{ value: reenterValue }(reenterCalldata);

        lastReenterSuccess = success;
        lastReenterResult = result;
        emit ReenterAttempt(reenterTarget, reenterDepth, success, result);

        if (!success && reenterBubbleRevert) {
            _revertWith(result);
        }
    }

    function _revertWith(bytes memory data) internal pure {
        if (data.length == 0) revert("ReentrantToken: call failed");
        assembly {
            revert(add(data, 32), mload(data))
        }
    }
}
