// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IFeeWithdrawer {
    function withdrawFees(address buybackToken) external;
}
