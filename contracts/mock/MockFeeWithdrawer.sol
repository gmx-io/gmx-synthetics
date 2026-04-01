// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../fee/IFeeWithdrawer.sol";

contract MockFeeWithdrawer is IFeeWithdrawer {
    using SafeERC20 for IERC20;

    address public immutable feeDistributorVault;

    mapping(address => uint256) public withdrawableAmountPerToken;
    mapping(address => uint256) public amountFactorPerToken;

    constructor(address _feeDistributorVault) {
        feeDistributorVault = _feeDistributorVault;
    }

    function setWithdrawableAmount(address token, uint256 amount) external {
        withdrawableAmountPerToken[token] = amount;
    }

    function setAmountFactor(address token, uint256 factor) external {
        amountFactorPerToken[token] = factor;
    }

    function withdrawFees(address token) external {
        uint256 amount = withdrawableAmountPerToken[token];
        IERC20(token).safeTransfer(feeDistributorVault, amount);
    }

    function withdrawableAmount(address token) external view returns (uint256) {
        return withdrawableAmountPerToken[token];
    }

    function amountFactor(address token) external view returns (uint256) {
        return amountFactorPerToken[token];
    }

    function withdrawTarget() external view returns (address) {
        return feeDistributorVault;
    }
}
