// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockFeeWithdrawer {
    using SafeERC20 for IERC20;

    address public immutable feeDistributorVault;

    constructor(address _feeDistributorVault) {
        feeDistributorVault = _feeDistributorVault;
    }

    function withdrawFees(address buybackToken) external {
        uint256 amount = IERC20(buybackToken).balanceOf(address(this));
        IERC20(buybackToken).safeTransfer(feeDistributorVault, amount);
    }
}
