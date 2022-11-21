// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../events/EventEmitter.sol";

import "../order/OrderStore.sol";
import "../position/PositionUtils.sol";
import "../nonce/NonceUtils.sol";
import "../utils/Null.sol";

library AdlUtils {
    using SafeCast for int256;
    using Array for uint256[];
    using Market for Market.Props;

    struct CreateAdlOrderParams {
        DataStore dataStore;
        OrderStore orderStore;
        PositionStore positionStore;
        address account;
        address market;
        address collateralToken;
        bool isLong;
        uint256 sizeDeltaUsd;
        uint256 oracleBlockNumber;
    }

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
            params.oracleBlockNumber // updatedAtBlock
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

    function getLatestAdlBlock(DataStore dataStore, address market, bool isLong) internal view returns (uint256) {
        return dataStore.getUint(Keys.latestAdlBlockKey(market, isLong));
    }

    function setLatestAdlBlock(DataStore dataStore, address market, bool isLong, uint256 value) internal returns (uint256) {
        return dataStore.setUint(Keys.latestAdlBlockKey(market, isLong), value);
    }

    function getIsAdlEnabled(DataStore dataStore, address market, bool isLong) internal view returns (bool) {
        return dataStore.getBool(Keys.isAdlEnabledKey(market, isLong));
    }

    function setIsAdlEnabled(DataStore dataStore, address market, bool isLong, bool value) internal returns (bool) {
        return dataStore.setBool(Keys.isAdlEnabledKey(market, isLong), value);
    }
}
