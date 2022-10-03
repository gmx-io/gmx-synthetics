// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

library FeeUtils {
    bytes32 public constant DEPOSIT_FEE = keccak256("DEPOSIT_FEE");
    bytes32 public constant WITHDRAWAL_FEE = keccak256("WITHDRAWAL_FEE");
    bytes32 public constant SWAP_FEE = keccak256("SWAP_FEE");
    bytes32 public constant POSITION_FEE = keccak256("POSITION_FEE");
}
