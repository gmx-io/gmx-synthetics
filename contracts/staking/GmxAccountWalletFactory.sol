// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./GmxAccountWallet.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../role/RoleStore.sol";
import "../error/Errors.sol";

contract GmxAccountWalletFactory {
    RoleStore public immutable roleStore;
    DataStore public immutable dataStore;

    event WalletCreated(address indexed account, address indexed wallet);

    constructor(RoleStore _roleStore, DataStore _dataStore) {
        roleStore = _roleStore;
        dataStore = _dataStore;
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
            if (!dataStore.getBool(Keys.isDeployedWalletKey(predicted))) {
                revert Errors.InvalidWallet(predicted);
            }
            return predicted;
        }

        bytes32 salt = _getSalt(account);
        GmxAccountWallet wallet = new GmxAccountWallet{salt: salt}(roleStore);
        address walletAddress = address(wallet);

        dataStore.setBool(Keys.isDeployedWalletKey(walletAddress), true);

        emit WalletCreated(account, walletAddress);

        return walletAddress;
    }

    function _getSalt(address account) private pure returns (bytes32) {
        return keccak256(abi.encode("GMX_ACCOUNT_WALLET", account));
    }
}
