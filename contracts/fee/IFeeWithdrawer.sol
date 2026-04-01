// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IFeeWithdrawer {
    function withdrawFees(address token) external;
    function withdrawableAmount(address token) external view returns (uint256);
    function amountFactor(address token) external view returns (uint256);
    function withdrawTarget() external view returns (address);
}
