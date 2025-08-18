// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../event/EventEmitter.sol";
import "../utils/Cast.sol";
import "../utils/Precision.sol";
import "../market/MarketUtils.sol";

library ConfigUtils {
    using SafeCast for int256;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BoolItems;

    struct InitOracleConfigPriceFeedParams {
        address feedAddress;
        uint256 multiplier;
        uint256 heartbeatDuration;
        uint256 stablePrice;
    }

    struct InitOracleConfigDataStreamParams {
        bytes32 feedId;
        uint256 multiplier;
        uint256 spreadReductionFactor;
    }

    struct InitOracleConfigEdgeParams {
        bytes32 feedId;
        uint256 tokenDecimals;
    }

    struct InitOracleConfigParams {
        address token;
        InitOracleConfigPriceFeedParams priceFeed;
        InitOracleConfigDataStreamParams dataStream;
        InitOracleConfigEdgeParams edge;
    }

    // 0.00001% per second, ~315% per year
    uint256 public constant MAX_ALLOWED_MAX_FUNDING_FACTOR_PER_SECOND = 100000000000000000000000;
    // at this rate max allowed funding rate will be reached in 1 hour at 100% imbalance if max funding rate is 315%
    uint256 public constant MAX_ALLOWED_FUNDING_INCREASE_FACTOR_PER_SECOND = MAX_ALLOWED_MAX_FUNDING_FACTOR_PER_SECOND / 1 hours;
    // at this rate zero funding rate will be reached in 24 hours if max funding rate is 315%
    uint256 public constant MAX_ALLOWED_FUNDING_DECREASE_FACTOR_PER_SECOND = MAX_ALLOWED_MAX_FUNDING_FACTOR_PER_SECOND / 24 hours;
    // minimum duration required to fully distribute the position impact pool amount
    uint256 public constant MIN_POSITION_IMPACT_POOL_DISTRIBUTION_TIME = 7 days;

    // only allow initializing oracle config if there is no config set for any oracle provider
    // this is to prevent a malicious config keeper from misconfiguring an oracle provider for
    // a token then updating the token's oracle provider to the misconfigured provider
    // if updating of oracle config is needed for a token that already has an oracle config
    // the TimelockConfig should be used instead
    function initOracleConfig(
        DataStore dataStore,
        EventEmitter eventEmitter,
        InitOracleConfigParams memory params
    ) external {
        if (dataStore.getAddress(Keys.priceFeedKey(params.token)) != address(0)) {
            revert Errors.PriceFeedAlreadyExistsForToken(params.token);
        }

        if (dataStore.getBytes32(Keys.dataStreamIdKey(params.token)) != bytes32(0)) {
            revert Errors.DataStreamIdAlreadyExistsForToken(params.token);
        }

        if (dataStore.getBytes32(Keys.edgeDataStreamIdKey(params.token)) != bytes32(0)) {
            revert Errors.EdgeDataStreamIdAlreadyExistsForToken(params.token);
        }

        dataStore.setAddress(Keys.priceFeedKey(params.token), params.priceFeed.feedAddress);
        dataStore.setUint(Keys.priceFeedMultiplierKey(params.token), params.priceFeed.multiplier);
        dataStore.setUint(Keys.priceFeedHeartbeatDurationKey(params.token), params.priceFeed.heartbeatDuration);
        dataStore.setUint(Keys.stablePriceKey(params.token), params.priceFeed.stablePrice);

        validateRange(
            dataStore,
            Keys.DATA_STREAM_SPREAD_REDUCTION_FACTOR,
            abi.encode(params.token),
            params.dataStream.spreadReductionFactor
        );

        dataStore.setBytes32(Keys.dataStreamIdKey(params.token), params.dataStream.feedId);
        dataStore.setUint(Keys.dataStreamMultiplierKey(params.token), params.dataStream.multiplier);
        dataStore.setUint(Keys.dataStreamSpreadReductionFactorKey(params.token), params.dataStream.spreadReductionFactor);

        dataStore.setBytes32(Keys.edgeDataStreamIdKey(params.token), params.edge.feedId);
        dataStore.setUint(Keys.edgeDataStreamTokenDecimalsKey(params.token), params.edge.tokenDecimals);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "token", params.token);
        eventData.addressItems.setItem(1, "priceFeedAddress", params.priceFeed.feedAddress);

        eventData.uintItems.initItems(6);
        eventData.uintItems.setItem(0, "priceFeedMultiplier", params.priceFeed.multiplier);
        eventData.uintItems.setItem(1, "priceFeedHeartbeatDuration", params.priceFeed.heartbeatDuration);
        eventData.uintItems.setItem(2, "stablePrice", params.priceFeed.stablePrice);
        eventData.uintItems.setItem(3, "dataStreamMultiplier", params.dataStream.multiplier);
        eventData.uintItems.setItem(4, "dataStreamSpreadReductionFactor", params.dataStream.spreadReductionFactor);
        eventData.uintItems.setItem(5, "edgeDataStreamTokenDecimals", params.edge.tokenDecimals);

        eventData.bytes32Items.initItems(2);
        eventData.bytes32Items.setItem(0, "dataStreamFeedId", params.dataStream.feedId);
        eventData.bytes32Items.setItem(1, "edgeDataStreamId", params.edge.feedId);

        eventEmitter.emitEventLog1(
            "InitOracleConfig",
            Cast.toBytes32(params.token),
            eventData
        );
    }

    function setClaimableCollateralFactorForTime(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        uint256 timeKey,
        uint256 factor
    ) external {
        if (factor > Precision.FLOAT_PRECISION) { revert Errors.InvalidClaimableFactor(factor); }

        bytes32 key = Keys.claimableCollateralFactorKey(market, token, timeKey);
        dataStore.setUint(key, factor);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "timeKey", timeKey);
        eventData.uintItems.setItem(1, "factor", factor);

        eventEmitter.emitEventLog2(
            "SetClaimableCollateralFactorForTime",
            Cast.toBytes32(market),
            Cast.toBytes32(token),
            eventData
        );
    }

    function setClaimableCollateralFactorForAccount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        uint256 timeKey,
        address account,
        uint256 factor
    ) external {
        if (factor > Precision.FLOAT_PRECISION) { revert Errors.InvalidClaimableFactor(factor); }

        bytes32 key = Keys.claimableCollateralFactorKey(market, token, timeKey, account);
        dataStore.setUint(key, factor);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "account", account);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "timeKey", timeKey);
        eventData.uintItems.setItem(1, "factor", factor);

        eventEmitter.emitEventLog2(
            "SetClaimableCollateralFactorForAccount",
            Cast.toBytes32(market),
            Cast.toBytes32(token),
            eventData
        );
    }

    function setClaimableCollateralReductionFactorForAccount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        uint256 timeKey,
        address account,
        uint256 factor
    ) external {
        if (factor > Precision.FLOAT_PRECISION) { revert Errors.InvalidClaimableReductionFactor(factor); }

        bytes32 key = Keys.claimableCollateralReductionFactorKey(market, token, timeKey, account);
        dataStore.setUint(key, factor);

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "account", account);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "timeKey", timeKey);
        eventData.uintItems.setItem(1, "factor", factor);

        eventEmitter.emitEventLog2(
            "SetClaimableCollateralReductionFactorForAccount",
            Cast.toBytes32(market),
            Cast.toBytes32(token),
            eventData
        );
    }

    function setPositionImpactDistributionRate(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        uint256 minPositionImpactPoolAmount,
        uint256 positionImpactPoolDistributionRate
    ) external {
        MarketUtils.distributePositionImpactPool(dataStore, eventEmitter, market);

        // Ensure the full positionImpactPoolAmount cannot be distributed in less then the minimum required time
        uint256 positionImpactPoolAmount = MarketUtils.getPositionImpactPoolAmount(dataStore, market);
        // positionImpactPoolDistributionRate has FLOAT_PRECISION, distributionAmount has WEI_PRECISION
        uint256 distributionAmount = Precision.applyFactor(MIN_POSITION_IMPACT_POOL_DISTRIBUTION_TIME, positionImpactPoolDistributionRate);
        if (positionImpactPoolAmount > 0) {
            if (distributionAmount >= positionImpactPoolAmount) {
                revert Errors.InvalidPositionImpactPoolDistributionRate(distributionAmount, positionImpactPoolAmount);
            }
        }

        dataStore.setUint(Keys.minPositionImpactPoolAmountKey(market), minPositionImpactPoolAmount);
        dataStore.setUint(Keys.positionImpactPoolDistributionRateKey(market), positionImpactPoolDistributionRate);

        dataStore.setUint(Keys.positionImpactPoolDistributedAtKey(market), Chain.currentTimestamp());

        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "market", market);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "minPositionImpactPoolAmount", minPositionImpactPoolAmount);
        eventData.uintItems.setItem(1, "positionImpactPoolDistributionRate", positionImpactPoolDistributionRate);

        eventEmitter.emitEventLog1(
            "SetPositionImpactPoolDistributionRate",
            Cast.toBytes32(market),
            eventData
        );
    }

    // @dev validate that the value is within the allowed range
    // @param baseKey the base key for the value
    // @param value the value to be set
    function validateRange(
        DataStore dataStore,
        bytes32 baseKey,
        bytes memory data,
        uint256 value
    ) public view {
        if (
            baseKey == Keys.SEQUENCER_GRACE_DURATION
        ) {
            if (value > 2 hours) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.CLAIMABLE_COLLATERAL_DELAY
        ) {
            if (value < 24 hours) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.MAX_FUNDING_FACTOR_PER_SECOND
        ) {
            if (value > MAX_ALLOWED_MAX_FUNDING_FACTOR_PER_SECOND) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }

            bytes32 minFundingFactorPerSecondKey = Keys.getFullKey(Keys.MIN_FUNDING_FACTOR_PER_SECOND, data);
            uint256 minFundingFactorPerSecond = dataStore.getUint(minFundingFactorPerSecondKey);
            if (value < minFundingFactorPerSecond) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.MIN_FUNDING_FACTOR_PER_SECOND
        ) {
            bytes32 maxFundingFactorPerSecondKey = Keys.getFullKey(Keys.MAX_FUNDING_FACTOR_PER_SECOND, data);
            uint256 maxFundingFactorPerSecond = dataStore.getUint(maxFundingFactorPerSecondKey);
            if (value > maxFundingFactorPerSecond) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.FUNDING_INCREASE_FACTOR_PER_SECOND
        ) {
            if (value > MAX_ALLOWED_FUNDING_INCREASE_FACTOR_PER_SECOND) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.FUNDING_DECREASE_FACTOR_PER_SECOND
        ) {
            if (value > MAX_ALLOWED_FUNDING_DECREASE_FACTOR_PER_SECOND) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.BORROWING_FACTOR ||
            baseKey == Keys.BASE_BORROWING_FACTOR
        ) {
            // 0.000005% per second, ~157% per year at 100% utilization
            if (value > 50000000000000000000000) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (baseKey == Keys.ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR) {
            // 0.00001% per second, ~315% per year at 100% utilization
            if (value > 100000000000000000000000) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.FUNDING_EXPONENT_FACTOR ||
            baseKey == Keys.BORROWING_EXPONENT_FACTOR
        ) {
            // revert if value > 2
            if (value > 2 * Precision.FLOAT_PRECISION) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.POSITION_IMPACT_EXPONENT_FACTOR ||
            baseKey == Keys.SWAP_IMPACT_EXPONENT_FACTOR
        ) {
            // revert if value > 3
            if (value > 3 * Precision.FLOAT_PRECISION) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.FUNDING_FACTOR ||
            baseKey == Keys.BORROWING_FACTOR ||
            baseKey == Keys.FUNDING_INCREASE_FACTOR_PER_SECOND ||
            baseKey == Keys.FUNDING_DECREASE_FACTOR_PER_SECOND ||
            baseKey == Keys.MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION
        ) {
            // revert if value > 1%
            if (value > 1 * Precision.FLOAT_PRECISION / 100) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.SWAP_FEE_FACTOR ||
            baseKey == Keys.DEPOSIT_FEE_FACTOR ||
            baseKey == Keys.WITHDRAWAL_FEE_FACTOR ||
            baseKey == Keys.POSITION_FEE_FACTOR ||
            baseKey == Keys.MAX_UI_FEE_FACTOR ||
            baseKey == Keys.ATOMIC_SWAP_FEE_FACTOR ||
            baseKey == Keys.ATOMIC_WITHDRAWAL_FEE_FACTOR ||
            baseKey == Keys.BUYBACK_MAX_PRICE_IMPACT_FACTOR ||
            baseKey == Keys.MIN_COLLATERAL_FACTOR
        ) {
            // revert if value > 5%
            if (value > 5 * Precision.FLOAT_PRECISION / 100) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.MAX_LENDABLE_IMPACT_FACTOR ||
            baseKey == Keys.MAX_LENDABLE_IMPACT_FACTOR_FOR_WITHDRAWALS
        ) {
            // revert if value > 10%
            if (value > 10 * Precision.FLOAT_PRECISION / 100) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.MAX_LENDABLE_IMPACT_USD
        ) {
            // revert if value > 50,000
            if (value > 50 * 1000 * Precision.FLOAT_PRECISION) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (baseKey == Keys.LIQUIDATION_FEE_FACTOR) {
            // revert if value > 1%
            if (value > Precision.FLOAT_PRECISION / 100) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (baseKey == Keys.MIN_COLLATERAL_USD) {
            // revert if value > 10 USD
            if (value > 10 * Precision.FLOAT_PRECISION) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.POSITION_FEE_RECEIVER_FACTOR ||
            baseKey == Keys.SWAP_FEE_RECEIVER_FACTOR ||
            baseKey == Keys.BORROWING_FEE_RECEIVER_FACTOR ||
            baseKey == Keys.LIQUIDATION_FEE_RECEIVER_FACTOR ||
            baseKey == Keys.MAX_PNL_FACTOR ||
            baseKey == Keys.MIN_PNL_FACTOR_AFTER_ADL ||
            baseKey == Keys.OPTIMAL_USAGE_FACTOR ||
            baseKey == Keys.PRO_DISCOUNT_FACTOR ||
            baseKey == Keys.BUYBACK_GMX_FACTOR ||
            baseKey == Keys.DATA_STREAM_SPREAD_REDUCTION_FACTOR
        ) {
            // revert if value > 100%
            if (value > Precision.FLOAT_PRECISION) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (baseKey == Keys.MAX_EXECUTION_FEE_MULTIPLIER_FACTOR) {
            if (value < Precision.FLOAT_PRECISION * 10 || value > Precision.FLOAT_PRECISION * 100_000) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }

        if (
            baseKey == Keys.RESERVE_FACTOR ||
            baseKey == Keys.OPEN_INTEREST_RESERVE_FACTOR
        ) {
            // revert if value > 10
            if (value > 10 * Precision.FLOAT_PRECISION) {
                revert Errors.ConfigValueExceedsAllowedRange(baseKey, value);
            }
        }
    }
}
