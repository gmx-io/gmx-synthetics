// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

/**
 * @title IMultichainProvider
 */
interface IMultichainProvider {
    function bridgeOut(
        address provider,
        address account,
        address token,
        uint256 amount,
        uint256 srcChainId,
        bytes calldata data
    ) external;
}
