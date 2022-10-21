// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../market/MarketUtils.sol";

contract Reader {
    function priceFeedKey(address token) external pure returns (bytes32) {
        return Keys.priceFeedKey(token);
    }

    function priceFeedPrecisionKey(address token) external pure returns (bytes32) {
        return Keys.priceFeedPrecisionKey(token);
    }

    function reserveFactorKey(address market, bool isLong) external pure returns (bytes32) {
        return Keys.reserveFactorKey(market, isLong);
    }

    function swapFeeFactorKey(address market) external pure returns (bytes32) {
        return Keys.swapFeeFactorKey(market);
    }

    function swapSpreadFactorKey(address market) external pure returns (bytes32) {
        return Keys.swapSpreadFactorKey(market);
    }

    function swapImpactFactorKey(address market, bool isPositive) external pure returns (bytes32) {
        return Keys.swapImpactFactorKey(market, isPositive);
    }

    function swapImpactExponentFactorKey(address market) external pure returns (bytes32) {
        return Keys.swapImpactExponentFactorKey(market);
    }

    function oraclePrecisionKey(address token) external pure returns (bytes32) {
        return Keys.oraclePrecisionKey(token);
    }

    function getPoolAmount(DataStore dataStore, address market, address token) external view returns (uint256) {
        return MarketUtils.getPoolAmount(dataStore, market, token);
    }

    function getSwapImpactPoolAmount(DataStore dataStore, address market, address token) external view returns (uint256) {
        return MarketUtils.getSwapImpactPoolAmount(dataStore, market, token);
    }

    function getMarketTokenPrice(
        DataStore dataStore,
        Market.Props memory market,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        Price.Props memory indexTokenPrice,
        bool maximize
    ) external view returns (uint256) {
        return MarketUtils.getMarketTokenPrice(
            dataStore,
            market,
            longTokenPrice,
            shortTokenPrice,
            indexTokenPrice,
            maximize
        );
    }
}
