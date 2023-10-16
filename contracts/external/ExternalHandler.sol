// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../error/Errors.sol";

// contracts with a CONTROLLER role or other roles may need to call external
// contracts, since these roles may be able to directly change DataStore values
// or perform other sensitive operations, these contracts should make these calls
// through ExternalHandler instead
//
// note that anyone can make this contract call any function, this should be noted
// to avoid assumptions of the contract's state in any protocol
//
// e.g. some tokens require the approved amount to be zero before the approved amount
// can be changed, this should be taken into account if calling approve is required for
// these tokens
contract ExternalHandler {
    function makeExternalCall(
        address target,
        bytes calldata data
    ) external {
        (bool success, bytes memory returndata) = target.call(data);

        if (!success) {
            revert Errors.ExternalCallFailed(returndata);
        }
    }

    function makeExternalCall(
        address target,
        uint256 value,
        bytes calldata data
    ) external payable {
        (bool success, bytes memory returndata) = target.call{value: value}(data);

        if (!success) {
            revert Errors.ExternalCallFailed(returndata);
        }
    }
}
