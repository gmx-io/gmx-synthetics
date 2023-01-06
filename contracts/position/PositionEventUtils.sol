// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter.sol";
import "../event/EventUtils.sol";
import "../utils/Cast.sol";

import "./Position.sol";

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
        Order.OrderType orderType
    ) external {
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(3);
        data.addressItems.setItem(0, "account", position.account());
        data.addressItems.setItem(1, "market", position.market());
        data.addressItems.setItem(2, "collateralToken", position.collateralToken());

        data.uintItems.initItems(10);
        data.uintItems.setItem(0, "sizeInUsd", position.sizeInUsd());
        data.uintItems.setItem(1, "sizeInTokens", position.sizeInTokens());
        data.uintItems.setItem(2, "collateralAmount", position.collateralAmount());
        data.uintItems.setItem(3, "borrowingFactor", position.borrowingFactor());
        data.uintItems.setItem(4, "longTokenFundingAmountPerSize", position.longTokenFundingAmountPerSize());
        data.uintItems.setItem(5, "shortTokenFundingAmountPerSize", position.shortTokenFundingAmountPerSize());
        data.uintItems.setItem(6, "executionPrice", executionPrice);
        data.uintItems.setItem(7, "sizeDeltaUsd", sizeDeltaUsd);
        data.uintItems.setItem(8, "sizeDeltaInTokens", sizeDeltaInTokens);
        data.uintItems.setItem(9, "orderType", uint256(orderType));

        data.intItems.initItems(1);
        data.intItems.setItem(0, "collateralDeltaAmount", collateralDeltaAmount);

        data.boolItems.initItems(1);
        data.boolItems.setItem(0, "isLong", position.isLong());

        data.bytes32Items.initItems(1);
        data.bytes32Items.setItem(0, "positionKey", positionKey);

        eventEmitter.emitEventLog1(
            "PositionIncrease",
            Cast.toBytes32(position.account()),
            data
        );
    }

    function emitPositionDecrease(
        EventEmitter eventEmitter,
        bytes32 positionKey,
        Position.Props memory position,
        uint256 executionPrice,
        uint256 sizeDeltaUsd,
        uint256 sizeDeltaInTokens,
        int256 collateralDeltaAmount,
        int256 pnlAmount,
        Order.OrderType orderType
    ) external {
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(3);
        data.addressItems.setItem(0, "account", position.account());
        data.addressItems.setItem(1, "market", position.market());
        data.addressItems.setItem(2, "collateralToken", position.collateralToken());

        data.uintItems.initItems(10);
        data.uintItems.setItem(0, "sizeInUsd", position.sizeInUsd());
        data.uintItems.setItem(1, "sizeInTokens", position.sizeInTokens());
        data.uintItems.setItem(2, "collateralAmount", position.collateralAmount());
        data.uintItems.setItem(3, "borrowingFactor", position.borrowingFactor());
        data.uintItems.setItem(4, "longTokenFundingAmountPerSize", position.longTokenFundingAmountPerSize());
        data.uintItems.setItem(5, "shortTokenFundingAmountPerSize", position.shortTokenFundingAmountPerSize());
        data.uintItems.setItem(6, "executionPrice", executionPrice);
        data.uintItems.setItem(7, "sizeDeltaUsd", sizeDeltaUsd);
        data.uintItems.setItem(8, "sizeDeltaInTokens", sizeDeltaInTokens);
        data.uintItems.setItem(9, "orderType", uint256(orderType));

        data.intItems.initItems(2);
        data.intItems.setItem(0, "collateralDeltaAmount", collateralDeltaAmount);
        data.intItems.setItem(1, "pnlAmount", pnlAmount);

        data.boolItems.initItems(1);
        data.boolItems.setItem(0, "isLong", position.isLong());

        data.bytes32Items.initItems(1);
        data.bytes32Items.setItem(0, "positionKey", positionKey);

        eventEmitter.emitEventLog1(
            "PositionDecrease",
            Cast.toBytes32(position.account()),
            data
        );
    }

}
