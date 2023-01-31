// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./ErrorUtils.sol";

/**
 * @title PayableMulticall
 * @dev Contract to help call multiple functions in a single transaction
 * all function calls will have the original sender as the msg.sender value
 * IMPORTANT: in the multicall, msg.value will be the same for each delegatecall
 * extra care should be taken if msg.value is used in any of the functions of the inheriting contract
 */
abstract contract PayableMulticall {
    /**
     * @dev Receives and executes a batch of function calls on this contract.
     */
    function multicall(bytes[] calldata data) external payable virtual returns (bytes[] memory results) {
        results = new bytes[](data.length);

        for (uint256 i = 0; i < data.length; i++) {
            (bool success, bytes memory result) = address(this).delegatecall(data[i]);

            if (!success) {
                ErrorUtils.revertWithParsedMessage(result);
            }

            results[i] = result;
        }

        return results;
    }
}
