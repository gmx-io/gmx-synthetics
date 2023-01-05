// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../bank/StrictBank.sol";

// @title DepositVault
// @dev Vault for deposits
contract DepositVault is StrictBank {
    constructor(RoleStore _roleStore, DataStore _dataStore) StrictBank(_roleStore, _dataStore) {}
}
