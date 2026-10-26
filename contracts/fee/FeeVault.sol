// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../bank/StrictBank.sol";

// @title FeeVault
// @dev Vault for fee claims
contract FeeVault is StrictBank {
    constructor(RoleStore _roleStore, DataStore _dataStore) StrictBank(_roleStore, _dataStore) {}
}
