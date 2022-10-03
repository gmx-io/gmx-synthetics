// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

library Deposit {
    struct Props {
        address account;
        address market;
        uint256 longTokenAmount;
        uint256 shortTokenAmount;
        uint256 minMarketTokens;
        uint256 updatedAtBlock;
        bool hasCollateralInETH;
        uint256 executionFee;
        bytes32[] data;
    }
}
