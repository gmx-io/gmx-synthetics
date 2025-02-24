// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface ITimelockController {
    function signal(
        address target, bytes calldata payload
    ) external;

    function signalBatch(
        address[] calldata targets, bytes[] calldata payloads, uint256[] calldata values
    ) external;

    function execute(
        address target,
        uint256 value,
        bytes calldata payload,
        bytes32 predecessor,
        bytes32 salt
    ) external payable;

    function getMinDelay() external view returns (uint256);
}
