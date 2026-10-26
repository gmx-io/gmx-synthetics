// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IEsGmxIssuer {
    function vester() external view returns (address);
    function totalIssuedAmount() external view returns (uint256);
    function totalClaimedAmount() external view returns (uint256);
    function issuedAmounts(address account) external view returns (uint256);
    function claimable(address account) external view returns (uint256);
    function claimForAccount(address account) external returns (uint256);
    function claimAmountForAccount(address account, uint256 amount) external returns (uint256);
}
