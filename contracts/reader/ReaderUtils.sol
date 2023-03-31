// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";

import "../market/MarketStoreUtils.sol";

import "../deposit/DepositStoreUtils.sol";
import "../withdrawal/WithdrawalStoreUtils.sol";

import "../position/Position.sol";
import "../position/PositionUtils.sol";
import "../position/PositionStoreUtils.sol";

import "../order/OrderStoreUtils.sol";

import "../market/MarketUtils.sol";
import "../market/Market.sol";

// @title ReaderUtils
// @dev Library for read utils functions
// convers some internal library functions into external functions to reduce
// the Reader contract size
library ReaderUtils {
    using Position for Position.Props;

    function getNextBorrowingFees(
        DataStore dataStore,
        Position.Props memory position,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices
    ) external view returns (uint256) {
        return MarketUtils.getNextBorrowingFees(
            dataStore,
            position,
            market,
            prices
        );
    }

    function getBorrowingFees(
        DataStore dataStore,
        Price.Props memory collateralTokenPrice,
        uint256 borrowingFeeUsd
    ) external view returns (PositionPricingUtils.PositionBorrowingFees memory) {
        return PositionPricingUtils.getBorrowingFees(
            dataStore,
            collateralTokenPrice,
            borrowingFeeUsd
        );
    }

    function getNextFundingAmountPerSize(
        DataStore dataStore,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices
    ) external view returns (MarketUtils.GetNextFundingAmountPerSizeResult memory) {
        return MarketUtils.getNextFundingAmountPerSize(
            dataStore,
            market,
            prices
        );
    }

    function getFundingFees(
        Position.Props memory position,
        address longToken,
        address shortToken,
        int256 latestLongTokenFundingAmountPerSize,
        int256 latestShortTokenFundingAmountPerSize
    ) external pure returns (PositionPricingUtils.PositionFundingFees memory) {
        return PositionPricingUtils.getFundingFees(
            position,
            longToken,
            shortToken,
            latestLongTokenFundingAmountPerSize,
            latestShortTokenFundingAmountPerSize
        );
    }
}
