// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IExternalHandler {
    function makeExternalCalls(
        address[] memory targets,
        bytes[] memory dataList,
        address[] memory refundTokens,
        address[] memory refundReceivers
    ) external;
}
