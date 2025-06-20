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
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.StringItems;

    /// @param provider the address of the multichain provider for cross-chain action,
    /// or zero address for same-chain action
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

    /// @param provider the address of the multichain provider for Deposit/GlvDeposit action types,
    /// or handler address for BridgeOut action type
    function emitMultichainBridgeAction(
        EventEmitter eventEmitter,
        address provider,
        address account,
        uint256 srcChainId,
        uint256 actionType
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "provider", provider);
        eventData.addressItems.setItem(1, "account", account);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "srcChainId", srcChainId);
        eventData.uintItems.setItem(1, "actionType", actionType);

        eventEmitter.emitEventLog1("MultichainBridgeAction", Cast.toBytes32(account), eventData);
    }

    /// @param provider the address of the multichain provider for Deposit/GlvDeposit action types,
    /// or handler address for BridgeOut action type
    function emitMultichainBridgeActionFailed(
        EventEmitter eventEmitter,
        address provider,
        address account,
        uint256 srcChainId,
        uint256 actionType,
        string memory reason
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "provider", provider);
        eventData.addressItems.setItem(1, "account", account);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "srcChainId", srcChainId);
        eventData.uintItems.setItem(1, "actionType", actionType);

        eventData.stringItems.initItems(1);
        eventData.stringItems.setItem(0, "reason", reason);

        eventEmitter.emitEventLog1("MultichainBridgeActionFailed", Cast.toBytes32(account), eventData);
    }

    /// @param provider the address of the multichain provider for cross-chain action,
    /// or zero address for same-chain action
    function emitMultichainBridgeOut(
        EventEmitter eventEmitter,
        address provider,
        address token,
        address receiver,
        uint256 amount,
        uint256 srcChainId
    ) internal {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
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
