// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

library EventUtils {
    error NotFound(string key);

    struct EmitPositionDecreaseParams {
        bytes32 key;
        address account;
        address market;
        address collateralToken;
        bool isLong;
    }

    struct EventLogData {
        AddressItems addressItems;
        UintItems uintItems;
        IntItems intItems;
        BoolItems boolItems;
        Bytes32Items bytes32Items;
        BytesItems bytesItems;
        StringItems stringItems;
    }

    struct AddressItems {
        AddressKeyValue[] items;
        AddressArrayKeyValue[] arrayItems;
    }

    struct UintItems {
        UintKeyValue[] items;
        UintArrayKeyValue[] arrayItems;
    }

    struct IntItems {
        IntKeyValue[] items;
        IntArrayKeyValue[] arrayItems;
    }

    struct BoolItems {
        BoolKeyValue[] items;
        BoolArrayKeyValue[] arrayItems;
    }

    struct Bytes32Items {
        Bytes32KeyValue[] items;
        Bytes32ArrayKeyValue[] arrayItems;
    }

    struct BytesItems {
        BytesKeyValue[] items;
        BytesArrayKeyValue[] arrayItems;
    }

    struct StringItems {
        StringKeyValue[] items;
        StringArrayKeyValue[] arrayItems;
    }

    struct AddressKeyValue {
        string key;
        address value;
    }

    struct AddressArrayKeyValue {
        string key;
        address[] value;
    }

    struct UintKeyValue {
        string key;
        uint256 value;
    }

    struct UintArrayKeyValue {
        string key;
        uint256[] value;
    }

    struct IntKeyValue {
        string key;
        int256 value;
    }

    struct IntArrayKeyValue {
        string key;
        int256[] value;
    }

    struct BoolKeyValue {
        string key;
        bool value;
    }

    struct BoolArrayKeyValue {
        string key;
        bool[] value;
    }

    struct Bytes32KeyValue {
        string key;
        bytes32 value;
    }

    struct Bytes32ArrayKeyValue {
        string key;
        bytes32[] value;
    }

    struct BytesKeyValue {
        string key;
        bytes value;
    }

    struct BytesArrayKeyValue {
        string key;
        bytes[] value;
    }

    struct StringKeyValue {
        string key;
        string value;
    }

    struct StringArrayKeyValue {
        string key;
        string[] value;
    }

    function initItems(AddressItems memory items, uint256 size) internal pure {
        items.items = new EventUtils.AddressKeyValue[](size);
    }

    function initArrayItems(AddressItems memory items, uint256 size) internal pure {
        items.arrayItems = new EventUtils.AddressArrayKeyValue[](size);
    }

    function setItem(AddressItems memory items, uint256 index, string memory key, address value) internal pure {
        items.items[index].key = key;
        items.items[index].value = value;
    }

    function setItem(AddressItems memory items, uint256 index, string memory key, address[] memory value) internal pure {
        items.arrayItems[index].key = key;
        items.arrayItems[index].value = value;
    }

    function getAddress(AddressItems memory addresses, string memory key) external pure returns(address) {
        (bool found, address value) = getAddressWithoutRevert(addresses, key);
        if (!found) {
            revert NotFound(key);
        }
        return value;
    }

    function getAddressWithoutRevert(AddressItems memory addresses, string memory key) public pure returns(bool, address) {
        for (uint i = 0; i < addresses.items.length; i++) {
            if (compareStrings(addresses.items[i].key, key)) {
                return (true, addresses.items[i].value);
            }
        }
        return (false, address(0));
    }

    function getAddressArray(AddressItems memory addresses, string memory key) external pure
    returns(address[] memory) {
        (bool found, address[] memory value) = getAddressArrayWithoutRevert(addresses, key);
        if (!found) {
            revert NotFound(key);
        }
        return value;
    }

    function getAddressArrayWithoutRevert(AddressItems memory addresses, string memory key) public pure
    returns(bool, address[] memory) {
        for (uint i = 0; i < addresses.arrayItems.length; i++) {
            if (compareStrings(addresses.arrayItems[i].key, key)) {
                return (true, addresses.arrayItems[i].value);
            }
        }
        address[] memory empty;
        return (false, empty);
    }

    function initItems(UintItems memory items, uint256 size) internal pure {
        items.items = new EventUtils.UintKeyValue[](size);
    }

    function initArrayItems(UintItems memory items, uint256 size) internal pure {
        items.arrayItems = new EventUtils.UintArrayKeyValue[](size);
    }

    function setItem(UintItems memory items, uint256 index, string memory key, uint256 value) internal pure {
        items.items[index].key = key;
        items.items[index].value = value;
    }

    function setItem(UintItems memory items, uint256 index, string memory key, uint256[] memory value) internal pure {
        items.arrayItems[index].key = key;
        items.arrayItems[index].value = value;
    }

    function getUint(UintItems memory items, string memory key) external pure returns(uint256) {
        (bool found, uint256 value) = getUintWithoutRevert(items, key);
        if (!found) {
            revert NotFound(key);
        }
        return value;
    }

    function getUintWithoutRevert(UintItems memory items, string memory key) public pure returns(bool, uint256) {
        for (uint i = 0; i < items.items.length; i++) {
            if (compareStrings(items.items[i].key, key)) {
                return (true, items.items[i].value);
            }
        }
        return (false, 0);
    }

    function getUintArray(UintItems memory items, string memory key) external pure
    returns(uint256[] memory) {
        (bool found, uint256[] memory value) = getUintArrayWithoutRevert(items, key);
        if (!found) {
            revert NotFound(key);
        }
        return value;
    }

    function getUintArrayWithoutRevert(UintItems memory items, string memory key) public pure
    returns(bool, uint256[] memory) {
        for (uint i = 0; i < items.arrayItems.length; i++) {
            if (compareStrings(items.arrayItems[i].key, key)) {
                return (true, items.arrayItems[i].value);
            }
        }
        uint256[] memory empty;
        return (false, empty);
    }

    function initItems(IntItems memory items, uint256 size) internal pure {
        items.items = new EventUtils.IntKeyValue[](size);
    }

    function initArrayItems(IntItems memory items, uint256 size) internal pure {
        items.arrayItems = new EventUtils.IntArrayKeyValue[](size);
    }

    function setItem(IntItems memory items, uint256 index, string memory key, int256 value) internal pure {
        items.items[index].key = key;
        items.items[index].value = value;
    }

    function setItem(IntItems memory items, uint256 index, string memory key, int256[] memory value) internal pure {
        items.arrayItems[index].key = key;
        items.arrayItems[index].value = value;
    }

    function getInt(IntItems memory items, string memory key) external pure returns(int256) {
        (bool found, int256 value) = getIntWithoutRevert(items, key);
        if (!found) {
            revert NotFound(key);
        }
        return value;
    }

    function getIntWithoutRevert(IntItems memory items, string memory key) public pure returns(bool, int256) {
        for (uint i = 0; i < items.items.length; i++) {
            if (compareStrings(items.items[i].key, key)) {
                return (true, items.items[i].value);
            }
        }
        return (false, 0);
    }

    function getIntArray(IntItems memory items, string memory key) external pure
    returns(int256[] memory) {
        (bool found, int256[] memory value) = getIntArrayWithoutRevert(items, key);
        if (!found) {
            revert NotFound(key);
        }
        return value;
    }

    function getIntArrayWithoutRevert(IntItems memory items, string memory key) public pure
    returns(bool, int256[] memory) {
        for (uint i = 0; i < items.arrayItems.length; i++) {
            if (compareStrings(items.arrayItems[i].key, key)) {
                return (true, items.arrayItems[i].value);
            }
        }
        int256[] memory empty;
        return (false, empty);
    }

    function initItems(BoolItems memory items, uint256 size) internal pure {
        items.items = new EventUtils.BoolKeyValue[](size);
    }

    function initArrayItems(BoolItems memory items, uint256 size) internal pure {
        items.arrayItems = new EventUtils.BoolArrayKeyValue[](size);
    }

    function setItem(BoolItems memory items, uint256 index, string memory key, bool value) internal pure {
        items.items[index].key = key;
        items.items[index].value = value;
    }

    function setItem(BoolItems memory items, uint256 index, string memory key, bool[] memory value) internal pure {
        items.arrayItems[index].key = key;
        items.arrayItems[index].value = value;
    }

    function getBool(BoolItems memory items, string memory key) external pure returns(bool) {
        (bool found, bool value) = getBoolWithoutRevert(items, key);
        if (!found) {
            revert NotFound(key);
        }
        return value;
    }

    function getBoolWithoutRevert(BoolItems memory items, string memory key) public pure returns(bool, bool) {
        for (uint i = 0; i < items.items.length; i++) {
            if (compareStrings(items.items[i].key, key)) {
                return (true, items.items[i].value);
            }
        }
        return (false, false);
    }

    function getBoolArray(BoolItems memory items, string memory key) external pure
    returns(bool[] memory) {
        (bool found, bool[] memory value) = getBoolArrayWithoutRevert(items, key);
        if (!found) {
            revert NotFound(key);
        }
        return value;
    }

    function getBoolArrayWithoutRevert(BoolItems memory items, string memory key) public pure
    returns(bool, bool[] memory) {
        for (uint i = 0; i < items.arrayItems.length; i++) {
            if (compareStrings(items.arrayItems[i].key, key)) {
                return (true, items.arrayItems[i].value);
            }
        }
        bool[] memory empty;
        return (false, empty);
    }

    function initItems(Bytes32Items memory items, uint256 size) internal pure {
        items.items = new EventUtils.Bytes32KeyValue[](size);
    }

    function initArrayItems(Bytes32Items memory items, uint256 size) internal pure {
        items.arrayItems = new EventUtils.Bytes32ArrayKeyValue[](size);
    }

    function setItem(Bytes32Items memory items, uint256 index, string memory key, bytes32 value) internal pure {
        items.items[index].key = key;
        items.items[index].value = value;
    }

    function setItem(Bytes32Items memory items, uint256 index, string memory key, bytes32[] memory value) internal pure {
        items.arrayItems[index].key = key;
        items.arrayItems[index].value = value;
    }

    function getBytes32(Bytes32Items memory items, string memory key) external pure returns(bytes32) {
        (bool found, bytes32 value) = getBytes32WithoutRevert(items, key);
        if (!found) {
            revert NotFound(key);
        }
        return value;
    }

    function getBytes32WithoutRevert(Bytes32Items memory items, string memory key) public pure returns(bool, bytes32) {
        for (uint i = 0; i < items.items.length; i++) {
            if (compareStrings(items.items[i].key, key)) {
                return (true, items.items[i].value);
            }
        }
        return (false, 0);
    }

    function getBytes32Array(Bytes32Items memory items, string memory key) external pure
    returns(bytes32[] memory) {
        (bool found, bytes32[] memory value) = getBytes32ArrayWithoutRevert(items, key);
        if (!found) {
            revert NotFound(key);
        }
        return value;
    }

    function getBytes32ArrayWithoutRevert(Bytes32Items memory items, string memory key) public pure
    returns(bool, bytes32[] memory) {
        for (uint i = 0; i < items.arrayItems.length; i++) {
            if (compareStrings(items.arrayItems[i].key, key)) {
                return (true, items.arrayItems[i].value);
            }
        }
        bytes32[] memory empty;
        return (false, empty);
    }

    function initItems(BytesItems memory items, uint256 size) internal pure {
        items.items = new EventUtils.BytesKeyValue[](size);
    }

    function initArrayItems(BytesItems memory items, uint256 size) internal pure {
        items.arrayItems = new EventUtils.BytesArrayKeyValue[](size);
    }

    function setItem(BytesItems memory items, uint256 index, string memory key, bytes memory value) internal pure {
        items.items[index].key = key;
        items.items[index].value = value;
    }

    function setItem(BytesItems memory items, uint256 index, string memory key, bytes[] memory value) internal pure {
        items.arrayItems[index].key = key;
        items.arrayItems[index].value = value;
    }

    function getBytes(BytesItems memory items, string memory key) external pure returns(bytes memory) {
        (bool found, bytes memory value) = getBytesWithoutRevert(items, key);
        if (!found) {
            revert NotFound(key);
        }
        return value;
    }

    function getBytesWithoutRevert(BytesItems memory items, string memory key) public pure returns(bool, bytes memory) {
        for (uint i = 0; i < items.items.length; i++) {
            if (compareStrings(items.items[i].key, key)) {
                return (true, items.items[i].value);
            }
        }
        return (false, "");
    }

    function getBytesArray(BytesItems memory items, string memory key) external pure
    returns(bytes[] memory) {
        (bool found, bytes[] memory value) = getBytesArrayWithoutRevert(items, key);
        if (!found) {
            revert NotFound(key);
        }
        return value;
    }

    function getBytesArrayWithoutRevert(BytesItems memory items, string memory key) public pure
    returns(bool, bytes[] memory) {
        for (uint i = 0; i < items.arrayItems.length; i++) {
            if (compareStrings(items.arrayItems[i].key, key)) {
                return (true, items.arrayItems[i].value);
            }
        }
        bytes[] memory empty;
        return (false, empty);
    }

    function initItems(StringItems memory items, uint256 size) internal pure {
        items.items = new EventUtils.StringKeyValue[](size);
    }

    function initArrayItems(StringItems memory items, uint256 size) internal pure {
        items.arrayItems = new EventUtils.StringArrayKeyValue[](size);
    }

    function setItem(StringItems memory items, uint256 index, string memory key, string memory value) internal pure {
        items.items[index].key = key;
        items.items[index].value = value;
    }

    function setItem(StringItems memory items, uint256 index, string memory key, string[] memory value) internal pure {
        items.arrayItems[index].key = key;
        items.arrayItems[index].value = value;
    }

    function getString(StringItems memory items, string memory key) external pure returns(string memory) {
        (bool found, string memory value) = getStringWithoutRevert(items, key);
        if (!found) {
            revert NotFound(key);
        }
        return value;
    }

    function getStringWithoutRevert(StringItems memory items, string memory key) public pure returns(bool, string memory) {
        for (uint i = 0; i < items.items.length; i++) {
            if (compareStrings(items.items[i].key, key)) {
                return (true, items.items[i].value);
            }
        }
        return (false, "");
    }

    function getStringArray(StringItems memory items, string memory key) external pure
    returns(string[] memory) {
        (bool found, string[] memory value) = getStringArrayWithoutRevert(items, key);
        if (!found) {
            revert NotFound(key);
        }
        return value;
    }

    function getStringArrayWithoutRevert(StringItems memory items, string memory key) public pure
    returns(bool, string[] memory) {
        for (uint i = 0; i < items.arrayItems.length; i++) {
            if (compareStrings(items.arrayItems[i].key, key)) {
                return (true, items.arrayItems[i].value);
            }
        }
        string[] memory empty;
        return (false, empty);
    }

    function compareStrings(string memory a, string memory b) public pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}
