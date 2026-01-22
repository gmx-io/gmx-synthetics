// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// @title MockERC1271Wallet
// @dev Mock smart contract wallet implementing ERC-1271 for testing
contract MockERC1271Wallet is IERC1271 {
    using ECDSA for bytes32;

    bytes4 constant ERC1271_MAGIC_VALUE = 0x1626ba7e;

    address public owner;

    constructor(address _owner) {
        owner = _owner;
    }

    // @dev Validates a signature per ERC-1271
    // @param hash The hash that was signed
    // @param signature The signature to validate
    // @return magicValue ERC1271_MAGIC_VALUE if valid, 0xffffffff otherwise
    function isValidSignature(bytes32 hash, bytes memory signature) external view override returns (bytes4) {
        address recovered = hash.recover(signature);
        if (recovered == owner) {
            return ERC1271_MAGIC_VALUE;
        }
        return 0xffffffff;
    }
}
