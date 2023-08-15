// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../oracle/IRealtimeFeedVerifier.sol";

contract MockRealtimeFeedVerifier is IRealtimeFeedVerifier {
    function verify(bytes memory data) external pure returns (bytes memory) {
        return data;
    }
}
