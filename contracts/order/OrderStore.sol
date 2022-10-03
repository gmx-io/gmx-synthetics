// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./Order.sol";
import "../role/RoleModule.sol";
import "../bank/StrictBank.sol";

contract OrderStore is StrictBank {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableValues for EnumerableSet.Bytes32Set;
    using Order for Order.Props;

    mapping(bytes32 => Order.Props) public orders;
    EnumerableSet.Bytes32Set internal orderKeys;
    mapping(address => EnumerableSet.Bytes32Set) internal accountOrderKeys;

    constructor(RoleStore _roleStore) StrictBank(_roleStore) {}

    function set(bytes32 key, Order.Props memory order) external onlyController {
        orders[key] = order;
        accountOrderKeys[order.account()].add(key);
        orderKeys.add(key);
    }

    function remove(bytes32 key, address account) external onlyController {
        delete orders[key];
        accountOrderKeys[account].remove(key);
        orderKeys.remove(key);
    }

    function get(bytes32 key) external view returns (Order.Props memory) {
        return orders[key];
    }

    function getOrderCount() external view returns (uint256) {
        return orderKeys.length();
    }

    function getOrderKeys(uint256 start, uint256 end) external view returns (bytes32[] memory) {
        return orderKeys.valuesAt(start, end);
    }

    function getAccountOrderCount(address account) external view returns (uint256) {
        return accountOrderKeys[account].length();
    }

    function getAccountOrderKeys(address account, uint256 start, uint256 end) external view returns (bytes32[] memory) {
        return accountOrderKeys[account].valuesAt(start, end);
    }
}
