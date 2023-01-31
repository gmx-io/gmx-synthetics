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

// @title Reader
// @dev Library for read functions
contract Reader {
    using Position for Position.Props;

    struct PositionInfo {
        Position.Props position;
        uint256 pendingBorrowingFees;
        PositionPricingUtils.PositionFundingFees pendingFundingFees;
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
        bytes32[] memory positionKeys,
        MarketUtils.MarketPrices[] memory prices
    ) external view returns (PositionInfo[] memory) {
        PositionInfo[] memory positionInfoList = new PositionInfo[](positionKeys.length);
        for (uint256 i = 0; i < positionKeys.length; i++) {
            bytes32 positionKey = positionKeys[i];
            positionInfoList[i] = getPositionInfo(dataStore, positionKey, prices[i]);
        }

        return positionInfoList;
    }

    function getPositionInfo(
        DataStore dataStore,
        bytes32 positionKey,
        MarketUtils.MarketPrices memory prices
    ) public view returns (PositionInfo memory) {
        Position.Props memory position = PositionStoreUtils.get(dataStore, positionKey);
        Market.Props memory market = MarketStoreUtils.get(dataStore, position.market());
        uint256 pendingBorrowingFees = MarketUtils.getNextBorrowingFees(dataStore, position, market, prices);

        MarketUtils.GetNextFundingAmountPerSizeResult memory nextFundingAmountResult = MarketUtils.getNextFundingAmountPerSize(dataStore, market, prices);

        int256 latestLongTokenFundingAmountPerSize;
        int256 latestShortTokenFundingAmountPerSize;

        if (position.isLong()) {
            latestLongTokenFundingAmountPerSize = nextFundingAmountResult.fundingAmountPerSize_LongCollateral_LongPosition;
            latestShortTokenFundingAmountPerSize = nextFundingAmountResult.fundingAmountPerSize_ShortCollateral_LongPosition;
        } else {
            latestLongTokenFundingAmountPerSize = nextFundingAmountResult.fundingAmountPerSize_LongCollateral_ShortPosition;
            latestShortTokenFundingAmountPerSize = nextFundingAmountResult.fundingAmountPerSize_ShortCollateral_ShortPosition;
        }

        PositionPricingUtils.PositionFundingFees memory pendingFundingFees = PositionPricingUtils.getFundingFees(
            position,
            market.longToken,
            market.shortToken,
            latestLongTokenFundingAmountPerSize,
            latestShortTokenFundingAmountPerSize
        );

        return PositionInfo(position, pendingBorrowingFees, pendingFundingFees);
    }

    function getPositionFees(
        DataStore dataStore,
        IReferralStorage referralStorage,
        bytes32 positionKey,
        Price.Props memory collateralTokenPrice,
        address longToken,
        address shortToken,
        uint256 sizeDeltaUsd
    ) external view returns (PositionPricingUtils.PositionFees memory) {
        Position.Props memory position = PositionStoreUtils.get(dataStore, positionKey);
        return
            PositionPricingUtils.getPositionFees(
                dataStore,
                referralStorage,
                position,
                collateralTokenPrice,
                longToken,
                shortToken,
                sizeDeltaUsd
            );
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

        MarketUtils.GetNextFundingAmountPerSizeResult memory funding = MarketUtils.getNextFundingAmountPerSize(
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
