// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../bank/StrictBank.sol";
import "./Withdrawal.sol";

// @title WithdrawalStore
// @dev Store for withdrawals
contract WithdrawalStore is StrictBank {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableValues for EnumerableSet.Bytes32Set;

    mapping(bytes32 => Withdrawal.Props) public withdrawals;
    EnumerableSet.Bytes32Set internal withdrawalKeys;

    constructor(RoleStore _roleStore, DataStore _dataStore) StrictBank(_roleStore, _dataStore) {}

    // @dev set a withdrawal in the store
    // @param key the key of the withdrawal
    // @param withdrawal the withdrawal values to set
    function set(bytes32 key, Withdrawal.Props memory withdrawal) external onlyController {
        withdrawals[key] = withdrawal;
        withdrawalKeys.add(key);
    }

    // @dev delete a withdrawal from the store
    // @param key the key of the withdrawal to delete
    function remove(bytes32 key) external onlyController {
        delete withdrawals[key];
        withdrawalKeys.remove(key);
    }

    // @dev check if a withdrawal exists
    // @param key the key of the withdrawal to check
    function contains(bytes32 key) external view returns (bool) {
        return withdrawalKeys.contains(key);
    }

    // @dev get a withdrawal from the store
    // @param key the key of the withdrawal
    // @return the withdrawal for the key
    function get(bytes32 key) external view returns (Withdrawal.Props memory) {
        return withdrawals[key];
    }

    // @dev get the total number of withdrawals in the store
    // @return the total number of withdrawals in the store
    function getWithdrawalCount() external view returns (uint256) {
        return withdrawalKeys.length();
    }

    // @dev get the withdrawal keys for the given indexes
    // @param start the start index, the value for this index will be included
    // @param end the end index, the value for this index will not be included
    // @return the withdrawal keys for the given indexes
    function getWithdrawalKeys(uint256 start, uint256 end) external view returns (bytes32[] memory) {
        return withdrawalKeys.valuesAt(start, end);
    }
}
