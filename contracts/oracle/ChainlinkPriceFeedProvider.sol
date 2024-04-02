// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys.sol";
import "./IOracleProvider.sol";
import "./ChainlinkPriceFeedUtils.sol";

contract ChainlinkPriceFeedProvider is IOracleProvider {
    DataStore public immutable dataStore;

    constructor(DataStore _dataStore) {
        dataStore = _dataStore;
    }

    // @dev the timestamp returned is based on the current blockchain timestamp
    // this is because Chainlink on-chain price feeds have a lower update frequency
    // if a Chainlink on-chain price feed is used, it is assumed that the feed
    // is sufficiently updated for the intended usage
    //
    // if an on-chain Chainlink price is used together with other price feeds
    // and if the timestamp of the other price feeds are older, this could cause
    // a MaxTimestampRangeExceeded error
    // if this occurs, the MAX_TIMESTAMP_RANGE value may need to be increased
    function getOraclePrice(
        address token,
        bytes memory /* data */
    ) external view returns (OracleUtils.ValidatedPrice memory) {
        (bool hasPriceFeed, uint256 price) = ChainlinkPriceFeedUtils.getPriceFeedPrice(dataStore, token);

        if (!hasPriceFeed) {
            revert Errors.EmptyChainlinkPriceFeed(token);
        }

        uint256 stablePrice = dataStore.getUint(Keys.stablePriceKey(token));

        Price.Props memory priceProps;

        if (stablePrice > 0) {
            priceProps = Price.Props(
                price < stablePrice ? price : stablePrice,
                price < stablePrice ? stablePrice : price
            );
        } else {
            priceProps = Price.Props(
                price,
                price
            );
        }

        return OracleUtils.ValidatedPrice({
            token: token,
            min: priceProps.min,
            max: priceProps.max,
            timestamp: Chain.currentTimestamp(),
            provider: address(this)
        });
    }
}
