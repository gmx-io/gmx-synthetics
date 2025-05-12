// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

interface IGlvDepositUtils {
    struct CreateGlvDepositParams {
        CreateGlvDepositParamsAddresses addresses;
        uint256 minGlvTokens;
        uint256 executionFee;
        uint256 callbackGasLimit;
        bool shouldUnwrapNativeToken;
        bool isMarketTokenDeposit;
        bytes32[] dataList;
    }

    struct CreateGlvDepositParamsAddresses {
        address glv;
        address market;
        address receiver;
        address callbackContract;
        address uiFeeReceiver;
        address initialLongToken;
        address initialShortToken;
        address[] longTokenSwapPath;
        address[] shortTokenSwapPath;
    }
}
