// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { Origin } from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

import { MockEndpointV2 } from "./MockEndpointV2.sol";

// stands in for the destination endpoint of a MockEndpointV2 message and stores the payload instead of
// delivering it in the same transaction, so that tests can run transactions while a LZRead request is pending
contract MockDeferredEndpointV2 {
    Origin internal origin;
    address internal receiver;
    bytes32 internal payloadHash;
    bytes internal message;
    uint256 internal gasLimit;
    uint256 internal nativeValue;
    bytes32 internal guid;

    function receivePayload(
        Origin calldata _origin,
        address _receiver,
        bytes32 _payloadHash,
        bytes calldata _message,
        uint256 _gas,
        uint256 _msgValue,
        bytes32 _guid
    ) external payable {
        origin = _origin;
        receiver = _receiver;
        payloadHash = _payloadHash;
        message = _message;
        gasLimit = _gas;
        nativeValue = _msgValue;
        guid = _guid;
    }

    // deliver the stored payload through the endpoint the receiver accepts messages from
    function deliverPayload(MockEndpointV2 endpoint) external {
        endpoint.receivePayload{ value: nativeValue }(
            origin,
            receiver,
            payloadHash,
            message,
            gasLimit,
            nativeValue,
            guid
        );
    }
}
