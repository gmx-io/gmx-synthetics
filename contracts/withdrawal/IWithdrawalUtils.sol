// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IWithdrawalUtils {
    // NOTE: if a longTokenSwapPath or shortTokenSwapPath is present
    // then the minLongTokenAmount and minShortTokenAmount are the minimum amounts
    // after the swap, i.e. the token amounts validated here would not be in
    // the long token or short token in this case
    struct CreateWithdrawalParams {
        CreateWithdrawalParamsAddresses addresses;
        uint256 minLongTokenAmount;
        uint256 minShortTokenAmount;
        bool shouldUnwrapNativeToken;
        uint256 executionFee;
        uint256 callbackGasLimit;
        bytes32[] dataList;
    }

    struct CreateWithdrawalParamsAddresses {
        address receiver;
        address callbackContract;
        address uiFeeReceiver;
        address market;
        address[] longTokenSwapPath;
        address[] shortTokenSwapPath;
    }
}
