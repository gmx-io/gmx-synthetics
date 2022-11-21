// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../role/RoleModule.sol";

contract FundReceiver is RoleModule {
    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    // users may incorrectly send the native token into the contract, allow it to be recovered
    function recoverWnt(address payable receiver, uint256 amount) external onlyController {
        receiver.transfer(amount);
    }
}
