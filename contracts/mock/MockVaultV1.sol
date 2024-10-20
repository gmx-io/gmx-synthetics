// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockVaultV1 {
    using SafeERC20 for IERC20;

    address public immutable gov;

    constructor(address _gov) {
        gov = _gov;
    }

    function withdrawFees(address _token, address _receiver) external returns (uint256) {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        IERC20(_token).safeTransfer(_receiver, balance);
        return balance;
    }

    function feeReserves(address feeToken) external view returns (uint256) {
        uint256 balance = IERC20(feeToken).balanceOf(address(this));
        return balance;
    }
}
