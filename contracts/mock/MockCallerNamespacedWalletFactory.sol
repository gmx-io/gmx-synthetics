// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// @title MockCallerNamespacedWallet
// @dev Wallet whose address does not depend on its owner: the creation code is the same for
// every owner and the owner is set after deployment
contract MockCallerNamespacedWallet is IERC1271 {
    using ECDSA for bytes32;

    bytes4 constant ERC1271_MAGIC_VALUE = 0x1626ba7e;

    address public owner;

    function initialize(address _owner) external {
        require(owner == address(0), "already initialized");
        owner = _owner;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view override returns (bytes4) {
        if (hash.recover(signature) == owner) {
            return ERC1271_MAGIC_VALUE;
        }
        return 0xffffffff;
    }
}

// @title MockCallerNamespacedWalletFactory
// @dev Factory that puts msg.sender into the wallet address but not the owner, the shape used
// by generic CREATE3 deployers. Wallets from this factory are only safe while each user has
// their own caller address, so it is what the EIP-6492 forwarder is tested against.
contract MockCallerNamespacedWalletFactory {
    function createWallet(address walletOwner, bytes32 userSalt) external returns (address) {
        bytes32 salt = keccak256(abi.encode(msg.sender, userSalt));
        MockCallerNamespacedWallet wallet = new MockCallerNamespacedWallet{salt: salt}();
        wallet.initialize(walletOwner);
        return address(wallet);
    }

    function getWalletAddress(address caller, bytes32 userSalt) external view returns (address) {
        bytes32 salt = keccak256(abi.encode(caller, userSalt));
        bytes32 bytecodeHash = keccak256(type(MockCallerNamespacedWallet).creationCode);
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash)))));
    }
}
