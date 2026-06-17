// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../role/RoleModule.sol";
import "../error/ErrorUtils.sol";

contract GmxAccountWallet is RoleModule {
    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function execute(
        address target,
        bytes calldata data
    ) external onlyController returns (bytes memory) {
        (bool success, bytes memory result) = target.call(data);
        if (!success) {
            ErrorUtils.revertWithParsedMessage(result);
        }
        return result;
    }

    function execute(
        address target,
        bytes calldata data,
        uint256 value
    ) external onlyController returns (bytes memory) {
        (bool success, bytes memory result) = target.call{value: value}(data);
        if (!success) {
            ErrorUtils.revertWithParsedMessage(result);
        }
        return result;
    }

    receive() external payable {}
}
