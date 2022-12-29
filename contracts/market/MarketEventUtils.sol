// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter2.sol";

library MarketEventUtils {
    function emitPoolAmountUpdated(
        EventEmitter2 eventEmitter,
        address market,
        address token,
        int256 delta,
        uint256 nextValue
    ) external {
        EventUtils.AddressItems memory addressItems;
        addressItems.items = new EventUtils.AddressKeyValue[](2);
        addressItems.items[0] = EventUtils.AddressKeyValue("market", market);
        addressItems.items[1] = EventUtils.AddressKeyValue("token", token);

        EventUtils.UintItems memory uintItems;
        uintItems.items = new EventUtils.UintKeyValue[](1);
        uintItems.items[0] = EventUtils.UintKeyValue("nextValue", nextValue);

        EventUtils.IntItems memory intItems;
        intItems.items = new EventUtils.IntKeyValue[](1);
        intItems.items[0] = EventUtils.IntKeyValue("delta", delta);

        EventUtils.BoolItems memory boolItems;
        EventUtils.Bytes32Items memory bytes32Items;
        EventUtils.DataItems memory dataItems;

        eventEmitter.log(
            "PoolAmountUpdated",
            addressItems,
            uintItems,
            intItems,
            boolItems,
            bytes32Items,
            dataItems
        );
    }
}
