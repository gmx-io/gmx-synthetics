// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

struct SwapQuery {
    address swapAdapter;
    address tokenOut;
    uint256 minAmountOut;
    uint256 deadline;
    bytes rawParams;
}

interface ISynapseRouter {
    function bridge(
        address to,
        uint256 chainId,
        address token,
        uint256 amount,
        SwapQuery memory originQuery,
        SwapQuery memory destQuery
    ) external payable;
}
