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

import "./ReaderUtils.sol";

// @title Reader
// @dev Library for read functions
contract Reader {
    using Position for Position.Props;

    struct PositionInfo {
        Position.Props position;
        PositionPricingUtils.PositionFees fees;
    }

    struct MarketInfo {
        Market.Props market;
        uint256 borrowingFactorPerSecondForLongs;
        uint256 borrowingFactorPerSecondForShorts;
        MarketUtils.GetNextFundingAmountPerSizeResult funding;
    }

    function getMarket(DataStore dataStore, address key) external view returns (Market.Props memory) {
        return MarketStoreUtils.get(dataStore, key);
    }

    function getDeposit(DataStore dataStore, bytes32 key) external view returns (Deposit.Props memory) {
        return DepositStoreUtils.get(dataStore, key);
    }

    function getWithdrawal(DataStore dataStore, bytes32 key) external view returns (Withdrawal.Props memory) {
        return WithdrawalStoreUtils.get(dataStore, key);
    }

    function getPosition(DataStore dataStore, bytes32 key) external view returns (Position.Props memory) {
        return PositionStoreUtils.get(dataStore, key);
    }

    function getOrder(DataStore dataStore, bytes32 key) external view returns (Order.Props memory) {
        return OrderStoreUtils.get(dataStore, key);
    }

    function getAccountPositions(
        DataStore dataStore,
        address account,
        uint256 start,
        uint256 end
    ) external view returns (Position.Props[] memory) {
        bytes32[] memory positionKeys = PositionStoreUtils.getAccountPositionKeys(dataStore, account, start, end);
        Position.Props[] memory positions = new Position.Props[](positionKeys.length);
        for (uint256 i = 0; i < positionKeys.length; i++) {
            bytes32 positionKey = positionKeys[i];
            positions[i] = PositionStoreUtils.get(dataStore, positionKey);
        }

        return positions;
    }

    function getAccountPositionInfoList(
        DataStore dataStore,
        IReferralStorage referralStorage,
        bytes32[] memory positionKeys,
        MarketUtils.MarketPrices[] memory prices
    ) external view returns (PositionInfo[] memory) {
        PositionInfo[] memory positionInfoList = new PositionInfo[](positionKeys.length);
        for (uint256 i = 0; i < positionKeys.length; i++) {
            bytes32 positionKey = positionKeys[i];
            positionInfoList[i] = getPositionInfo(
                dataStore,
                referralStorage,
                positionKey,
                prices[i],
                0, // sizeDeltaUsd
                true // usePositionSizeAsSizeDeltaUsd
            );
        }

        return positionInfoList;
    }

    function getPositionInfo(
        DataStore dataStore,
        IReferralStorage referralStorage,
        bytes32 positionKey,
        MarketUtils.MarketPrices memory prices,
        uint256 sizeDeltaUsd,
        bool usePositionSizeAsSizeDeltaUsd
    ) public view returns (PositionInfo memory) {
        Position.Props memory position = PositionStoreUtils.get(dataStore, positionKey);
        Market.Props memory market = MarketStoreUtils.get(dataStore, position.market());

        Price.Props memory collateralTokenPrice = MarketUtils.getCachedTokenPrice(position.collateralToken(), market, prices);

        if (usePositionSizeAsSizeDeltaUsd) {
            sizeDeltaUsd = position.sizeInUsd();
        }

        PositionPricingUtils.PositionFees memory fees = PositionPricingUtils.getPositionFees(
            dataStore,
            referralStorage,
            position,
            collateralTokenPrice,
            market.longToken,
            market.shortToken,
            sizeDeltaUsd
        );

        // borrowing and funding fees need to be overwritten with pending values otherwise they
        // would be using storage values that have not yet been updated
        uint256 pendingBorrowingFeeUsd = ReaderUtils.getNextBorrowingFees(dataStore, position, market, prices);

        fees.borrowing = ReaderUtils.getBorrowingFees(
            dataStore,
            collateralTokenPrice,
            pendingBorrowingFeeUsd
        );

        MarketUtils.GetNextFundingAmountPerSizeResult memory nextFundingAmountResult = ReaderUtils.getNextFundingAmountPerSize(dataStore, market, prices);

        int256 latestLongTokenFundingAmountPerSize;
        int256 latestShortTokenFundingAmountPerSize;

        if (position.isLong()) {
            latestLongTokenFundingAmountPerSize = nextFundingAmountResult.fundingAmountPerSize_LongCollateral_LongPosition;
            latestShortTokenFundingAmountPerSize = nextFundingAmountResult.fundingAmountPerSize_ShortCollateral_LongPosition;
        } else {
            latestLongTokenFundingAmountPerSize = nextFundingAmountResult.fundingAmountPerSize_LongCollateral_ShortPosition;
            latestShortTokenFundingAmountPerSize = nextFundingAmountResult.fundingAmountPerSize_ShortCollateral_ShortPosition;
        }

        fees.funding = ReaderUtils.getFundingFees(
            position,
            market.longToken,
            market.shortToken,
            latestLongTokenFundingAmountPerSize,
            latestShortTokenFundingAmountPerSize
        );

        return PositionInfo(position, fees);
    }

    function getAccountOrders(
        DataStore dataStore,
        address account,
        uint256 start,
        uint256 end
    ) external view returns (Order.Props[] memory) {
        bytes32[] memory orderKeys = OrderStoreUtils.getAccountOrderKeys(dataStore, account, start, end);
        Order.Props[] memory orders = new Order.Props[](orderKeys.length);
        for (uint256 i = 0; i < orderKeys.length; i++) {
            bytes32 orderKey = orderKeys[i];
            orders[i] = OrderStoreUtils.get(dataStore, orderKey);
        }

        return orders;
    }

    function getMarkets(
        DataStore dataStore,
        uint256 start,
        uint256 end
    ) external view returns (Market.Props[] memory) {
        address[] memory marketKeys = MarketStoreUtils.getMarketKeys(dataStore, start, end);
        Market.Props[] memory markets = new Market.Props[](marketKeys.length);
        for (uint256 i = 0; i < marketKeys.length; i++) {
            address marketKey = marketKeys[i];
            Market.Props memory market = MarketStoreUtils.get(dataStore, marketKey);
            markets[i] = market;
        }

        return markets;
    }

    function getMarketInfoList(
        DataStore dataStore,
        MarketUtils.MarketPrices[] memory marketPricesList,
        uint256 start,
        uint256 end
    ) external view returns (MarketInfo[] memory) {
        address[] memory marketKeys = MarketStoreUtils.getMarketKeys(dataStore, start, end);
        MarketInfo[] memory marketInfoList = new MarketInfo[](marketKeys.length);
        for (uint256 i = 0; i < marketKeys.length; i++) {
            MarketUtils.MarketPrices memory prices = marketPricesList[i];
            address marketKey = marketKeys[i];
            marketInfoList[i] = getMarketInfo(dataStore, prices, marketKey);
        }

        return marketInfoList;
    }

    function getMarketInfo(
        DataStore dataStore,
        MarketUtils.MarketPrices memory prices,
        address marketKey
    ) public view returns (MarketInfo memory) {
        Market.Props memory market = MarketStoreUtils.get(dataStore, marketKey);

        uint256 borrowingFactorPerSecondForLongs = MarketUtils.getBorrowingFactorPerSecond(
            dataStore,
            market,
            prices,
            true
        );

        uint256 borrowingFactorPerSecondForShorts = MarketUtils.getBorrowingFactorPerSecond(
            dataStore,
            market,
            prices,
            false
        );

        MarketUtils.GetNextFundingAmountPerSizeResult memory funding = ReaderUtils.getNextFundingAmountPerSize(
            dataStore,
            market,
            prices
        );

        return MarketInfo(market, borrowingFactorPerSecondForLongs, borrowingFactorPerSecondForShorts, funding);
    }

    function getMarketTokenPrice(
        DataStore dataStore,
        Market.Props memory market,
        Price.Props memory indexTokenPrice,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        bytes32 pnlFactorType,
        bool maximize
    ) external view returns (int256) {
        return
            MarketUtils.getMarketTokenPrice(
                dataStore,
                market,
                longTokenPrice,
                shortTokenPrice,
                indexTokenPrice,
                pnlFactorType,
                maximize
            );
    }

    function getNetPnl(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        Price.Props memory indexTokenPrice,
        bool maximize
    ) external view returns (int256) {
        return MarketUtils.getNetPnl(dataStore, market, longToken, shortToken, indexTokenPrice, maximize);
    }

    function getPnl(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        Price.Props memory indexTokenPrice,
        bool isLong,
        bool maximize
    ) external view returns (int256) {
        return MarketUtils.getPnl(dataStore, market, longToken, shortToken, indexTokenPrice, isLong, maximize);
    }

    function getOpenInterestWithPnl(
        DataStore dataStore,
        address market,
        address longToken,
        address shortToken,
        Price.Props memory indexTokenPrice,
        bool isLong,
        bool maximize
    ) external view returns (int256) {
        return
            MarketUtils.getOpenInterestWithPnl(
                dataStore,
                market,
                longToken,
                shortToken,
                indexTokenPrice,
                isLong,
                maximize
            );
    }

    function getPnlToPoolFactor(
        DataStore dataStore,
        address marketAddress,
        MarketUtils.MarketPrices memory prices,
        bool isLong,
        bool maximize
    ) external view returns (int256) {
        Market.Props memory market = MarketStoreUtils.get(dataStore, marketAddress);
        return MarketUtils.getPnlToPoolFactor(dataStore, market, prices, isLong, maximize);
    }
}
