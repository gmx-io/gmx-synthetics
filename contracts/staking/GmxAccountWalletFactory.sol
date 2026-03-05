// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./GmxAccountWallet.sol";
import "../role/RoleStore.sol";

contract GmxAccountWalletFactory {
    RoleStore public immutable roleStore;

    event WalletCreated(address indexed account, address indexed wallet);

    constructor(RoleStore _roleStore) {
        roleStore = _roleStore;
    }

    function getWalletAddress(address account) public view returns (address) {
        bytes32 salt = _getSalt(account);
        bytes32 bytecodeHash = keccak256(
            abi.encodePacked(
                type(GmxAccountWallet).creationCode,
                abi.encode(roleStore)
            )
        );
        return address(uint160(uint256(keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, bytecodeHash)
        ))));
    }

    function getOrCreateWallet(address account) external returns (address) {
        address predicted = getWalletAddress(account);
        if (predicted.code.length > 0) {
            return predicted;
        }

        bytes32 salt = _getSalt(account);
        GmxAccountWallet wallet = new GmxAccountWallet{salt: salt}(roleStore);
        address walletAddress = address(wallet);

        emit WalletCreated(account, walletAddress);

        return walletAddress;
    }

    function _getSalt(address account) private pure returns (bytes32) {
        return keccak256(abi.encode("GMX_ACCOUNT_WALLET", account));
    }
}
