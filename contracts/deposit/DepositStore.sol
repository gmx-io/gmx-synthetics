// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../bank/StrictBank.sol";
import "./Deposit.sol";

// @title DepositStore
// @dev Store for deposits
contract DepositStore is StrictBank {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableValues for EnumerableSet.Bytes32Set;

    mapping(bytes32 => Deposit.Props) internal deposits;
    EnumerableSet.Bytes32Set internal depositKeys;

    constructor(RoleStore _roleStore, DataStore _dataStore) StrictBank(_roleStore, _dataStore) {}

    // @dev set a deposit in the store
    // @param key the key of the deposit
    // @param deposit the deposit values to set
    function set(bytes32 key, Deposit.Props memory deposit) external onlyController {
        deposits[key] = deposit;
        depositKeys.add(key);
    }

    // @dev delete a deposit from the store
    // @param key the key of the deposit to delete
    function remove(bytes32 key) external onlyController {
        delete deposits[key];
        depositKeys.remove(key);
    }

    // @dev check if a deposit exists
    // @param key the key of the deposit to check
    function contains(bytes32 key) external view returns (bool) {
        return depositKeys.contains(key);
    }

    // @dev get a deposit from the store
    // @param key the key of the deposit
    // @return the deposit for the key
    function get(bytes32 key) external view returns (Deposit.Props memory) {
        return deposits[key];
    }

    // @dev get the total number of deposits in the store
    // @return the total number of deposits in the store
    function getDepositCount() external view returns (uint256) {
        return depositKeys.length();
    }

    // @dev get the deposit keys for the given indexes
    // @param start the start index, the value for this index will be included
    // @param end the end index, the value for this index will not be included
    // @return the deposit keys for the given indexes
    function getDepositKeys(uint256 start, uint256 end) external view returns (bytes32[] memory) {
        return depositKeys.valuesAt(start, end);
    }
}
