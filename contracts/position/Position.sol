// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

library Position {
    struct Props {
        address account;
        address market;
        address collateralToken;
        bool isLong;
        uint256 sizeInUsd;
        uint256 sizeInTokens;
        uint256 collateralAmount;
        uint256 borrowingFactor;
        int256 longTokenFundingAmountPerSize;
        int256 shortTokenFundingAmountPerSize;
        uint256 increasedAtBlock;
        uint256 decreasedAtBlock;
        bytes data;
    }
}
