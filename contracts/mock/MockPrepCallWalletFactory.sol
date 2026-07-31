// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// @title MockPrepCallWallet
// @dev Wallet that only validates signatures after a preparation call, used to test the
// EIP-6492 path where the factory calldata is run again on an already deployed wallet
contract MockPrepCallWallet is IERC1271 {
    using ECDSA for bytes32;

    bytes4 constant ERC1271_MAGIC_VALUE = 0x1626ba7e;

    address public owner;
    bool public prepared;

    function initialize(address _owner) external {
        require(owner == address(0), "already initialized");
        owner = _owner;
    }

    function prepare() external {
        prepared = true;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view override returns (bytes4) {
        if (prepared && hash.recover(signature) == owner) {
            return ERC1271_MAGIC_VALUE;
        }
        return 0xffffffff;
    }
}

// @title MockPrepCallWalletFactory
// @dev The same calldata deploys the wallet the first time and prepares it after that, which is
// what EIP-6492 factory calldata is allowed to do
contract MockPrepCallWalletFactory {
    function createOrPrepareWallet(address walletOwner, bytes32 userSalt) external returns (address) {
        bytes32 salt = keccak256(abi.encode(msg.sender, userSalt));
        address predicted = getWalletAddress(msg.sender, userSalt);

        if (predicted.code.length > 0) {
            MockPrepCallWallet(predicted).prepare();
            return predicted;
        }

        MockPrepCallWallet wallet = new MockPrepCallWallet{salt: salt}();
        wallet.initialize(walletOwner);
        return address(wallet);
    }

    function getWalletAddress(address caller, bytes32 userSalt) public view returns (address) {
        bytes32 salt = keccak256(abi.encode(caller, userSalt));
        bytes32 bytecodeHash = keccak256(type(MockPrepCallWallet).creationCode);
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash)))));
    }
}
