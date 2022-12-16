// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./Position.sol";
import "../bank/StrictBank.sol";

// @title PositionStore
// @dev Store for positions
contract PositionStore is StrictBank {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableValues for EnumerableSet.Bytes32Set;

    mapping(bytes32 => Position.Props) internal positions;
    EnumerableSet.Bytes32Set internal positionKeys;
    mapping(address => EnumerableSet.Bytes32Set) internal accountPositionKeys;

    constructor(RoleStore _roleStore, DataStore _dataStore) StrictBank(_roleStore, _dataStore) {}

    // @dev set a position in the store
    // @param key the key of the position
    // @param account the position's account
    // @param position the position values to set
    function set(bytes32 key, address account, Position.Props memory position) external onlyController {
        positions[key] = position;
        accountPositionKeys[account].add(key);
        positionKeys.add(key);
    }

    // @dev delete a position from the store
    // @param key the key of the position to delete
    // @param account the position's account
    function remove(bytes32 key, address account) external onlyController {
        delete positions[key];
        accountPositionKeys[account].remove(key);
        positionKeys.remove(key);
    }

    // @dev check if a position exists
    // @param key the key of the position to check
    function contains(bytes32 key) external view returns (bool) {
        return positionKeys.contains(key);
    }

    // @dev get a position from the store
    // @param key the key of the position
    // @return the position for the key
    function get(bytes32 key) external view returns (Position.Props memory) {
        return positions[key];
    }

    // @dev get the total number of positions in the store
    // @return the total number of positions in the store
    function getPositionCount() external view returns (uint256) {
        return positionKeys.length();
    }

    // @dev get the position keys for the given indexes
    // @param start the start index, the value for this index will be included
    // @param end the end index, the value for this index will not be included
    // @return the position keys for the given indexes
    function getPositionKeys(uint256 start, uint256 end) external view returns (bytes32[] memory) {
        return positionKeys.valuesAt(start, end);
    }

    // @dev get the total number of positions for an account
    // @return the total number of positions for an account
    function getAccountPositionCount(address account) external view returns (uint256) {
        return accountPositionKeys[account].length();
    }

    // @dev get the position keys for an account for the given indexes
    // @param start the start index, the value for this index will be included
    // @param end the end index, the value for this index will not be included
    // @return the position keys for an account for the given indexes
    function getAccountPositionKeys(address account, uint256 start, uint256 end) external view returns (bytes32[] memory) {
        return accountPositionKeys[account].valuesAt(start, end);
    }
}
