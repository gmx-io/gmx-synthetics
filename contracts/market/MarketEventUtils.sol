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
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(2);
        data.addressItems.setItem(0, "market", market);
        data.addressItems.setItem(1, "token", token);

        data.uintItems.initItems(1);
        data.uintItems.setItem(0, "nextValue", nextValue);

        data.intItems.initItems(1);
        data.intItems.setItem(0, "delta", delta);

        eventEmitter.emitEventLog1(
            "PoolAmountUpdated",
            Cast.toBytes32(market),
            data
        );
    }

    function emitSwapImpactPoolAmountUpdated(
        EventEmitter eventEmitter,
        address market,
        address token,
        int256 delta,
        uint256 nextValue
    ) external {
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(2);
        data.addressItems.setItem(0, "market", market);
        data.addressItems.setItem(1, "token", token);

        data.uintItems.initItems(1);
        data.uintItems.setItem(0, "nextValue", nextValue);

        data.intItems.initItems(1);
        data.intItems.setItem(0, "delta", delta);

        eventEmitter.emitEventLog1(
            "SwapImpactPoolAmountUpdated",
            Cast.toBytes32(market),
            data
        );
    }

    function emitPositionImpactPoolAmountUpdated(
        EventEmitter eventEmitter,
        address market,
        int256 delta,
        uint256 nextValue
    ) external {
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(1);
        data.addressItems.setItem(0, "market", market);

        data.uintItems.initItems(1);
        data.uintItems.setItem(0, "nextValue", nextValue);

        data.intItems.initItems(1);
        data.intItems.setItem(0, "delta", delta);

        eventEmitter.emitEventLog1(
            "PositionImpactPoolAmountUpdated",
            Cast.toBytes32(market),
            data
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
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(2);
        data.addressItems.setItem(0, "market", market);
        data.addressItems.setItem(1, "collateralToken", collateralToken);

        data.boolItems.initItems(1);
        data.boolItems.setItem(0, "isLong", isLong);

        data.uintItems.initItems(1);
        data.uintItems.setItem(0, "nextValue", nextValue);

        data.intItems.initItems(1);
        data.intItems.setItem(0, "delta", delta);

        eventEmitter.emitEventLog1(
            "OpenInterestUpdated",
            Cast.toBytes32(market),
            data
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
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(2);
        data.addressItems.setItem(0, "market", market);
        data.addressItems.setItem(1, "collateralToken", collateralToken);

        data.boolItems.initItems(1);
        data.boolItems.setItem(0, "isLong", isLong);

        data.uintItems.initItems(1);
        data.uintItems.setItem(0, "nextValue", nextValue);

        data.intItems.initItems(1);
        data.intItems.setItem(0, "delta", delta);

        eventEmitter.emitEventLog1(
            "OpenInterestInTokensUpdated",
            Cast.toBytes32(market),
            data
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
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(2);
        data.addressItems.setItem(0, "market", market);
        data.addressItems.setItem(1, "collateralToken", collateralToken);

        data.boolItems.initItems(1);
        data.boolItems.setItem(0, "isLong", isLong);

        data.uintItems.initItems(1);
        data.uintItems.setItem(0, "nextValue", nextValue);

        data.intItems.initItems(1);
        data.intItems.setItem(0, "delta", delta);

        eventEmitter.emitEventLog1(
            "CollateralSumUpdated",
            Cast.toBytes32(market),
            data
        );
    }

    function emitClaimableFundingUpdated(
        EventEmitter eventEmitter,
        address market,
        address token,
        address account,
        int256 delta,
        uint256 nextValue
    ) external {
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(3);
        data.addressItems.setItem(0, "market", market);
        data.addressItems.setItem(1, "token", token);
        data.addressItems.setItem(2, "account", account);

        data.uintItems.initItems(1);
        data.uintItems.setItem(0, "nextValue", nextValue);

        data.intItems.initItems(1);
        data.intItems.setItem(0, "delta", delta);

        eventEmitter.emitEventLog1(
            "ClaimableFundingUpdated",
            Cast.toBytes32(account),
            data
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
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(4);
        data.addressItems.setItem(0, "market", market);
        data.addressItems.setItem(1, "token", token);
        data.addressItems.setItem(2, "account", account);
        data.addressItems.setItem(3, "receiver", receiver);

        data.uintItems.initItems(1);
        data.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog1(
            "FundingFeesClaimed",
            Cast.toBytes32(account),
            data
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
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(3);
        data.addressItems.setItem(0, "market", market);
        data.addressItems.setItem(1, "token", token);
        data.addressItems.setItem(2, "account", account);

        data.uintItems.initItems(3);
        data.uintItems.setItem(0, "timeKey", timeKey);
        data.uintItems.setItem(1, "delta", delta);
        data.uintItems.setItem(2, "nextValue", nextValue);

        eventEmitter.emitEventLog1(
            "ClaimableCollateralUpdated",
            Cast.toBytes32(account),
            data
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
        EventUtils.EventLogData memory data;

        data.addressItems.initItems(4);
        data.addressItems.setItem(0, "market", market);
        data.addressItems.setItem(1, "token", token);
        data.addressItems.setItem(2, "account", account);
        data.addressItems.setItem(3, "receiver", receiver);

        data.uintItems.initItems(2);
        data.uintItems.setItem(0, "timeKey", timeKey);
        data.uintItems.setItem(1, "amount", amount);

        eventEmitter.emitEventLog1(
            "CollateralClaimed",
            Cast.toBytes32(account),
            data
        );
    }

    function emitAdlStateUpdated(
        EventEmitter eventEmitter,
        address market,
        int256 pnlToPoolFactor,
        uint256 maxPnlFactor,
        bool shouldEnableAdl
    ) external {
        EventUtils.EventLogData memory data;

        data.intItems.initItems(1);
        data.intItems.setItem(0, "pnlToPoolFactor", pnlToPoolFactor);

        data.uintItems.initItems(1);
        data.uintItems.setItem(0, "maxPnlFactor", maxPnlFactor);

        data.boolItems.initItems(1);
        data.boolItems.setItem(0, "shouldEnableAdl", shouldEnableAdl);

        eventEmitter.emitEventLog1(
            "AdlStateUpdated",
            Cast.toBytes32(market),
            data
        );
    }
}
