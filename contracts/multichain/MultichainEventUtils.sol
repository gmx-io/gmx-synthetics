// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import { EventEmitter } from "../event/EventEmitter.sol";
import { EventUtils } from "../event/EventUtils.sol";
import { Cast } from "../utils/Cast.sol";

/**
 * @title MultichainEventUtils
 */
library MultichainEventUtils {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;

    function emitMultichainBridgeIn(
        EventEmitter eventEmitter,
        address provider,
        address token,
        address account,
        uint256 amount,
        uint256 srcChainId
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "provider", provider);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "account", account);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.uintItems.setItem(1, "srcChainId", srcChainId);

        eventEmitter.emitEventLog1("MultichainBridgeIn", Cast.toBytes32(account), eventData);
    }

    function emitMultichainTransferIn(
        EventEmitter eventEmitter,
        address token,
        address account,
        uint256 amount,
        uint256 srcChainId
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "token", token);
        eventData.addressItems.setItem(1, "account", account);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.uintItems.setItem(1, "srcChainId", srcChainId);

        eventEmitter.emitEventLog1("MultichainTransferIn", Cast.toBytes32(account), eventData);
    }
   
    function emitMultichainBridgeOut(
        EventEmitter eventEmitter,
        address provider,
        address token,
        address receiver,
        uint256 amount,
        uint256 srcChainId
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "provider", provider);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "receiver", receiver);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.uintItems.setItem(1, "srcChainId", srcChainId);

        eventEmitter.emitEventLog1("MultichainBridgeOut", Cast.toBytes32(receiver), eventData);
    }

    function emitMultichainTransferOut(
        EventEmitter eventEmitter,
        address token,
        address account,
        address receiver,
        uint256 amount,
        uint256 srcChainId
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "token", token);
        eventData.addressItems.setItem(1, "account", account);
        eventData.addressItems.setItem(2, "receiver", receiver);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.uintItems.setItem(1, "srcChainId", srcChainId);

        eventEmitter.emitEventLog1("MultichainTransferOut", Cast.toBytes32(account), eventData);
    }
}
