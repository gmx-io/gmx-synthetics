// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../role/RoleModule.sol";
import "../utils/Calc.sol";

// @title ListStore
// @dev ListStore for enumerable sets
contract ListStore is RoleModule {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableValues for EnumerableSet.Bytes32Set;
    using EnumerableValues for EnumerableSet.AddressSet;
    using EnumerableValues for EnumerableSet.UintSet;

    // store for bytes32 sets
    mapping(bytes32 => EnumerableSet.Bytes32Set) internal bytes32Sets;
    // store for address sets
    mapping(bytes32 => EnumerableSet.AddressSet) internal addressSets;
    // store for uint256 sets
    mapping(bytes32 => EnumerableSet.UintSet) internal uintSets;

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function containsBytes32(bytes32 setKey, bytes32 value) external view returns (bool) {
        return bytes32Sets[setKey].contains(value);
    }

    function getBytes32Count(bytes32 setKey) external view returns (uint256) {
        return bytes32Sets[setKey].length();
    }

    function getBytes32ValuesAt(bytes32 setKey, uint256 start, uint256 end) external view returns (bytes32[] memory) {
        return bytes32Sets[setKey].valuesAt(start, end);
    }

    function addBytes32(bytes32 setKey, bytes32 value) external onlyController {
        bytes32Sets[setKey].add(value);
    }

    function removeBytes32(bytes32 setKey, bytes32 value) external onlyController {
        bytes32Sets[setKey].remove(value);
    }

    function containsAddress(bytes32 setKey, address value) external view returns (bool) {
        return addressSets[setKey].contains(value);
    }

    function getAddressCount(bytes32 setKey) external view returns (uint256) {
        return addressSets[setKey].length();
    }

    function getAddressValuesAt(bytes32 setKey, uint256 start, uint256 end) external view returns (address[] memory) {
        return addressSets[setKey].valuesAt(start, end);
    }

    function addAddress(bytes32 setKey, address value) external onlyController {
        addressSets[setKey].add(value);
    }

    function removeAddress(bytes32 setKey, address value) external onlyController {
        addressSets[setKey].remove(value);
    }

    function containsUint(bytes32 setKey, uint256 value) external view returns (bool) {
        return uintSets[setKey].contains(value);
    }

    function getUintCount(bytes32 setKey) external view returns (uint256) {
        return uintSets[setKey].length();
    }

    function getUintValuesAt(bytes32 setKey, uint256 start, uint256 end) external view returns (uint256[] memory) {
        return uintSets[setKey].valuesAt(start, end);
    }

    function addUint(bytes32 setKey, uint256 value) external onlyController {
        uintSets[setKey].add(value);
    }

    function removeUint(bytes32 setKey, uint256 value) external onlyController {
        uintSets[setKey].remove(value);
    }
}
