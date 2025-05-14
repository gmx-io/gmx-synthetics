// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import { MessagingFee } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import { OAppSender } from "@layerzerolabs/oapp-evm/contracts/oapp/OAppSender.sol";
import { OAppCore } from "@layerzerolabs/oapp-evm/contracts/oapp/OAppCore.sol";

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import "../error/Errors.sol";

contract MultichainSender is OAppSender {

    constructor(address _endpoint, address _owner) OAppCore(_endpoint, _owner) Ownable() {}

    /**
     * @notice Quotes the fee required to send a message to the destination chain
     * @param message The message to be sent
     * @param dstEid Destination chain's endpoint ID
     * @param options Message execution options (e.g. for sending gas to destination)
     * @return fee The MessagingFee struct containing the native and ZRO fees
     */
    function quote(
        bytes memory message,
        uint32 dstEid,
        bytes calldata options
    ) external view returns (MessagingFee memory fee) {
        return _quote(dstEid, message, options, false);
    }

    /**
     * @notice Sends a message from the source to destination chain
     * @param message The message to be sent
     * @param dstEid Destination chain's endpoint ID
     * @param options Message execution options (e.g. for sending gas to destination)
     */
    function sendMessage(
        bytes memory message,
        uint32 dstEid,
        bytes calldata options
    ) external payable {
        MessagingFee memory fee = _quote(dstEid, message, options, false);

        if (msg.value < fee.nativeFee) {
            revert Errors.InsufficientFee(msg.value, fee.nativeFee);
        }

        _lzSend(
            dstEid,
            message,
            options,
            MessagingFee(msg.value, 0), // fee in native gas and ZRO token
            payable(msg.sender) // refund address in case of failed source message
        );
    }
}
