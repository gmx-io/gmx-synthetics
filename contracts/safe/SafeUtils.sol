// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// referenced from https://github.com/safe-global/safe-smart-account/blob/main/contracts/libraries/SignMessageLib.sol

interface ISafe {
    function domainSeparator() external view returns (bytes32);
}

library SafeUtils {
    /**
     * @dev The precomputed EIP-712 type hash for the Safe message type.
     *      Precomputed value of: `keccak256("SafeMessage(bytes message)")`.
     */
    bytes32 private constant SAFE_MSG_TYPEHASH = 0x60b3cbf8b4a223d68d641b3b6ddf9a298e7f33710cf3d3a9d1146b5a6150fbca;

    function getMessageHash(address safeAccount, bytes memory message) internal view returns (bytes32) {
        bytes32 safeMessageHash = keccak256(abi.encode(SAFE_MSG_TYPEHASH, keccak256(message)));
        return keccak256(abi.encodePacked(bytes1(0x19), bytes1(0x01), ISafe(safeAccount).domainSeparator(), safeMessageHash));
    }
}
