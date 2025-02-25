// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

/**
 * @title IMultichainProvider
 */
interface IMultichainProvider {
    function bridgeOut(
        address provider,
        address receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external;
}
