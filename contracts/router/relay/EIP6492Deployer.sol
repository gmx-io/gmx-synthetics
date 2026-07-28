// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../../role/RoleModule.sol";

// @title EIP6492Deployer
// @dev Unprivileged helper that executes factory calls for EIP-6492 signature
// validation. By isolating factory.call() in a contract with no roles,
// attacker-controlled calldata cannot access privileged protocol functions.
// This contract must NEVER be granted any roles (CONTROLLER, ROUTER_PLUGIN, etc).
contract EIP6492Deployer is RoleModule {
    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function deploy(address factory, bytes calldata data) external onlyController returns (bool) {
        (bool success, ) = factory.call(data);
        return success;
    }
}
