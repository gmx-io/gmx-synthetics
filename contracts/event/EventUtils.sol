// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "./EventEmitter2.sol";
import "../order/Order.sol";

library EventUtils {
    struct EmitPositionDecreaseParams {
        bytes32 key;
        address account;
        address market;
        address collateralToken;
        bool isLong;
    }

    struct AddressItems {
        AddressKeyValue[] values;
        AddressArrayKeyValue[] arrayValues;
    }

    struct UintItems {
        UintKeyValue[] values;
        UintArrayKeyValue[] arrayValues;
    }

    struct IntItems {
        IntKeyValue[] values;
        IntArrayKeyValue[] arrayValues;
    }

    struct BoolItems {
        BoolKeyValue[] values;
        BoolArrayKeyValue[] arrayValues;
    }

    struct Bytes32Items {
        Bytes32KeyValue[] values;
        Bytes32ArrayKeyValue[] arrayValues;
    }

    struct DataItems {
        DataKeyValue[] values;
        DataArrayKeyValue[] arrayValues;
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

    struct DataKeyValue {
        string key;
        bytes value;
    }

    struct DataArrayKeyValue {
        string key;
        bytes[] value;
    }
}
