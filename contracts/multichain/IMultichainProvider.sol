// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

/**
 * @title IMultichainProvider
 */
interface IMultichainProvider {
    function bridgeOut(
        address _stargate,
        uint32 _dstEid,
        address account,
        address token,
        uint256 amount
    ) external;
}
