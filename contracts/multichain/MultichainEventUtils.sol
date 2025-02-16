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

    function emitBridgeIn(
        EventEmitter eventEmitter,
        address token,
        address account,
        uint256 srcChainId
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "token", token);
        eventData.addressItems.setItem(1, "account", account);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "srcChainId", srcChainId);

        eventEmitter.emitEventLog1("BridgeIn", Cast.toBytes32(account), eventData);
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
   
    function emitBridgeOut(
        EventEmitter eventEmitter,
        address account,
        address token,
        uint256 amount
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "account", account);
        eventData.addressItems.setItem(1, "token", token);

        eventData.uintItems.initItems(1);
        eventData.uintItems.setItem(0, "amount", amount);

        eventEmitter.emitEventLog1("BridgeOut", Cast.toBytes32(account), eventData);
    }

    function emitMultichainTransferOut(
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

        eventEmitter.emitEventLog1("MultichainTransferOut", Cast.toBytes32(account), eventData);
    }
}
