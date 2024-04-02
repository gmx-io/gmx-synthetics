// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../oracle/IChainlinkDataStreamVerifier.sol";

contract MockDataStreamVerifier is IChainlinkDataStreamVerifier {
    function verify(
        bytes calldata payload,
        bytes calldata /* parameterPayload */
    ) external payable returns (bytes memory) {
        return payload;
    }
}
