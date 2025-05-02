// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IShiftUtils {
    struct CreateShiftParams {
        CreateShiftParamsAddresses addresses;
        uint256 minMarketTokens;
        uint256 executionFee;
        uint256 callbackGasLimit;
        bytes32[] dataList;
    }

    struct CreateShiftParamsAddresses {
        address receiver;
        address callbackContract;
        address uiFeeReceiver;
        address fromMarket;
        address toMarket;
    }
}
