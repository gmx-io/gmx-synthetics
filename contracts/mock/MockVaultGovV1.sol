// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../v1/IVaultV1.sol";

contract MockVaultGovV1 {
    using SafeERC20 for IERC20;

    function withdrawFees(address _vault, address _token, address _receiver) external returns (uint256) {
        uint256 balance = IVaultV1(_vault).withdrawFees(_token, _receiver);
        return balance;
    }
}