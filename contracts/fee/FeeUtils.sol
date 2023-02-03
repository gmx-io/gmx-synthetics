// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";

import "../event/EventEmitter.sol";
import "../event/EventUtils.sol";
import "../utils/Cast.sol";
import "../utils/ReceiverUtils.sol";

import "../market/MarketToken.sol";

// @title FeeUtils
// @dev Library for fee actions
library FeeUtils {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    // @dev increment the claimable fee amount
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to increment claimable fees for
    // @param token the fee token
    // @param feeReceiverAmount the amount to increment
    // @param feeType the type of the fee
    function incrementClaimableFeeAmount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        uint256 feeReceiverAmount,
        bytes32 feeType
    ) external {
        if (feeReceiverAmount == 0) {
            return;
        }

        bytes32 key = Keys.claimableFeeAmountKey(market, token);

        uint256 nextClaimableFeeAmount = dataStore.incrementUint(
            key,
            feeReceiverAmount
        );

        emitClaimableFeeAmountUpdated(
            eventEmitter,
            market,
            token,
            feeReceiverAmount,
            nextClaimableFeeAmount,
            feeType
        );
    }

    // @dev claim fees for the specified market
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the market to claim fees for
    // @param token the fee token
    // @param receiver the receiver of the claimed fees
    function claimFees(
        DataStore dataStore,
        EventEmitter eventEmitter,
        address market,
        address token,
        address receiver
    ) internal {
        ReceiverUtils.validateReceiver(receiver);

        bytes32 key = Keys.claimableFeeAmountKey(market, token);

        uint256 feeAmount = dataStore.getUint(key);
        dataStore.setUint(key, 0);

        MarketToken(payable(market)).transferOut(
            token,
            receiver,
            feeAmount
        );

        emitFeesClaimed(
            eventEmitter,
            market,
            receiver,
            feeAmount
        );
    }

    function emitClaimableFeeAmountUpdated(
        EventEmitter eventEmitter,
        address market,
        address token,
        uint256 delta,
        uint256 nextValue,
        bytes32 feeType
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "delta", delta);
        eventData.uintItems.setItem(1, "nextValue", nextValue);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "feeType", feeType);

        eventEmitter.emitEventLog2(
            "ClaimableFeeAmountUpdated",
            Cast.toBytes32(market),
            feeType,
            eventData
        );
    }

    function emitFeesClaimed(
        EventEmitter eventEmitter,
        address market,
        address receiver,
        uint256 feeAmount
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "receiver", receiver);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "feeAmount", feeAmount);

        eventEmitter.emitEventLog1(
            "FeesClaimed",
            Cast.toBytes32(market),
            eventData
        );
    }
}
