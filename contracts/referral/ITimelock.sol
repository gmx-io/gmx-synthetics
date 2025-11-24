// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

/// @dev interface for the V1 Timelock contract
interface ITimelock {
    /// @dev set the owner of a referral code via timelock keeper access
    function govSetCodeOwner(address _referralStorage, bytes32 _code, address _newAccount) external;
}
