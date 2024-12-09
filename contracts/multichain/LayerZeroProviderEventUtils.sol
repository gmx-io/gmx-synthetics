// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import { EventEmitter } from "../event/EventEmitter.sol";
import { EventUtils } from "../event/EventUtils.sol";
import { Cast } from "../utils/Cast.sol";

/**
 * @title LayerZeroProviderEventUtils
 */
library LayerZeroProviderEventUtils {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.Bytes32Items;

    function emitWithdrawalReceipt(
        EventEmitter eventEmitter,
        address virtualAccount,
        bytes32 guid,
        uint64 nonce,
        uint256 nativeFee,
        uint256 lzTokenFee,
        uint256 amountSentLD,
        uint256 amountReceivedLD
    ) external {
        EventUtils.EventLogData memory eventData;
        
        eventData.uintItems.initItems(5);
        eventData.uintItems.setItem(0, "nonce", uint256(nonce));
        eventData.uintItems.setItem(1, "nativeFee", nativeFee);
        eventData.uintItems.setItem(2, "lzTokenFee", lzTokenFee);
        eventData.uintItems.setItem(3, "amountSentLD", amountSentLD);
        eventData.uintItems.setItem(4, "amountReceivedLD", amountReceivedLD);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "guid", guid);
        
        eventEmitter.emitEventLog1("WithdrawalReceipt", Cast.toBytes32(virtualAccount), eventData);
    }
}
