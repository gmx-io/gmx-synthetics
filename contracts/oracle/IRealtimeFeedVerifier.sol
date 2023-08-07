// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IRealtimeFeedVerifier {
    function verify(bytes memory data) external view returns (bytes memory);
}
