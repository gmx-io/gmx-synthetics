// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../bank/StrictBank.sol";
import "./Withdrawal.sol";

contract WithdrawalStore is StrictBank {
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableValues for EnumerableSet.Bytes32Set;

    mapping(bytes32 => Withdrawal.Props) public withdrawals;
    EnumerableSet.Bytes32Set internal withdrawalKeys;

    constructor(RoleStore _roleStore) StrictBank(_roleStore) {}

    function set(bytes32 key, Withdrawal.Props memory withdrawal) external onlyController {
        withdrawals[key] = withdrawal;
        withdrawalKeys.add(key);
    }

    function remove(bytes32 key) external onlyController {
        delete withdrawals[key];
        withdrawalKeys.remove(key);
    }

    function get(bytes32 key) external view returns (Withdrawal.Props memory) {
        return withdrawals[key];
    }

    function getWithdrawalCount() external view returns (uint256) {
        return withdrawalKeys.length();
    }

    function getWithdrawalKeys(uint256 start, uint256 end) external view returns (bytes32[] memory) {
        return withdrawalKeys.valuesAt(start, end);
    }
}
