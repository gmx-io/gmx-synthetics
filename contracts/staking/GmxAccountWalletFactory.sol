// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./GmxAccountWallet.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../event/EventEmitter.sol";
import "../role/RoleStore.sol";
import "../error/Errors.sol";
import "../utils/Cast.sol";

// @title GmxAccountWalletFactory
// @dev creates one GmxAccountWallet per account with CREATE2 and records it in the DataStore
//
// the wallet address of every account is permanently determined by:
//   - this factory's address
//   - the account salt: keccak256(abi.encode("GMX_ACCOUNT_WALLET", account))
//   - the GmxAccountWallet creation bytecode, which changes with any edit to the
//     wallet source or its imports, and with the compiler settings (solc version,
//     optimizer, metadata)
//   - the roleStore constructor argument
// changing any of these gives all accounts new wallet addresses --> the factory
// must not be redeployed without a wallet migration plan (see the id in the
// deploy script); existing wallets stay reachable through the DataStore record
contract GmxAccountWalletFactory {
    using EventUtils for EventUtils.AddressItems;

    RoleStore public immutable roleStore;
    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;

    // wallet addresses are CREATE2-derived from this hash together with the factory
    // address and the account salt; exposed so tooling and integrators can verify
    // the wallet namespace on-chain
    bytes32 public immutable walletInitCodeHash;

    constructor(RoleStore _roleStore, DataStore _dataStore, EventEmitter _eventEmitter) {
        roleStore = _roleStore;
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        walletInitCodeHash = keccak256(
            abi.encodePacked(
                type(GmxAccountWallet).creationCode,
                abi.encode(_roleStore)
            )
        );
    }

    // @dev the wallet recorded for the account, zero if no wallet was created yet
    // this record (not address derivation) is what keeps existing wallets reachable
    // if the factory is redeployed
    function getWallet(address account) public view returns (address) {
        return dataStore.getAddress(Keys.accountWalletKey(account));
    }

    // @dev predicts where this factory would create a new wallet for the account
    // the result depends on the factory's own address, so a redeployed factory
    // derives different addresses for the same accounts
    //   - getWallet must be used to resolve existing wallets, including wallets
    //     deployed by previous factories
    //   - getWalletAddress should only be used to predict the address where the
    //     current factory would deploy a new wallet
    function getWalletAddress(address account) public view returns (address) {
        bytes32 salt = _getSalt(account);
        return address(uint160(uint256(keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, walletInitCodeHash)
        ))));
    }

    function getOrCreateWallet(address account) external returns (address) {
        address storedWallet = getWallet(account);
        if (storedWallet != address(0)) {
            // the record must point at a wallet this factory deployed; catches
            // incomplete writes, e.g. a migration setting only the account record
            if (!dataStore.getBool(Keys.isDeployedWalletKey(storedWallet))) {
                revert Errors.InvalidWallet(storedWallet);
            }
            // never create a second wallet for an account that has one: the recorded
            // wallet holds the account's V1 staking state
            return storedWallet;
        }

        address predicted = getWalletAddress(account);
        if (predicted.code.length > 0) {
            if (!dataStore.getBool(Keys.isDeployedWalletKey(predicted))) {
                revert Errors.InvalidWallet(predicted);
            }
            dataStore.setAddress(Keys.accountWalletKey(account), predicted);
            _emitWalletMapped(account, predicted);
            return predicted;
        }

        bytes32 salt = _getSalt(account);
        GmxAccountWallet wallet = new GmxAccountWallet{salt: salt}(roleStore);
        address walletAddress = address(wallet);

        dataStore.setBool(Keys.isDeployedWalletKey(walletAddress), true);
        // account --> wallet record; the staking flows resolve wallets through this
        // record, so it must be written from the first wallet on: it cannot be
        // backfilled on-chain after a factory replacement, and without it existing
        // wallets become unreachable
        dataStore.setAddress(Keys.accountWalletKey(account), walletAddress);

        _emitWalletCreated(account, walletAddress);
        _emitWalletMapped(account, walletAddress);

        return walletAddress;
    }

    function _getSalt(address account) private pure returns (bytes32) {
        return keccak256(abi.encode("GMX_ACCOUNT_WALLET", account));
    }

    function _emitWalletCreated(address account, address wallet) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "wallet", wallet);

        eventEmitter.emitEventLog2(
            "GmxAccountWalletCreated",
            Cast.toBytes32(account),
            Cast.toBytes32(wallet),
            eventData
        );
    }

    function _emitWalletMapped(address account, address wallet) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "wallet", wallet);

        eventEmitter.emitEventLog2(
            "GmxAccountWalletMapped",
            Cast.toBytes32(account),
            Cast.toBytes32(wallet),
            eventData
        );
    }
}
