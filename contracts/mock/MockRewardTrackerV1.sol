// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockRewardTrackerV1 {
    address public distributor;
    uint256 public totalSupply;

    constructor(address _distributor) {
        distributor = _distributor;
    }

    function setTotalSupply(uint256 supply) external {
        totalSupply = supply;
    }
}
