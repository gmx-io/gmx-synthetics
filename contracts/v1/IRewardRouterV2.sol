// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IRewardRouterV2 {
    function gmx() external view returns (address);
    function esGmx() external view returns (address);
    function bnGmx() external view returns (address);
    function weth() external view returns (address);
    function stakedGmxTracker() external view returns (address);
    function bonusGmxTracker() external view returns (address);
    function extendedGmxTracker() external view returns (address);
    function feeGmxTracker() external view returns (address);
    function gmxVester() external view returns (address);
    function glpVester() external view returns (address);
    function govToken() external view returns (address);
    function inStrictTransferMode() external view returns (bool);

    function stakeGmx(uint256 _amount) external;
    function unstakeGmx(uint256 _amount) external;
    function stakeEsGmx(uint256 _amount) external;
    function unstakeEsGmx(uint256 _amount) external;
    function handleRewards(
        bool _shouldClaimGmx,
        bool _shouldStakeGmx,
        bool _shouldClaimEsGmx,
        bool _shouldStakeEsGmx,
        bool _shouldStakeMultiplierPoints,
        bool _shouldClaimWeth,
        bool _shouldConvertWethToEth
    ) external;
    function compound() external;
    function claim() external;
    function claimEsGmx() external;
    function claimFees() external;
    function signalTransfer(address _receiver) external;
    function acceptTransfer(address _sender) external;
}
