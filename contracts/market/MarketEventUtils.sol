// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter.sol";
import "../event/EventUtils.sol";
import "../utils/Cast.sol";

library MarketEventUtils {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    function emitPoolAmountUpdated(
        EventEmitter eventEmitter,
        address market,
        address token,
        int256 delta,
        uint256 nextValue
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);

        eventData.intItems.initItems(1);
        eventData.intItems.setItem(0, "delta", delta);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "nextValue", nextValue);

        eventEmitter.emitEventLog1(
            "PoolAmountUpdated",
            Cast.toBytes32(market),
            eventData
        );
    }

    function emitSwapImpactPoolAmountUpdated(
        EventEmitter eventEmitter,
        address market,
        address token,
        int256 delta,
        uint256 nextValue
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);

        eventData.intItems.initItems(1);
        eventData.intItems.setItem(0, "delta", delta);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "nextValue", nextValue);

        eventEmitter.emitEventLog1(
            "SwapImpactPoolAmountUpdated",
            Cast.toBytes32(market),
            eventData
        );
    }

    function emitPositionImpactPoolAmountUpdated(
        EventEmitter eventEmitter,
        address market,
        int256 delta,
        uint256 nextValue
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "market", market);

        eventData.intItems.initItems(1);
        eventData.intItems.setItem(0, "delta", delta);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "nextValue", nextValue);

        eventEmitter.emitEventLog1(
            "PositionImpactPoolAmountUpdated",
            Cast.toBytes32(market),
            eventData
        );
    }

    function emitOpenInterestUpdated(
        EventEmitter eventEmitter,
        address market,
        address collateralToken,
        bool isLong,
        int256 delta,
        uint256 nextValue
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "collateralToken", collateralToken);

        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "isLong", isLong);

        eventData.intItems.initItems(1);
        eventData.intItems.setItem(0, "delta", delta);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "nextValue", nextValue);

        eventEmitter.emitEventLog1(
            "OpenInterestUpdated",
            Cast.toBytes32(market),
            eventData
        );
    }

    function emitVirtualSwapInventoryUpdated(
        EventEmitter eventEmitter,
        address market,
        address token,
        bytes32 marketId,
        int256 delta,
        uint256 nextValue
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "token", token);
        eventData.addressItems.setItem(1, "market", market);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "marketId", marketId);

        eventData.intItems.initItems(1);
        eventData.intItems.setItem(0, "delta", delta);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "nextValue", nextValue);

        eventEmitter.emitEventLog2(
            "VirtualSwapInventoryUpdated",
            Cast.toBytes32(market),
            marketId,
            eventData
        );
    }

    function emitVirtualPositionInventoryUpdated(
        EventEmitter eventEmitter,
        address token,
        bytes32 tokenId,
        int256 delta,
        int256 nextValue
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "token", token);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "tokenId", tokenId);

        eventData.intItems.initItems(2);
        eventData.intItems.setItem(0, "delta", delta);
        eventData.intItems.setItem(1, "nextValue", nextValue);

        eventEmitter.emitEventLog2(
            "VirtualPositionInventoryUpdated",
            Cast.toBytes32(token),
            tokenId,
            eventData
        );
    }

    function emitOpenInterestInTokensUpdated(
        EventEmitter eventEmitter,
        address market,
        address collateralToken,
        bool isLong,
        int256 delta,
        uint256 nextValue
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "collateralToken", collateralToken);

        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "isLong", isLong);

        eventData.intItems.initItems(1);
        eventData.intItems.setItem(0, "delta", delta);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "nextValue", nextValue);

        eventEmitter.emitEventLog1(
            "OpenInterestInTokensUpdated",
            Cast.toBytes32(market),
            eventData
        );
    }

    function emitCollateralSumUpdated(
        EventEmitter eventEmitter,
        address market,
        address collateralToken,
        bool isLong,
        int256 delta,
        uint256 nextValue
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "collateralToken", collateralToken);

        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "isLong", isLong);

        eventData.intItems.initItems(1);
        eventData.intItems.setItem(0, "delta", delta);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "nextValue", nextValue);

        eventEmitter.emitEventLog1(
            "CollateralSumUpdated",
            Cast.toBytes32(market),
            eventData
        );
    }

    function emitBorrowingFactorUpdated(
        EventEmitter eventEmitter,
        address market,
        bool isLong,
        uint256 delta,
        uint256 nextValue
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "market", market);

        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "isLong", isLong);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "delta", delta);
        eventData.uintItems.setItem(1, "nextValue", nextValue);

        eventEmitter.emitEventLog1(
            "CumulativeBorrowingFactorUpdated",
            Cast.toBytes32(market),
            eventData
        );
    }

    function emitFundingAmountPerSizeUpdated(
        EventEmitter eventEmitter,
        address market,
        address collateralToken,
        bool isLong,
        int256 value
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "collateralToken", collateralToken);

        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "isLong", isLong);

        eventData.intItems.initItems(1);
        eventData.intItems.setItem(0, "value", value);

        eventEmitter.emitEventLog1(
            "FundingAmountPerSizeUpdated",
            Cast.toBytes32(market),
            eventData
        );
    }

    function emitClaimableFundingUpdated(
        EventEmitter eventEmitter,
        address market,
        address token,
        address account,
        uint256 delta,
        uint256 nextValue
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "account", account);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "delta", delta);
        eventData.uintItems.setItem(1, "nextValue", nextValue);

        eventEmitter.emitEventLog1(
            "ClaimableFundingUpdated",
            Cast.toBytes32(account),
            eventData
        );
    }

    function emitFundingFeesClaimed(
        EventEmitter eventEmitter,
        address market,
        address token,
        address account,
        address receiver,
        uint256 amount
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(4);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "account", account);
        eventData.addressItems.setItem(3, "receiver", receiver);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog1(
            "FundingFeesClaimed",
            Cast.toBytes32(account),
            eventData
        );
    }

    function emitClaimableFundingUpdated(
        EventEmitter eventEmitter,
        address market,
        address token,
        uint256 timeKey,
        address account,
        uint256 delta,
        uint256 nextValue
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "account", account);

        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "timeKey", timeKey);
        eventData.uintItems.setItem(1, "delta", delta);
        eventData.uintItems.setItem(2, "nextValue", nextValue);

        eventEmitter.emitEventLog1(
            "ClaimableFundingUpdated",
            Cast.toBytes32(account),
            eventData
        );
    }

    function emitClaimableCollateralUpdated(
        EventEmitter eventEmitter,
        address market,
        address token,
        uint256 timeKey,
        address account,
        uint256 delta,
        uint256 nextValue
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "account", account);

        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "timeKey", timeKey);
        eventData.uintItems.setItem(1, "delta", delta);
        eventData.uintItems.setItem(2, "nextValue", nextValue);

        eventEmitter.emitEventLog1(
            "ClaimableCollateralUpdated",
            Cast.toBytes32(account),
            eventData
        );
    }

    function emitCollateralClaimed(
        EventEmitter eventEmitter,
        address market,
        address token,
        uint256 timeKey,
        address account,
        address receiver,
        uint256 amount
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(4);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "account", account);
        eventData.addressItems.setItem(3, "receiver", receiver);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "timeKey", timeKey);
        eventData.uintItems.setItem(1, "amount", amount);

        eventEmitter.emitEventLog1(
            "CollateralClaimed",
            Cast.toBytes32(account),
            eventData
        );
    }
}
