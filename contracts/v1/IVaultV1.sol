// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IVaultV1 {
    function allWhitelistedTokensLength() external view returns (uint256);
    function allWhitelistedTokens(uint256) external view returns (address);
    function gov() external view returns (address);
    function feeReserves(address feeToken) external view returns (uint256);
    function withdrawFees(address _token, address _receiver) external returns (uint256);
    function getMaxPrice(address _token) external returns (uint256);
}
