// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title FeeUtils
// @dev Library for fee actions
library FeeUtils {
    // @dev key for deposit fees
    bytes32 public constant DEPOSIT_FEE = keccak256(abi.encode("DEPOSIT_FEE"));
    // @dev key for withdrawal fees
    bytes32 public constant WITHDRAWAL_FEE = keccak256(abi.encode("WITHDRAWAL_FEE"));
    // @dev key for swap fees
    bytes32 public constant SWAP_FEE = keccak256(abi.encode("SWAP_FEE"));
    // @dev key for position fees
    bytes32 public constant POSITION_FEE = keccak256(abi.encode("POSITION_FEE"));
}
