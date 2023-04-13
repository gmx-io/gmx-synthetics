// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../error/ErrorUtils.sol";

/**
 * @title BasicMulticall
 */
abstract contract BasicMulticall {
    /**
     * @dev Receives and executes a batch of function calls on this contract.
     */
    function multicall(bytes[] calldata data) external virtual returns (bytes[] memory results) {
        results = new bytes[](data.length);

        for (uint256 i; i < data.length; i++) {
            (bool success, bytes memory result) = address(this).delegatecall(data[i]);

            if (!success) {
                ErrorUtils.revertWithParsedMessage(result);
            }

            results[i] = result;
        }

        return results;
    }
}
