// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IVaultGovV1 {
    function withdrawFees(address _vault, address _token, address _receiver) external returns (uint256);
}
