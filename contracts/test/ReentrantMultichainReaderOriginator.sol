// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../multichain/IOriginator.sol";
import "../multichain/MultichainReader.sol";

contract ReentrantMultichainReaderOriginator is IOriginator {
    MultichainReader public multichainReader;

    bytes public reenterReadRequestInputs;
    MultichainReaderUtils.ExtraOptionsInputs public reenterExtraOptions;
    uint256 public reenterMaxDepth;
    uint256 public reenterDepth;

    bool public lastReenterSuccess;
    bytes public lastReenterResult;

    constructor(MultichainReader _multichainReader) {
        multichainReader = _multichainReader;
    }

    receive() external payable {}

    function setReenterConfig(
        bytes calldata readRequestInputs,
        MultichainReaderUtils.ExtraOptionsInputs calldata extraOptionsInputs,
        uint256 maxDepth
    ) external {
        reenterReadRequestInputs = readRequestInputs;
        reenterExtraOptions = extraOptionsInputs;
        reenterMaxDepth = maxDepth;

        reenterDepth = 0;
        lastReenterSuccess = false;
        delete lastReenterResult;
    }

    function callSendReadRequests(
        MultichainReaderUtils.ReadRequestInputs[] calldata readRequestInputs,
        MultichainReaderUtils.ExtraOptionsInputs calldata extraOptionsInputs
    ) external payable returns (MessagingReceipt memory) {
        MessagingFee memory messagingFee = multichainReader.quoteReadFee(readRequestInputs, extraOptionsInputs);
        return multichainReader.sendReadRequests{ value: messagingFee.nativeFee }(readRequestInputs, extraOptionsInputs);
    }

    function processLzReceive(
        bytes32 /*guid*/,
        MultichainReaderUtils.ReceivedData calldata /*receivedData*/
    ) external override {
        if (reenterDepth >= reenterMaxDepth) {
            return;
        }

        reenterDepth++;

        MultichainReaderUtils.ReadRequestInputs[] memory readRequestInputs =
            abi.decode(reenterReadRequestInputs, (MultichainReaderUtils.ReadRequestInputs[]));
        MessagingFee memory messagingFee = multichainReader.quoteReadFee(readRequestInputs, reenterExtraOptions);

        try multichainReader.sendReadRequests{ value: messagingFee.nativeFee }(readRequestInputs, reenterExtraOptions) {
            lastReenterSuccess = true;
            delete lastReenterResult;
        } catch (bytes memory reason) {
            lastReenterSuccess = false;
            lastReenterResult = reason;
        }
    }
}
