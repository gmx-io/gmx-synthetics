// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

library RevertUtils {
    // To get the revert reason, referenced from https://ethereum.stackexchange.com/a/83577
    function getRevertMessage(bytes memory result) internal pure returns (string memory, bool) {
        // If the result length is less than 68, then the transaction failed silently without a revert message
        if (result.length < 68) {
            return ("Empty revert message", true);
        }

        bytes4 errorSelector;

        assembly {
            errorSelector := mload(add(result, 0x20))
        }

        // 0x4e487b71 is the selector for Panic(uint256)
        // 0x08c379a0 is the selector for Error(string)
        // referenced from https://blog.soliditylang.org/2021/04/21/custom-errors/
        if (
            errorSelector == bytes4(0x4e487b71) ||
            errorSelector == bytes4(0x08c379a0)
        ) {
            assembly {
                result := add(result, 0x04)
            }

            return (abi.decode(result, (string)), true);
        }

        // error may be a custom error, return an empty string for this case
        return ("", false);
    }

    function revertWithParsedMessage(bytes memory result) internal pure {
        (string memory revertMessage, bool hasRevertMessage) = getRevertMessage(result);

        if (hasRevertMessage) {
            revert(revertMessage);
        } else {
            // referenced from https://ethereum.stackexchange.com/a/123588
            uint256 length = result.length;
            assembly {
                revert(add(result, 0x20), length)
            }
        }
    }
}
