// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { OAppReceiver, Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import { OAppCore } from "@layerzerolabs/oapp-evm/contracts/oapp/OAppCore.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../utils/Cast.sol";
import "../referral/IReferralStorage.sol";

contract MultichainReferralReceiver is OAppReceiver {

    IReferralStorage public immutable referralStorage;
    DataStore public immutable dataStore;

    constructor(DataStore _dataStore, IReferralStorage _referralStorege, address _endpoint, address _owner) OAppCore(_endpoint, _owner) Ownable() {
        dataStore = _dataStore;
        referralStorage = _referralStorege;
    }

    /**
     * @dev Called when data is received from the protocol. It overrides the equivalent function in the parent contract.
     * Protocol messages are defined as packets, comprised of the following parameters.
     * @param origin A struct containing information about where the packet came from.
     * param guid A global unique identifier for tracking the packet.
     * @param message Encoded message.
     */
    function _lzReceive(
        Origin calldata origin,
        bytes32 /* guid */,
        bytes calldata message,
        address,  // Executor address as specified by the OAppSender.
        bytes calldata  // Any extra data or options to trigger on receipt.
    ) internal override {
        address referralSender = Cast.bytes32ToAddress(origin.sender);
        _validateMultichainReferralSender(dataStore, referralSender);

        if (referralSender == address(0)) {
            revert Errors.InvalidReferralSender(referralSender);
        }

        (address account, bytes32 referralCode) = abi.decode(message, (address, bytes32));

        referralStorage.setTraderReferralCode(account, referralCode);
    }

    function _validateMultichainReferralSender(DataStore _dataStore, address referralSender) private view {
        bytes32 referralKey = Keys.isMultichainReferralSenderEnabledKey(referralSender);
        if (!_dataStore.getBool(referralKey)) {
            revert Errors.InvalidReferralSender(referralSender);
        }
    }
}