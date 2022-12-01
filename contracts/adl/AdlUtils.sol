// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../event/EventEmitter.sol";

import "../order/OrderStore.sol";
import "../position/PositionUtils.sol";
import "../nonce/NonceUtils.sol";
import "../utils/Null.sol";

// @title AdlUtils
// @dev Library to help with auto-deleveraging
// This is particularly for markets with an index token that is different from
// the long token
//
// For example, if there is a DOGE / USD perp market with ETH as the long token
// it would be possible for the price of DOGE to increase faster than the price of
// ETH
//
// In this scenario, profitable positions should be automatically closed to ensure
// that the system remains fully solvent
library AdlUtils {
    using SafeCast for int256;
    using Array for uint256[];
    using Market for Market.Props;

    // @dev CreateAdlOrderParams struct used in createAdlOrder to avoid stack
    // too deep errors
    //
    // @param dataStore DataStore
    // @param orderStore OrderStore
    // @param positionStore PositionStore
    // @param account the account to reduce the position for
    // @param market the position's market
    // @param collateralToken the position's collateralToken
    // @param isLong whether the position is long or short
    // @param sizeDeltaUsd the size to reduce the position by
    // @param updatedAtBlock the block to set the order's updatedAtBlock to
    struct CreateAdlOrderParams {
        DataStore dataStore;
        OrderStore orderStore;
        PositionStore positionStore;
        address account;
        address market;
        address collateralToken;
        bool isLong;
        uint256 sizeDeltaUsd;
        uint256 updatedAtBlock;
    }

    // @dev Multiple positions may need to be reduced to ensure that the pending
    // profits does not exceed the allowed thresholds
    //
    // This automatic reduction of positions can only be done if the pool is in a state
    // where auto-deleveraging is required
    //
    // This function checks the pending profit state and updates an isAdlEnabled
    // flag to avoid having to repeatedly validate whether auto-deleveraging is required
    //
    // Once the pending profit has been reduced below the threshold this function can
    // be called again to clear the flag
    //
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param marketStore MarketStore
    // @param oracle Oracle
    // @param market address of the market to check
    // @param isLong indicates whether to check the long or short side of the market
    // @param oracleBlockNumbers the oracle block numbers for the prices stored in the oracle
    function updateAdlState(
        DataStore dataStore,
        EventEmitter eventEmitter,
        MarketStore marketStore,
        Oracle oracle,
        address market,
        bool isLong,
        uint256[] memory oracleBlockNumbers
    ) external {
        uint256 latestAdlBlock = getLatestAdlBlock(dataStore, market, isLong);

        uint256 oracleBlockNumber = oracleBlockNumbers[0];
        if (!oracleBlockNumbers.areEqualTo(oracleBlockNumber)) {
            revert("OrderHandler: Oracle block numbers must be equivalent");
        }

        if (oracleBlockNumber < latestAdlBlock) {
            revert("OrderHandler: Invalid oracle block number");
        }

        int256 pnlToPoolFactor = MarketUtils.getPnlToPoolFactor(dataStore, marketStore, oracle, market, isLong, true);
        uint256 maxPnlFactor = MarketUtils.getMaxPnlFactor(dataStore, market, isLong);

        bool shouldEnableAdl = pnlToPoolFactor > 0 && pnlToPoolFactor.toUint256() > maxPnlFactor;

        setIsAdlEnabled(dataStore, market, isLong, shouldEnableAdl);
        setLatestAdlBlock(dataStore, market, isLong, block.number);

        eventEmitter.emitAdlStateUpdated(pnlToPoolFactor, maxPnlFactor, shouldEnableAdl);
    }

    // @dev Construct an ADL order
    //
    // A decrease order is used to reduce a profitable position
    //
    // @param params CreateAdlOrderParams
    // @return the key of the created order
    function createAdlOrder(CreateAdlOrderParams memory params) external returns (bytes32) {
        bytes32 positionKey = PositionUtils.getPositionKey(params.account, params.market, params.collateralToken, params.isLong);
        Position.Props memory position = params.positionStore.get(positionKey);

        if (params.sizeDeltaUsd > position.sizeInUsd) {
            revert("Invalid sizeDeltaUsd");
        }

        Order.Addresses memory addresses = Order.Addresses(
            params.account, // account
            params.account, // receiver
            address(0), // callbackContract
            params.market, // market
            position.collateralToken, // initialCollateralToken
            new address[](0) // swapPath
        );

        Order.Numbers memory numbers = Order.Numbers(
            params.sizeDeltaUsd, // sizeDeltaUsd
            0, // initialCollateralDeltaAmount
            0, // triggerPrice
            position.isLong ? 0 : type(uint256).max, // acceptablePrice
            0, // executionFee
            0, // callbackGasLimit
            0, // minOutputAmount
            params.updatedAtBlock // updatedAtBlock
        );

        Order.Flags memory flags = Order.Flags(
            Order.OrderType.MarketDecrease, // orderType
            position.isLong, // isLong
            true, // shouldUnwrapNativeToken
            false // isFrozen
        );

        Order.Props memory order = Order.Props(
            addresses,
            numbers,
            flags,
            Null.BYTES
        );

        bytes32 key = NonceUtils.getNextKey(params.dataStore);
        params.orderStore.set(key, order);

        return key;
    }

    // @dev validate if the requested ADL can be executed
    //
    // @param dataStore DataStore
    // @param market address of the market to check
    // @param isLong indicates whether to check the long or short side of the market
    // @param oracleBlockNumbers the oracle block numbers for the prices stored in the oracle
    function validateAdl(
        DataStore dataStore,
        address market,
        bool isLong,
        uint256[] memory oracleBlockNumbers
    ) external view {
        bool isAdlEnabled = AdlUtils.getIsAdlEnabled(dataStore, market, isLong);
        if (!isAdlEnabled) {
            revert("Adl is not enabled");
        }

        uint256 oracleBlockNumber = oracleBlockNumbers[0];
        if (!oracleBlockNumbers.areEqualTo(oracleBlockNumber)) {
            revert("OrderHandler: Oracle block numbers must be equivalent");
        }

        uint256 latestAdlBlock =AdlUtils.getLatestAdlBlock(dataStore, market, isLong);

        if (oracleBlockNumber < latestAdlBlock) {
            revert("OrderHandler: Invalid oracle block number");
        }
    }

    // @dev get the latest block at which the ADL flag was updated
    //
    // @param dataStore DataStore
    // @param market address of the market to check
    // @param isLong indicates whether to check the long or short side of the market
    //
    // @return the latest block at which the ADL flag was updated
    function getLatestAdlBlock(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.latestAdlBlockKey(market, isLong));
    }

    // @dev set the latest block at which the ADL flag was updated
    //
    // @param dataStore DataStore
    // @param market address of the market to check
    // @param isLong indicates whether to check the long or short side of the market
    // @param value the latest block value
    //
    // @return the latest block value
    function setLatestAdlBlock(DataStore dataStore, address market, bool isLong, uint256 value) internal returns (uint256) {
        return dataStore.setUint(Keys.latestAdlBlockKey(market, isLong), value);
    }

    // @dev get whether ADL is enabled
    //
    // @param dataStore DataStore
    // @param market address of the market to check
    // @param isLong indicates whether to check the long or short side of the market
    //
    // @return whether ADL is enabled
    function getIsAdlEnabled(DataStore dataStore, address market, bool isLong) internal view returns (bool) {
        return dataStore.getBool(Keys.isAdlEnabledKey(market, isLong));
    }

    // @dev set whether ADL is enabled
    //
    // @param dataStore DataStore
    // @param market address of the market to check
    // @param isLong indicates whether to check the long or short side of the market
    // @param value whether ADL is enabled
    //
    // @return whether ADL is enabled
    function setIsAdlEnabled(DataStore dataStore, address market, bool isLong, bool value) internal returns (bool) {
        return dataStore.setBool(Keys.isAdlEnabledKey(market, isLong), value);
    }
}
