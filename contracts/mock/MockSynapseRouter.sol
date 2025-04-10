// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../utils/Precision.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockSynapseRouter {
    struct SwapQuery {
        address swapAdapter;
        address tokenOut;
        uint256 minAmountOut;
        uint256 deadline;
        bytes rawParams;
    }

    uint256 bridgeSlippageFactor;

    function setBridgeSlippageFactor(uint256 amount) external {
        bridgeSlippageFactor = amount;
    }

    function bridge(
        address to,
        uint256 chainId,
        address token,
        uint256 amount,
        SwapQuery memory /*originQuery*/,
        SwapQuery memory destQuery
    ) external payable {
        require(chainId != block.chainid, "Cannot bridge to Current Chain");
        uint256 bridgeAmount = Precision.applyFactor(amount, bridgeSlippageFactor);
        require(bridgeAmount >= destQuery.minAmountOut, "Insufficient Bridged Amount");

        uint256 balance = IERC20(token).balanceOf(msg.sender);
        uint256 allowance = IERC20(token).allowance(msg.sender, address(this));
        require(balance >= bridgeAmount, "Not enough balance");
        require(allowance >= bridgeAmount, "Not enough allowance");

        bool success = IERC20(token).transferFrom(msg.sender, to, bridgeAmount);
        require(success, "transferFrom returned false");
    }
}
