// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title GlvDeposit
// @dev Struct for GLV deposits
library GlvDeposit {
    // @dev there is a limit on the number of fields a struct can have when being passed
    // or returned as a memory variable which can cause "Stack too deep" errors
    // use sub-structs to avoid this issue
    // @param addresses address values
    // @param numbers number values
    // @param flags boolean values
    struct Props {
        address glv;
        address account;
        address receiver;
        address callbackContract;
        address uiFeeReceiver;
        address market;
        address initialLongToken;
        address initialShortToken;
        address[] longTokenSwapPath;
        address[] shortTokenSwapPath;

        uint256 marketTokenAmount;
        uint256 initialLongTokenAmount;
        uint256 initialShortTokenAmount;
        uint256 minGlvTokens;
        uint256 updatedAtBlock;
        uint256 updatedAtTime;
        uint256 executionFee;
        uint256 callbackGasLimit;

        bool shouldUnwrapNativeToken;
        bool isMarketTokenDeposit;
    }
}
