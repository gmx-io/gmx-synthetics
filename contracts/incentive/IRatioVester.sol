// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IRatioVester {
    function issuer() external view returns (address);
    function isFrozen(address account) external view returns (bool);
    function pairAmounts(address account) external view returns (uint256);
    function getVestingCap(address account) external view returns (uint256);
    function claimable(address account) external view returns (uint256);
    function hasOpenSession(address account) external view returns (bool);
    function isFreshForTransfer(address account) external view returns (bool);
    function isDrainedForRemoval() external view returns (bool);
    function validateTransfersOpen() external view;
    function depositForAccount(address account, uint256 amount) external;
    function withdrawForAccount(address account) external;
    function claimForAccount(address account) external returns (uint256);
    function transferVestingState(address sender, address receiver) external;
}
