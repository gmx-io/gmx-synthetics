// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../callback/IDepositCallbackReceiver.sol";

contract StakeHandler is IDepositCallbackReceiver, ReentrancyGuard {
    address public immutable depositHandler;

    modifier onlyDepositHandler() {
        if (msg.sender != depositHandler) {
            revert("StakeHandler: Forbidden");
        }
        _;
    }

    constructor(address _depositHandler) {
        depositHandler = _depositHandler;
    }

    function depositExecuted(
        bytes32 key, Deposit.Props memory /* deposit */
    ) external onlyDepositHandler nonReentrant {
    }

    function depositCancelled(bytes32 /* key */, Deposit.Props memory /* deposit */) external {}
}
