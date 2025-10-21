// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

library StringUtils {
    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}
