// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../role/RoleModule.sol";

contract DataStore is RoleModule {
    mapping(bytes32 => uint256) public uintValues;
    mapping(bytes32 => int256) public intValues;
    mapping(bytes32 => address) public addressValues;
    mapping(bytes32 => bytes32) public dataValues;
    mapping(bytes32 => bool) public boolValues;

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function getUint(bytes32 key) external view returns (uint256) {
        return uintValues[key];
    }

    function setUint(bytes32 key, uint256 value) external onlyController returns (uint256) {
        uintValues[key] = value;
        return value;
    }

    function incrementUint(bytes32 key, uint256 value) external onlyController returns (uint256) {
        uint256 nextUint = uintValues[key] + value;
        uintValues[key] = nextUint;
        return nextUint;
    }

    function decrementUint(bytes32 key, uint256 value) external onlyController returns (uint256) {
        uint256 nextUint = uintValues[key] - value;
        uintValues[key] = nextUint;
        return nextUint;
    }

    function getInt(bytes32 key) external view returns (int256) {
        return intValues[key];
    }

    function setInt(bytes32 key, int256 value) external onlyController returns (int256) {
        intValues[key] = value;
        return value;
    }

    function incrementInt(bytes32 key, int256 value) external onlyController returns (int256) {
        int256 nextInt = intValues[key] + value;
        intValues[key] = nextInt;
        return nextInt;
    }

    function decrementUint(bytes32 key, int256 value) external onlyController returns (int256) {
        int256 nextInt = intValues[key] - value;
        intValues[key] = nextInt;
        return nextInt;
    }

    function getAddress(bytes32 key) external view returns (address) {
        return addressValues[key];
    }

    function setAddress(bytes32 key, address value) external onlyController returns (address) {
        addressValues[key] = value;
        return value;
    }

    function getData(bytes32 key) external view returns (bytes32) {
        return dataValues[key];
    }

    function setData(bytes32 key, bytes32 value) external onlyController returns (bytes32) {
        dataValues[key] = value;
        return value;
    }

    function getBool(bytes32 key) external view returns (bool) {
        return boolValues[key];
    }

    function setBool(bytes32 key, bool value) external onlyController returns (bool) {
        boolValues[key] = value;
        return value;
    }
}
