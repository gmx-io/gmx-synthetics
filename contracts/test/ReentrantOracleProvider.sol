// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../oracle/IOracleProvider.sol";
import "../oracle/OracleUtils.sol";

contract ReentrantOracleProvider is IOracleProvider {
    address public reenterTarget;
    bytes public reenterCalldata;
    uint256 public reenterValue;
    uint256 public reenterMaxDepth;
    bool public reenterBubbleRevert;

    uint256 public reenterDepth;
    bool public lastReenterSuccess;
    bytes public lastReenterResult;

    event ReenterAttempt(address indexed target, uint256 depth, bool success, bytes data);

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

    function getOraclePrice(
        address token,
        bytes memory /* data */
    ) external override returns (OracleUtils.ValidatedPrice memory) {
        _onExternalCall();

        return OracleUtils.ValidatedPrice({
            token: token,
            min: 1,
            max: 1,
            timestamp: block.timestamp,
            provider: address(this)
        });
    }

    function shouldAdjustTimestamp() external pure returns (bool) {
        return false;
    }

    function isChainlinkOnChainProvider() external pure returns (bool) {
        return true;
    }

    function _onExternalCall() internal {
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
        if (data.length == 0) revert("ReentrantOracleProvider: call failed");
        assembly {
            revert(add(data, 32), mload(data))
        }
    }
}
