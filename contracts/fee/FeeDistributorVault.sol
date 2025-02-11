// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../bank/Bank.sol";

contract FeeDistributorVault is Bank {
    constructor(RoleStore _roleStore, DataStore _dataStore) Bank(_roleStore, _dataStore) {}
}
