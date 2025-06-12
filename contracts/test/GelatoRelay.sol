// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

contract GelatoRelay {
    struct SponsoredCall {
        uint256 chainId;
        address target;
        bytes data;
    }

    function sponsoredCall(
        SponsoredCall calldata _call,
        address,
        address,
        uint256,
        uint256,
        uint256,
        bytes32
    ) external {
        (bool success, bytes memory result) = _call.target.call(_call.data);

        if (!success) {
            // bubble up the revert
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }
}
