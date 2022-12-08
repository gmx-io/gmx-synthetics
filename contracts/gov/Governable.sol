// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title Governable
// @dev Contract to allow for governance restricted functions
contract Governable {
    address public gov;

    event SetGov(address prevGov, address nextGov);

    error Unauthorized(address msgSender, string role);

    constructor() {
        _setGov(msg.sender);
    }

    modifier onlyGov() {
        if (msg.sender != gov) {
            revert Unauthorized(msg.sender, "GOV");
        }
        _;
    }

    // @dev updates the gov value to the input _gov value
    // @param _gov the value to update to
    function setGov(address _gov) external onlyGov {
        _setGov(_gov);
    }

    // @dev updates the gov value to the input _gov value
    // @param _gov the value to update to
    function _setGov(address _gov) internal {
        address prevGov = gov;
        gov = _gov;

        emit SetGov(prevGov, _gov);
    }
}
