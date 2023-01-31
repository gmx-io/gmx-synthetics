// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "../utils/EnumerableValues.sol";
import "./Role.sol";

/**
 * @title RoleStore
 * @dev Stores roles and their members.
 */
contract RoleStore {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableValues for EnumerableSet.AddressSet;
    using EnumerableValues for EnumerableSet.Bytes32Set;

    EnumerableSet.Bytes32Set internal roles;
    mapping(bytes32 => EnumerableSet.AddressSet) internal roleMembers;
    // checking if an account has a role is a frequently used function
    // roleCache helps to save gas by offering a more efficient lookup
    // vs calling roleMembers[key].contains(account)
    mapping(address => mapping (bytes32 => bool)) roleCache;

    error Unauthorized(address msgSender, string role);
    error ThereMustBeAtLeastOneRoleAdmin();

    modifier onlyRoleAdmin() {
        if (!hasRole(msg.sender, Role.ROLE_ADMIN)) {
            revert Unauthorized(msg.sender, "ROLE_ADMIN");
        }
        _;
    }

    constructor() {
        _grantRole(msg.sender, Role.ROLE_ADMIN);
    }

    /**
     * @dev Grants the specified role to the given account.
     *
     * @param account The address of the account.
     * @param key The key of the role to grant.
     */
    function grantRole(address account, bytes32 key) external onlyRoleAdmin {
        _grantRole(account, key);
    }

    /**
     * @dev Revokes the specified role from the given account.
     *
     * @param account The address of the account.
     * @param key The key of the role to revoke.
     */
    function revokeRole(address account, bytes32 key) external onlyRoleAdmin {
        _revokeRole(account, key);
    }

    /**
     * @dev Returns true if the given account has the specified role.
     *
     * @param account The address of the account.
     * @param key The key of the role.
     * @return True if the account has the role, false otherwise.
     */
    function hasRole(address account, bytes32 key) public view returns (bool) {
        return roleCache[account][key];
    }

    /**
     * @dev Returns the number of roles stored in the contract.
     *
     * @return The number of roles.
     */
    function getRoleCount() external view returns (uint256) {
        return roles.length();
    }

    /**
     * @dev Returns the keys of the roles stored in the contract.
     *
     * @param start The starting index of the range of roles to return.
     * @param end The ending index of the range of roles to return.
     * @return The keys of the roles.
     */
    function getRoles(uint256 start, uint256 end) external view returns (bytes32[] memory) {
        return roles.valuesAt(start, end);
    }

    /**
     * @dev Returns the number of members of the specified role.
     *
     * @param key The key of the role.
     * @return The number of members of the role.
     */
    function getRoleMemberCount(bytes32 key) external view returns (uint256) {
        return roleMembers[key].length();
    }

    /**
     * @dev Returns the members of the specified role.
     *
     * @param key The key of the role.
     * @param start the start index, the value for this index will be included.
     * @param end the end index, the value for this index will not be included.
     * @return The members of the role.
     */
    function getRoleMembers(bytes32 key, uint256 start, uint256 end) external view returns (address[] memory) {
        return roleMembers[key].valuesAt(start, end);
    }

    function _grantRole(address account, bytes32 key) internal {
        roles.add(key);
        roleMembers[key].add(account);
        roleCache[account][key] = true;
    }

    function _revokeRole(address account, bytes32 key) internal {
        roleMembers[key].remove(account);
        roleCache[account][key] = false;

        if (key == Role.ROLE_ADMIN && roleMembers[key].length() == 0) {
            revert ThereMustBeAtLeastOneRoleAdmin();
        }
    }
}
