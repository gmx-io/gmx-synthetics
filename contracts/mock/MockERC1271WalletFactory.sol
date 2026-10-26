// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./MockERC1271Wallet.sol";

// @title MockERC1271WalletFactory
// @dev Mock factory for creating MockERC1271Wallet contracts via CREATE2 for testing EIP-6492
contract MockERC1271WalletFactory {
    event WalletCreated(address indexed wallet, address indexed owner, bytes32 salt);

    // @dev Creates a new MockERC1271Wallet using CREATE2
    // @param owner The owner of the new wallet
    // @param salt The salt for CREATE2 address derivation
    // @return wallet The address of the newly created wallet
    function createWallet(address owner, bytes32 salt) external returns (address wallet) {
        wallet = address(new MockERC1271Wallet{salt: salt}(owner));
        emit WalletCreated(wallet, owner, salt);
    }

    // @dev Computes the counterfactual address of a wallet before deployment
    // @param owner The owner of the wallet
    // @param salt The salt for CREATE2 address derivation
    // @return The address where the wallet would be deployed
    function getWalletAddress(address owner, bytes32 salt) external view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(MockERC1271Wallet).creationCode,
            abi.encode(owner)
        );
        bytes32 hash = keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            keccak256(bytecode)
        ));
        return address(uint160(uint256(hash)));
    }
}
