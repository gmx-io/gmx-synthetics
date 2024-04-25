// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../oracle/IChainlinkDataStreamVerifier.sol";

contract MockDataStreamVerifier is IChainlinkDataStreamVerifier {
    function verify(
        bytes calldata payload,
        bytes calldata parameterPayload
    ) external payable returns (bytes memory) {
        (address feeToken) = abi.decode(parameterPayload, (address));
        require(feeToken == 0x99bbA657f2BbC93c02D617f8bA121cB8Fc104Acf, "invalid fee token");

        return payload;
    }
}
