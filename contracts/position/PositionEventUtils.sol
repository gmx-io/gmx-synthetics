// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter.sol";
import "../event/EventUtils.sol";
import "../utils/Cast.sol";

import "./Position.sol";
import "./PositionUtils.sol";

library PositionEventUtils {
    using Position for Position.Props;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    function emitPositionIncrease(
        EventEmitter eventEmitter,
        bytes32 positionKey,
        Position.Props memory position,
        uint256 executionPrice,
        uint256 sizeDeltaUsd,
        uint256 sizeDeltaInTokens,
        int256 collateralDeltaAmount,
        int256 priceImpactAmount,
        Order.OrderType orderType
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "account", position.account());
        eventData.addressItems.setItem(1, "market", position.market());
        eventData.addressItems.setItem(2, "collateralToken", position.collateralToken());

        eventData.uintItems.initItems(8);
        eventData.uintItems.setItem(0, "sizeInUsd", position.sizeInUsd());
        eventData.uintItems.setItem(1, "sizeInTokens", position.sizeInTokens());
        eventData.uintItems.setItem(2, "collateralAmount", position.collateralAmount());
        eventData.uintItems.setItem(3, "borrowingFactor", position.borrowingFactor());
        eventData.uintItems.setItem(4, "executionPrice", executionPrice);
        eventData.uintItems.setItem(5, "sizeDeltaUsd", sizeDeltaUsd);
        eventData.uintItems.setItem(6, "sizeDeltaInTokens", sizeDeltaInTokens);
        eventData.uintItems.setItem(7, "orderType", uint256(orderType));

        eventData.intItems.initItems(4);
        eventData.intItems.setItem(0, "longTokenFundingAmountPerSize", position.longTokenFundingAmountPerSize());
        eventData.intItems.setItem(1, "shortTokenFundingAmountPerSize", position.shortTokenFundingAmountPerSize());
        eventData.intItems.setItem(2, "collateralDeltaAmount", collateralDeltaAmount);
        eventData.intItems.setItem(3, "priceImpactAmount", priceImpactAmount);

        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "isLong", position.isLong());

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "positionKey", positionKey);

        eventEmitter.emitEventLog1(
            "PositionIncrease",
            Cast.toBytes32(position.account()),
            eventData
        );
    }

    function emitPositionDecrease(
        EventEmitter eventEmitter,
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

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "positionKey", positionKey);

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
}
