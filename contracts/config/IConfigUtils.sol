// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";

interface IConfigUtils {
    function setPriceFeed(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address token,
        address priceFeed,
        uint256 priceFeedMultiplier,
        uint256 priceFeedHeartbeatDuration,
        uint256 stablePrice
    ) external;

    function setDataStream(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address token,
        bytes32 feedId,
        uint256 dataStreamMultiplier,
        uint256 dataStreamSpreadReductionFactor,
        uint256 maxAllowedMaxFundingFactorPerSecond,
        uint256 maxAllowedFundingIncreaseFactorPerSecond,
        uint256 maxAllowedFundingDecreaseFactorPerSecond
    ) external;

    function setClaimableCollateralFactorForTime(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        uint256 timeKey,
        uint256 factor
    ) external;

    function setClaimableCollateralFactorForAccount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        uint256 timeKey,
        address account,
        uint256 factor
    ) external;

    function setPositionImpactDistributionRate(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        uint256 minPositionImpactPoolAmount,
        uint256 positionImpactPoolDistributionRate,
        uint256 minPositionImpactPoolDistributionTime
    ) external;

    function validateRange(
        DataStore dataStore,
        bytes32 baseKey,
        bytes memory data,
        uint256 value,
        uint256 maxAllowedMaxFundingFactorPerSecond,
        uint256 maxAllowedFundingIncreaseFactorPerSecond,
        uint256 maxAllowedFundingDecreaseFactorPerSecond
    ) external;
}
