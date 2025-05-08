// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../multichain/MultichainReader.sol";

contract MockMultichainReaderOriginator {
    mapping(bytes32 guid => MultichainReaderUtils.ReceivedData) public receivedData;

    MultichainReaderUtils.ReceivedData public latestReceivedData =
        MultichainReaderUtils.ReceivedData(0, abi.encode("Nothing received yet."));

    bytes32 public latestGuid;

    MultichainReader public multichainReader;

    constructor(MultichainReader _multichainReader) {
        multichainReader = _multichainReader;
    }

    receive() external payable {}

    function processLzReceive(bytes32 guid, MultichainReaderUtils.ReceivedData memory receivedDataParam) external {
        receivedData[guid] = receivedDataParam;
        latestGuid = guid;
        latestReceivedData = receivedDataParam;
    }

    function setmultichainReader(MultichainReader _multichainReader) external {
        multichainReader = _multichainReader;
    }

    function callSendReadRequests(
        MultichainReaderUtils.ReadRequestInputs[] calldata readRequestInputs,
        MultichainReaderUtils.ExtraOptionsInputs calldata extraOptionsInputs
    ) external payable returns (MessagingReceipt memory) {
        MessagingFee memory messagingFee = multichainReader.quoteReadFee(readRequestInputs, extraOptionsInputs);
        MessagingReceipt memory messagingReceipt = multichainReader.sendReadRequests{ value: messagingFee.nativeFee }(
            readRequestInputs,
            extraOptionsInputs
        );
        return (messagingReceipt);
    }

    function callQuoteReadFee(
        MultichainReaderUtils.ReadRequestInputs[] calldata readRequestInputs,
        MultichainReaderUtils.ExtraOptionsInputs calldata extraOptionsInputs
    ) external view returns (uint256) {
        MessagingFee memory messagingFee = multichainReader.quoteReadFee(readRequestInputs, extraOptionsInputs);
        return (messagingFee.nativeFee);
    }

    function testRead() external pure returns (uint256) {
        return 12345;
    }
}
