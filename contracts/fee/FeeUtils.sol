// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

library FeeUtils {
    bytes32 public constant DEPOSIT_FEE = keccak256(abi.encode("DEPOSIT_FEE"));
    bytes32 public constant WITHDRAWAL_FEE = keccak256(abi.encode("WITHDRAWAL_FEE"));
    bytes32 public constant SWAP_FEE = keccak256(abi.encode("SWAP_FEE"));
    bytes32 public constant POSITION_FEE = keccak256(abi.encode("POSITION_FEE"));
}
