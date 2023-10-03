// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../migration/IGlpRewardRouter.sol";

contract MockGlpRewardRouter is IGlpRewardRouter {
    function unstakeAndRedeemGlp(
        address _tokenOut,
        uint256 /* _glpAmount */,
        uint256 _minOut,
        address _receiver
    ) external returns (uint256) {
        IERC20(_tokenOut).transfer(_receiver, _minOut);
        return _minOut;
    }
}
