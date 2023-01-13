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

        data.uintItems.initItems(8);
        data.uintItems.setItem(0, "sizeInUsd", position.sizeInUsd());
        data.uintItems.setItem(1, "sizeInTokens", position.sizeInTokens());
        data.uintItems.setItem(2, "collateralAmount", position.collateralAmount());
        data.uintItems.setItem(3, "borrowingFactor", position.borrowingFactor());
        data.uintItems.setItem(4, "executionPrice", executionPrice);
        data.uintItems.setItem(5, "sizeDeltaUsd", sizeDeltaUsd);
        data.uintItems.setItem(6, "sizeDeltaInTokens", sizeDeltaInTokens);
        data.uintItems.setItem(7, "orderType", uint256(orderType));

        data.intItems.initItems(3);
        data.intItems.setItem(0, "longTokenFundingAmountPerSize", position.longTokenFundingAmountPerSize());
        data.intItems.setItem(1, "shortTokenFundingAmountPerSize", position.shortTokenFundingAmountPerSize());
        data.intItems.setItem(2, "collateralDeltaAmount", collateralDeltaAmount);

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
        uint256 collateralDeltaAmount,
        int256 pnlUsd,
        Order.OrderType orderType
    ) external {
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(3);
        data.addressItems.setItem(0, "account", position.account());
        data.addressItems.setItem(1, "market", position.market());
        data.addressItems.setItem(2, "collateralToken", position.collateralToken());

        data.uintItems.initItems(11);
        data.uintItems.setItem(0, "sizeInUsd", position.sizeInUsd());
        data.uintItems.setItem(1, "sizeInTokens", position.sizeInTokens());
        data.uintItems.setItem(2, "collateralAmount", position.collateralAmount());
        data.uintItems.setItem(3, "borrowingFactor", position.borrowingFactor());
        data.uintItems.setItem(6, "executionPrice", executionPrice);
        data.uintItems.setItem(7, "sizeDeltaUsd", sizeDeltaUsd);
        data.uintItems.setItem(8, "sizeDeltaInTokens", sizeDeltaInTokens);
        data.uintItems.setItem(9, "collateralDeltaAmount", collateralDeltaAmount);
        data.uintItems.setItem(10, "orderType", uint256(orderType));

        data.intItems.initItems(3);
        data.intItems.setItem(0, "longTokenFundingAmountPerSize", position.longTokenFundingAmountPerSize());
        data.intItems.setItem(1, "shortTokenFundingAmountPerSize", position.shortTokenFundingAmountPerSize());
        data.intItems.setItem(2, "pnlUsd", pnlUsd);

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
