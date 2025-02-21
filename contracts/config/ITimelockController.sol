// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface ITimelockController {
    function signal(
        address target, bytes32 payload
    ) external;

    function signalBatch(
        address[] calldata targets, bytes32[] calldata payloads
    ) external;
}
