// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { OAppReceiver, Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OAppReceiver.sol";
import { OAppCore } from "@layerzerolabs/oapp-evm/contracts/oapp/OAppCore.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../utils/Cast.sol";
import "../referral/IReferralStorage.sol";

contract MultichainReceiver is OAppReceiver {
    IReferralStorage public immutable referralStorage;
    DataStore public immutable dataStore;

    enum ActionType {
        SetTraderReferralCode
    }

    constructor(
        DataStore _dataStore,
        IReferralStorage _referralStorege,
        address _endpoint,
        address _owner
    ) OAppCore(_endpoint, _owner) Ownable() {
        dataStore = _dataStore;
        referralStorage = _referralStorege;
    }

    /**
     * @dev Called when data is received from the protocol. It overrides the equivalent function in the parent contract.
     * Protocol messages are defined as packets, comprised of the following parameters.
     * param origin A struct containing information about where the packet came from.
     * param guid A global unique identifier for tracking the packet.
     * @param message Encoded message containing the action type and data.
     * @dev MultichainSender and source chain are enforced through setPeer(eid, oAppAddress).
     */
    function _lzReceive(
        Origin calldata /* origin */,
        bytes32 /* guid */,
        bytes calldata message,
        address, // Executor address as specified by the OAppSender.
        bytes calldata // Any extra data or options to trigger on receipt.
    ) internal override {
        (address account, bytes memory data) = abi.decode(message, (address, bytes));
        (ActionType actionType, bytes memory actionData) = abi.decode(data, (ActionType, bytes));

        if (actionType == ActionType.SetTraderReferralCode) {
            (bytes32 referralCode) = abi.decode(actionData, (bytes32));
            referralStorage.setTraderReferralCode(account, referralCode);
        } else {
            revert Errors.InvalidMultichainAction();
        }
    }
}
