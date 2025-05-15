// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IGlvWithdrawalUtils {
    struct CreateGlvWithdrawalParams {
        CreateGlvWithdrawalParamsAddresses addresses;
        uint256 minLongTokenAmount;
        uint256 minShortTokenAmount;
        bool shouldUnwrapNativeToken;
        uint256 executionFee;
        uint256 callbackGasLimit;
        bytes32[] dataList;
    }

    struct CreateGlvWithdrawalParamsAddresses {
        address receiver;
        address callbackContract;
        address uiFeeReceiver;
        address market;
        address glv;
        address[] longTokenSwapPath;
        address[] shortTokenSwapPath;
    }
}
