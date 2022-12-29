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
        addressItems.values = new EventUtils.AddressKeyValue[](2);
        addressItems.values[0] = EventUtils.AddressKeyValue("market", market);
        addressItems.values[1] = EventUtils.AddressKeyValue("token", token);

        EventUtils.UintItems memory uintItems;
        uintItems.values = new EventUtils.UintKeyValue[](1);
        uintItems.values[0] = EventUtils.UintKeyValue("nextValue", nextValue);

        EventUtils.IntItems memory intItems;
        intItems.values = new EventUtils.IntKeyValue[](1);
        intItems.values[0] = EventUtils.IntKeyValue("delta", delta);

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
