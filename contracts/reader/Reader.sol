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

import "../adl/AdlUtils.sol";

import "./ReaderUtils.sol";

// @title Reader
// @dev Library for read functions
contract Reader {
    using SafeCast for uint256;
    using Position for Position.Props;

    struct VirtualInventory {
        uint256 virtualPoolAmountForLongToken;
        uint256 virtualPoolAmountForShortToken;
        int256 virtualInventoryForPositions;
    }

    struct MarketInfo {
        Market.Props market;
        uint256 borrowingFactorPerSecondForLongs;
        uint256 borrowingFactorPerSecondForShorts;
        ReaderUtils.BaseFundingValues baseFunding;
        MarketUtils.GetNextFundingAmountPerSizeResult nextFunding;
        VirtualInventory virtualInventory;
        bool isDisabled;
    }

    function getMarket(DataStore dataStore, address key) external view returns (Market.Props memory) {
        return MarketStoreUtils.get(dataStore, key);
    }

    function getMarketBySalt(DataStore dataStore, bytes32 salt) external view returns (Market.Props memory) {
        return MarketStoreUtils.getBySalt(dataStore, salt);
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

    function getPositionPnlUsd(
        DataStore dataStore,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        bytes32 positionKey,
        uint256 sizeDeltaUsd
    ) external view returns (int256, int256, uint256) {
        Position.Props memory position = PositionStoreUtils.get(dataStore, positionKey);

        return PositionUtils.getPositionPnlUsd(dataStore, market, prices, position, sizeDeltaUsd);
    }

    function getAccountPositions(
        DataStore dataStore,
        address account,
        uint256 start,
        uint256 end
    ) external view returns (Position.Props[] memory) {
        bytes32[] memory positionKeys = PositionStoreUtils.getAccountPositionKeys(dataStore, account, start, end);
        Position.Props[] memory positions = new Position.Props[](positionKeys.length);
        for (uint256 i; i < positionKeys.length; i++) {
            bytes32 positionKey = positionKeys[i];
            positions[i] = PositionStoreUtils.get(dataStore, positionKey);
        }

        return positions;
    }

    function getAccountPositionInfoList(
        DataStore dataStore,
        IReferralStorage referralStorage,
        bytes32[] memory positionKeys,
        MarketUtils.MarketPrices[] memory prices,
        address uiFeeReceiver
    ) external view returns (ReaderUtils.PositionInfo[] memory) {
        ReaderUtils.PositionInfo[] memory positionInfoList = new ReaderUtils.PositionInfo[](positionKeys.length);
        for (uint256 i; i < positionKeys.length; i++) {
            bytes32 positionKey = positionKeys[i];
            positionInfoList[i] = getPositionInfo(
                dataStore,
                referralStorage,
                positionKey,
                prices[i],
                0, // sizeDeltaUsd
                uiFeeReceiver,
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
        address uiFeeReceiver,
        bool usePositionSizeAsSizeDeltaUsd
    ) public view returns (ReaderUtils.PositionInfo memory) {
        return
            ReaderUtils.getPositionInfo(
                dataStore,
                referralStorage,
                positionKey,
                prices,
                sizeDeltaUsd,
                uiFeeReceiver,
                usePositionSizeAsSizeDeltaUsd
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
        for (uint256 i; i < orderKeys.length; i++) {
            bytes32 orderKey = orderKeys[i];
            orders[i] = OrderStoreUtils.get(dataStore, orderKey);
        }

        return orders;
    }

    function getMarkets(DataStore dataStore, uint256 start, uint256 end) external view returns (Market.Props[] memory) {
        address[] memory marketKeys = MarketStoreUtils.getMarketKeys(dataStore, start, end);
        Market.Props[] memory markets = new Market.Props[](marketKeys.length);
        for (uint256 i; i < marketKeys.length; i++) {
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
        for (uint256 i; i < marketKeys.length; i++) {
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

        ReaderUtils.BaseFundingValues memory baseFunding = ReaderUtils.getBaseFundingValues(dataStore, market);

        MarketUtils.GetNextFundingAmountPerSizeResult memory nextFunding = ReaderUtils.getNextFundingAmountPerSize(
            dataStore,
            market,
            prices
        );

        VirtualInventory memory virtualInventory = getVirtualInventory(dataStore, market);

        bool isMarketDisabled = dataStore.getBool(Keys.isMarketDisabledKey(market.marketToken));

        return
            MarketInfo(
                market,
                borrowingFactorPerSecondForLongs,
                borrowingFactorPerSecondForShorts,
                baseFunding,
                nextFunding,
                virtualInventory,
                isMarketDisabled
            );
    }

    function getMarketTokenPrice(
        DataStore dataStore,
        Market.Props memory market,
        Price.Props memory indexTokenPrice,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        bytes32 pnlFactorType,
        bool maximize
    ) external view returns (int256, MarketPoolValueInfo.Props memory) {
        return
            MarketUtils.getMarketTokenPrice(
                dataStore,
                market,
                indexTokenPrice,
                longTokenPrice,
                shortTokenPrice,
                pnlFactorType,
                maximize
            );
    }

    function getNetPnl(
        DataStore dataStore,
        Market.Props memory market,
        Price.Props memory indexTokenPrice,
        bool maximize
    ) external view returns (int256) {
        return MarketUtils.getNetPnl(dataStore, market, indexTokenPrice, maximize);
    }

    function getPnl(
        DataStore dataStore,
        Market.Props memory market,
        Price.Props memory indexTokenPrice,
        bool isLong,
        bool maximize
    ) external view returns (int256) {
        return MarketUtils.getPnl(dataStore, market, indexTokenPrice, isLong, maximize);
    }

    function getOpenInterestWithPnl(
        DataStore dataStore,
        Market.Props memory market,
        Price.Props memory indexTokenPrice,
        bool isLong,
        bool maximize
    ) external view returns (int256) {
        return MarketUtils.getOpenInterestWithPnl(dataStore, market, indexTokenPrice, isLong, maximize);
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

    function getSwapAmountOut(
        DataStore dataStore,
        Market.Props memory market,
        MarketUtils.MarketPrices memory prices,
        address tokenIn,
        uint256 amountIn,
        address uiFeeReceiver
    ) external view returns (uint256, int256, SwapPricingUtils.SwapFees memory fees) {
        return ReaderPricingUtils.getSwapAmountOut(dataStore, market, prices, tokenIn, amountIn, uiFeeReceiver);
    }

    function getVirtualInventory(
        DataStore dataStore,
        Market.Props memory market
    ) internal view returns (VirtualInventory memory) {
        (, uint256 virtualPoolAmountForLongToken, uint256 virtualPoolAmountForShortToken) = MarketUtils
            .getVirtualInventoryForSwaps(dataStore, market.marketToken);
        (, int256 virtualInventoryForPositions) = MarketUtils.getVirtualInventoryForPositions(
            dataStore,
            market.indexToken
        );

        return
            VirtualInventory(
                virtualPoolAmountForLongToken,
                virtualPoolAmountForShortToken,
                virtualInventoryForPositions
            );
    }

    function getExecutionPrice(
        DataStore dataStore,
        address marketKey,
        Price.Props memory indexTokenPrice,
        uint256 positionSizeInUsd,
        uint256 positionSizeInTokens,
        int256 sizeDeltaUsd,
        bool isLong
    ) external view returns (ReaderPricingUtils.ExecutionPriceResult memory) {
        Market.Props memory market = MarketStoreUtils.get(dataStore, marketKey);
        return
            ReaderPricingUtils.getExecutionPrice(
                dataStore,
                market,
                indexTokenPrice,
                positionSizeInUsd,
                positionSizeInTokens,
                sizeDeltaUsd,
                isLong
            );
    }

    function getSwapPriceImpact(
        DataStore dataStore,
        address marketKey,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        Price.Props memory tokenInPrice,
        Price.Props memory tokenOutPrice
    ) external view returns (int256, int256) {
        Market.Props memory market = MarketStoreUtils.get(dataStore, marketKey);
        return
            ReaderPricingUtils.getSwapPriceImpact(
                dataStore,
                market,
                tokenIn,
                tokenOut,
                amountIn,
                tokenInPrice,
                tokenOutPrice
            );
    }

    function getAdlState(
        DataStore dataStore,
        address market,
        bool isLong,
        MarketUtils.MarketPrices memory prices
    ) external view returns (uint256, bool, int256, uint256) {
        uint256 latestAdlBlock = AdlUtils.getLatestAdlBlock(dataStore, market, isLong);
        Market.Props memory _market = MarketUtils.getEnabledMarket(dataStore, market);

        (bool shouldEnableAdl, int256 pnlToPoolFactor, uint256 maxPnlFactor) = MarketUtils.isPnlFactorExceeded(
            dataStore,
            _market,
            prices,
            isLong,
            Keys.MAX_PNL_FACTOR_FOR_ADL
        );

        return (latestAdlBlock, shouldEnableAdl, pnlToPoolFactor, maxPnlFactor);
    }
}
