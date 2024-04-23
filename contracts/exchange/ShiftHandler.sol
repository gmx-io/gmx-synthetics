// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./BaseHandler.sol";
import "./ExchangeUtils.sol";
import "../shift/ShiftVault.sol";
import "../shift/Shift.sol";

contract ShiftHandler is BaseHandler {
    using Shift for Shift.Props;

    ShiftVault public immutable shiftVault;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        Oracle _oracle,
        ShiftVault _shiftVault
    ) BaseHandler(_roleStore, _dataStore, _eventEmitter, _oracle) {
        shiftVault = _shiftVault;
    }
}
