// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../error/Errors.sol";

// @title Governable
// @dev Contract to allow for governance restricted functions
contract Governable {
    address public gov;
    address public pendingGov;

    event SetGov(address prevGov, address nextGov);

    constructor() {
        _setGov(msg.sender);
    }

    modifier onlyGov() {
        if (msg.sender != gov) {
            revert Errors.Unauthorized(msg.sender, "GOV");
        }
        _;
    }

    function transferOwnership(address _newGov) external onlyGov {
        pendingGov = _newGov;
    }

    function acceptOwnership() external {
        if (msg.sender != pendingGov) {
            revert Errors.Unauthorized(msg.sender, "PendingGov");
        }

        _setGov(msg.sender);
    }

    // @dev updates the gov value to the input _gov value
    // @param _gov the value to update to
    function _setGov(address _gov) internal {
        address prevGov = gov;
        gov = _gov;

        emit SetGov(prevGov, _gov);
    }
}
