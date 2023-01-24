// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

library RevertUtils {
    // To get the revert reason, referenced from https://ethereum.stackexchange.com/a/83577
    function getRevertMessage(bytes memory result) internal pure returns (string memory) {
        // If the result length is less than 68, then the transaction failed silently without a revert message
        if (result.length < 68) {
            return "Empty revert message";
        }

        assembly {
            result := add(result, 0x04)
        }

        return abi.decode(result, (string));
    }
}
