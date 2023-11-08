// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/governance/TimelockController.sol";

contract GovTimelockController is TimelockController {
    string private _name;

    constructor(
        string memory name_,
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {
        _name = name_;
    }

    function name() public view returns (string memory) {
        return _name;
    }
}
