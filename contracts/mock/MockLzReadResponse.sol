// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

contract MockLzReadResponse {
    mapping(bytes32 => uint256) public uintValues;
    uint256 mockSupply;

    function setUint(bytes32 key, uint256 value) external {
        uintValues[key] = value;
    }

    function setMockSupply(uint256 supply) external {
        mockSupply = supply;
    }

    function getUint(bytes32 key) external view returns (uint256) {
        return uintValues[key];
    }

    function totalSupply() external view returns (uint256) {
        return mockSupply;
    }
}
