// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../error/Errors.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

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
contract ExternalHandler is ReentrancyGuard {
    using SafeERC20 for IERC20;

    function makeExternalCalls(
        address[] memory targets,
        bytes[] memory dataList,
        address[] memory refundTokens,
        address[] memory refundReceivers
    ) external nonReentrant {
        for (uint256 i; i < targets.length; i++) {
            _makeExternalCall(
                targets[i],
                dataList[i]
            );
        }

        for (uint256 i; i < refundTokens.length; i++) {
            IERC20 refundToken = IERC20(refundTokens[i]);
            uint256 balance = refundToken.balanceOf(address(this));
            if (balance > 0) {
                refundToken.transfer(refundReceivers[i], balance);
            }
        }
    }

    function _makeExternalCall(
        address target,
        bytes memory data
    ) internal {
        (bool success, bytes memory returndata) = target.call(data);

        if (!success) {
            revert Errors.ExternalCallFailed(returndata);
        }
    }
}
