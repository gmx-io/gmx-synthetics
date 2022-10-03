// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./Position.sol";
import "../role/RoleModule.sol";

contract PositionStore is RoleModule {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableValues for EnumerableSet.Bytes32Set;

    mapping(bytes32 => Position.Props) internal positions;
    EnumerableSet.Bytes32Set internal positionKeys;
    mapping(address => EnumerableSet.Bytes32Set) internal accountPositionKeys;

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function set(bytes32 key, address account, Position.Props memory position) external onlyController {
        positions[key] = position;
        accountPositionKeys[account].add(key);
        positionKeys.add(key);
    }

    function remove(bytes32 key, address account) external onlyController {
        delete positions[key];
        accountPositionKeys[account].remove(key);
        positionKeys.remove(key);
    }

    function get(bytes32 key) external view returns (Position.Props memory) {
        return positions[key];
    }

    function getPositionCount() external view returns (uint256) {
        return positionKeys.length();
    }

    function getPositionKeys(uint256 start, uint256 end) external view returns (bytes32[] memory) {
        return positionKeys.valuesAt(start, end);
    }

    function getAccountPositionCount(address account) external view returns (uint256) {
        return accountPositionKeys[account].length();
    }

    function getAccountPositionKeys(address account, uint256 start, uint256 end) external view returns (bytes32[] memory) {
        return accountPositionKeys[account].valuesAt(start, end);
    }

    function contains(bytes32 key) public view returns (bool) {
        return positionKeys.contains(key);
    }
}
