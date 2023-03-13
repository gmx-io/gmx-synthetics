// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter.sol";
import "../event/EventUtils.sol";
import "../utils/Cast.sol";

import "./Position.sol";
import "./PositionUtils.sol";
import "../pricing/PositionPricingUtils.sol";

library PositionEventUtils {
    using Position for Position.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    struct PositionIncreaseParams {
        EventEmitter eventEmitter;
        bytes32 orderKey;
        bytes32 positionKey;
        Position.Props position;
        uint256 executionPrice;
        uint256 sizeDeltaUsd;
        uint256 sizeDeltaInTokens;
        int256 collateralDeltaAmount;
        int256 priceImpactAmount;
        Order.OrderType orderType;
    }

    function emitPositionIncrease(PositionIncreaseParams memory params) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "account", params.position.account());
        eventData.addressItems.setItem(1, "market", params.position.market());
        eventData.addressItems.setItem(2, "collateralToken", params.position.collateralToken());

        eventData.uintItems.initItems(8);
        eventData.uintItems.setItem(0, "sizeInUsd", params.position.sizeInUsd());
        eventData.uintItems.setItem(1, "sizeInTokens", params.position.sizeInTokens());
        eventData.uintItems.setItem(2, "collateralAmount", params.position.collateralAmount());
        eventData.uintItems.setItem(3, "borrowingFactor", params.position.borrowingFactor());
        eventData.uintItems.setItem(4, "executionPrice", params.executionPrice);
        eventData.uintItems.setItem(5, "sizeDeltaUsd", params.sizeDeltaUsd);
        eventData.uintItems.setItem(6, "sizeDeltaInTokens", params.sizeDeltaInTokens);
        eventData.uintItems.setItem(7, "orderType", uint256(params.orderType));

        eventData.intItems.initItems(4);
        eventData.intItems.setItem(0, "longTokenFundingAmountPerSize", params.position.longTokenFundingAmountPerSize());
        eventData.intItems.setItem(1, "shortTokenFundingAmountPerSize", params.position.shortTokenFundingAmountPerSize());
        eventData.intItems.setItem(2, "collateralDeltaAmount", params.collateralDeltaAmount);
        eventData.intItems.setItem(3, "priceImpactAmount", params.priceImpactAmount);

        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "isLong", params.position.isLong());

        eventData.bytes32Items.initItems(2);
        eventData.bytes32Items.setItem(0, "orderKey", params.orderKey);
        eventData.bytes32Items.setItem(1, "positionKey", params.positionKey);

        params.eventEmitter.emitEventLog1(
            "PositionIncrease",
            Cast.toBytes32(params.position.account()),
            eventData
        );
    }

    function emitPositionDecrease(
        EventEmitter eventEmitter,
        bytes32 orderKey,
        bytes32 positionKey,
        Position.Props memory position,
        uint256 sizeDeltaUsd,
        uint256 collateralDeltaAmount,
        Order.OrderType orderType,
        PositionUtils.DecreasePositionCollateralValues memory values
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "account", position.account());
        eventData.addressItems.setItem(1, "market", position.market());
        eventData.addressItems.setItem(2, "collateralToken", position.collateralToken());

        eventData.uintItems.initItems(12);
        eventData.uintItems.setItem(0, "sizeInUsd", position.sizeInUsd());
        eventData.uintItems.setItem(1, "sizeInTokens", position.sizeInTokens());
        eventData.uintItems.setItem(2, "collateralAmount", position.collateralAmount());
        eventData.uintItems.setItem(3, "borrowingFactor", position.borrowingFactor());
        eventData.uintItems.setItem(6, "executionPrice", values.executionPrice);
        eventData.uintItems.setItem(7, "sizeDeltaUsd", sizeDeltaUsd);
        eventData.uintItems.setItem(8, "sizeDeltaInTokens", values.sizeDeltaInTokens);
        eventData.uintItems.setItem(9, "collateralDeltaAmount", collateralDeltaAmount);
        eventData.uintItems.setItem(10, "priceImpactDiffUsd", values.priceImpactDiffUsd);
        eventData.uintItems.setItem(11, "orderType", uint256(orderType));

        eventData.intItems.initItems(4);
        eventData.intItems.setItem(0, "longTokenFundingAmountPerSize", position.longTokenFundingAmountPerSize());
        eventData.intItems.setItem(1, "shortTokenFundingAmountPerSize", position.shortTokenFundingAmountPerSize());
        eventData.intItems.setItem(2, "priceImpactAmount", values.priceImpactAmount);
        eventData.intItems.setItem(3, "pnlUsd", values.positionPnlUsd);

        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "isLong", position.isLong());

        eventData.bytes32Items.initItems(2);
        eventData.bytes32Items.setItem(0, "orderKey", orderKey);
        eventData.bytes32Items.setItem(1, "positionKey", positionKey);

        eventEmitter.emitEventLog1(
            "PositionDecrease",
            Cast.toBytes32(position.account()),
            eventData
        );
    }

    function emitLiquidationInfo(
        EventEmitter eventEmitter,
        bytes32 orderKey,
        uint256 positionCollateralAmount,
        int256 positionPnlUsd,
        int256 remainingCollateralAmount
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "orderKey", orderKey);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "positionCollateralAmount", positionCollateralAmount);

        eventData.intItems.initItems(2);
        eventData.intItems.setItem(0, "positionPnlUsd", positionPnlUsd);
        eventData.intItems.setItem(1, "remainingCollateralAmount", remainingCollateralAmount);

        eventEmitter.emitEventLog(
            "LiquidationInfo",
            eventData
        );
    }

    function emitInsufficientFundingFeePayment(
        EventEmitter eventEmitter,
        address market,
        address collateralToken,
        uint256 fundingFeeAmount,
        uint256 collateralAmount
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "collateralToken", collateralToken);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "fundingFeeAmount", fundingFeeAmount);
        eventData.uintItems.setItem(1, "collateralAmount", collateralAmount);

        eventEmitter.emitEventLog1(
            "InsufficientFundingFeePayment",
            Cast.toBytes32(market),
            eventData
        );
    }

    function emitPositionFeesCollected(
        EventEmitter eventEmitter,
        bytes32 orderKey,
        address market,
        address collateralToken,
        uint256 tradeSizeUsd,
        bool isIncrease,
        PositionPricingUtils.PositionFees memory fees
    ) external {
        _emitPositionFees(
            eventEmitter,
            orderKey,
            market,
            collateralToken,
            tradeSizeUsd,
            isIncrease,
            fees,
            "PositionFeesCollected"
        );
    }

    function emitPositionFeesInfo(
        EventEmitter eventEmitter,
        bytes32 orderKey,
        address market,
        address collateralToken,
        uint256 tradeSizeUsd,
        bool isIncrease,
        PositionPricingUtils.PositionFees memory fees
    ) external {
        _emitPositionFees(
            eventEmitter,
            orderKey,
            market,
            collateralToken,
            tradeSizeUsd,
            isIncrease,
            fees,
            "PositionFeesInfo"
        );
    }

    function _emitPositionFees(
        EventEmitter eventEmitter,
        bytes32 orderKey,
        address market,
        address collateralToken,
        uint256 tradeSizeUsd,
        bool isIncrease,
        PositionPricingUtils.PositionFees memory fees,
        string memory eventName
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.bytes32Items.initItems(2);
        eventData.bytes32Items.setItem(0, "orderKey", orderKey);
        eventData.bytes32Items.setItem(1, "referralCode", fees.referral.referralCode);

        eventData.addressItems.initItems(4);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "collateralToken", collateralToken);
        eventData.addressItems.setItem(2, "affiliate", fees.referral.affiliate);
        eventData.addressItems.setItem(3, "trader", fees.referral.trader);

        eventData.uintItems.initItems(23);
        eventData.uintItems.setItem(0, "collateralTokenPrice.min", fees.collateralTokenPrice.min);
        eventData.uintItems.setItem(1, "collateralTokenPrice.max", fees.collateralTokenPrice.max);
        eventData.uintItems.setItem(2, "tradeSizeUsd", tradeSizeUsd);
        eventData.uintItems.setItem(3, "totalRebateFactor", fees.referral.totalRebateFactor);
        eventData.uintItems.setItem(4, "traderDiscountFactor", fees.referral.traderDiscountFactor);
        eventData.uintItems.setItem(5, "totalRebateAmount", fees.referral.totalRebateAmount);
        eventData.uintItems.setItem(6, "traderDiscountAmount", fees.referral.traderDiscountAmount);
        eventData.uintItems.setItem(7, "affiliateRewardAmount", fees.referral.affiliateRewardAmount);
        eventData.uintItems.setItem(8, "fundingFeeAmount", fees.funding.fundingFeeAmount);
        eventData.uintItems.setItem(9, "claimableLongTokenAmount", fees.funding.claimableLongTokenAmount);
        eventData.uintItems.setItem(10, "claimableShortTokenAmount", fees.funding.claimableShortTokenAmount);
        eventData.uintItems.setItem(11, "borrowingFeeAmount", fees.borrowing.borrowingFeeAmount);
        eventData.uintItems.setItem(12, "borrowingFeeReceiverFactor", fees.borrowing.borrowingFeeReceiverFactor);
        eventData.uintItems.setItem(13, "borrowingFeeAmountForFeeReceiver", fees.borrowing.borrowingFeeAmountForFeeReceiver);
        eventData.uintItems.setItem(14, "positionFeeFactor", fees.positionFeeFactor);
        eventData.uintItems.setItem(15, "protocolFeeAmount", fees.protocolFeeAmount);
        eventData.uintItems.setItem(16, "positionFeeReceiverFactor", fees.positionFeeReceiverFactor);
        eventData.uintItems.setItem(17, "feeReceiverAmount", fees.feeReceiverAmount);
        eventData.uintItems.setItem(18, "feeAmountForPool", fees.feeAmountForPool);
        eventData.uintItems.setItem(19, "positionFeeAmountForPool", fees.positionFeeAmountForPool);
        eventData.uintItems.setItem(20, "positionFeeAmount", fees.positionFeeAmount);
        eventData.uintItems.setItem(21, "totalNetCostAmount", fees.totalNetCostAmount);
        eventData.uintItems.setItem(22, "totalNetCostUsd", fees.totalNetCostUsd);

        eventData.intItems.initItems(2);
        eventData.intItems.setItem(0, "latestLongTokenFundingAmountPerSize", fees.funding.latestLongTokenFundingAmountPerSize);
        eventData.intItems.setItem(1, "latestShortTokenFundingAmountPerSize", fees.funding.latestShortTokenFundingAmountPerSize);

        eventData.boolItems.initItems(3);
        eventData.boolItems.setItem(0, "hasPendingLongTokenFundingFee", fees.funding.hasPendingLongTokenFundingFee);
        eventData.boolItems.setItem(1, "hasPendingShortTokenFundingFee", fees.funding.hasPendingShortTokenFundingFee);
        eventData.boolItems.setItem(2, "isIncrease", isIncrease);

        eventEmitter.emitEventLog1(
            eventName,
            Cast.toBytes32(market),
            eventData
        );
    }
}
