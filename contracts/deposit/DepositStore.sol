// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../bank/StrictBank.sol";
import "./Deposit.sol";

contract DepositStore is StrictBank {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableValues for EnumerableSet.Bytes32Set;

    mapping(bytes32 => Deposit.Props) internal deposits;
    EnumerableSet.Bytes32Set internal depositKeys;

    constructor(RoleStore _roleStore) StrictBank(_roleStore) {}

    function set(bytes32 key, Deposit.Props memory deposit) external onlyController {
        deposits[key] = deposit;
        depositKeys.add(key);
    }

    function remove(bytes32 key) external onlyController {
        delete deposits[key];
        depositKeys.remove(key);
    }

    function get(bytes32 key) external view returns (Deposit.Props memory) {
        return deposits[key];
    }

    function getDepositCount() external view returns (uint256) {
        return depositKeys.length();
    }

    function getDepositKeys(uint256 start, uint256 end) external view returns (bytes32[] memory) {
        return depositKeys.valuesAt(start, end);
    }
}
