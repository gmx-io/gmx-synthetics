// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./Order.sol";
import "../role/RoleModule.sol";
import "../bank/StrictBank.sol";

// @title OrderStore
// @dev Store for orders
contract OrderStore is StrictBank {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableValues for EnumerableSet.Bytes32Set;
    using Order for Order.Props;

    mapping(bytes32 => Order.Props) public orders;
    EnumerableSet.Bytes32Set internal orderKeys;
    mapping(address => EnumerableSet.Bytes32Set) internal accountOrderKeys;

    constructor(RoleStore _roleStore, DataStore _dataStore) StrictBank(_roleStore, _dataStore) {}

    // @dev set an order in the store
    // @param key the key of the order
    // @param order the order values to set
    function set(bytes32 key, Order.Props memory order) external onlyController {
        orders[key] = order;
        accountOrderKeys[order.account()].add(key);
        orderKeys.add(key);
    }

    // @dev remove an order from the store
    // @param key the key of the order to remove
    // @param account the order's account
    function remove(bytes32 key, address account) external onlyController {
        delete orders[key];
        accountOrderKeys[account].remove(key);
        orderKeys.remove(key);
    }

    // @dev check if an order exists
    // @param key the key of the order to check
    function contains(bytes32 key) external view returns (bool) {
        return orderKeys.contains(key);
    }

    // @dev get an order from the store
    // @param key the key of the order
    // @return the order values
    function get(bytes32 key) external view returns (Order.Props memory) {
        return orders[key];
    }

    // @dev get the total number of orders in the store
    // @return the total number of orders in the store
    function getOrderCount() external view returns (uint256) {
        return orderKeys.length();
    }

    // @dev get the order keys for the given indexes
    // @param start the start index, the value for this index will be included
    // @param end the end index, the value for this index will not be included
    // @return the order keys for the given indexes
    function getOrderKeys(uint256 start, uint256 end) external view returns (bytes32[] memory) {
        return orderKeys.valuesAt(start, end);
    }

    // @dev get the total number of orders in the store for an account
    // @param account the account to check
    // @return the total number of orders in the store for an account
    function getAccountOrderCount(address account) external view returns (uint256) {
        return accountOrderKeys[account].length();
    }

    // @dev get the order keys for an account for the given indexes
    // @param start the start index, the value for this index will be included
    // @param end the end index, the value for this index will not be included
    // @return the order keys for an account for the given indexes
    function getAccountOrderKeys(address account, uint256 start, uint256 end) external view returns (bytes32[] memory) {
        return accountOrderKeys[account].valuesAt(start, end);
    }
}
