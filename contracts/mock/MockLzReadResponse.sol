// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

contract MockLzReadResponse {
    mapping(bytes32 => uint256) public uintValues;
    mapping(address => uint256) public withdrawableAmounts;
    uint256 public totalSupply;

    function setUint(bytes32 key, uint256 value) external {
        uintValues[key] = value;
    }

    function setTotalSupply(uint256 supply) external {
        totalSupply = supply;
    }

    function getUint(bytes32 key) external view returns (uint256) {
        return uintValues[key];
    }

    function setWithdrawableAmount(address token, uint256 amount) external {
        withdrawableAmounts[token] = amount;
    }

    function withdrawableAmount(address token) external view returns (uint256) {
        return withdrawableAmounts[token];
    }
}
