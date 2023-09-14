// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IGlpRewardRouter {
    function unstakeAndRedeemGlp(address _tokenOut, uint256 _glpAmount, uint256 _minOut, address _receiver) external returns (uint256);
}
