// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// @title ChainlinkPriceFeedProviderUtils
// @dev Library for Chainlink price feed
library ChainlinkPriceFeedUtils {
    // there is a small risk of stale pricing due to latency in price updates or if the chain is down
    // this is meant to be for temporary use until low latency price feeds are supported for all tokens
    function getPriceFeedPrice(DataStore dataStore, address token) internal view returns (bool, uint256) {
        address priceFeedAddress = dataStore.getAddress(Keys.priceFeedKey(token));
        if (priceFeedAddress == address(0)) {
            return (false, 0);
        }

        IPriceFeed priceFeed = IPriceFeed(priceFeedAddress);

        (
            /* uint80 roundID */,
            int256 _price,
            /* uint256 startedAt */,
            uint256 timestamp,
            /* uint80 answeredInRound */
        ) = priceFeed.latestRoundData();

        if (_price <= 0) {
            revert Errors.InvalidFeedPrice(token, _price);
        }

        uint256 heartbeatDuration = dataStore.getUint(Keys.priceFeedHeartbeatDurationKey(token));
        if (Chain.currentTimestamp() > timestamp && Chain.currentTimestamp() - timestamp > heartbeatDuration) {
            revert Errors.ChainlinkPriceFeedNotUpdated(token, timestamp, heartbeatDuration);
        }

        uint256 price = SafeCast.toUint256(_price);
        uint256 precision = getPriceFeedMultiplier(dataStore, token);

        uint256 adjustedPrice = Precision.mulDiv(price, precision, Precision.FLOAT_PRECISION);

        return (true, adjustedPrice);
    }
}
