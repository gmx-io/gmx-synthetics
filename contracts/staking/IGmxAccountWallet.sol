// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IGmxAccountWallet {
    function execute(address target, bytes calldata data) external returns (bytes memory);
    function execute(address target, bytes calldata data, uint256 value) external returns (bytes memory);
}
