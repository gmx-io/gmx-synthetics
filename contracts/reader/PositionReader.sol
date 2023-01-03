// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/Keys.sol";
import "../position/Position.sol";
import "../position/PositionUtils.sol";
import "../position/PositionStoreUtils.sol";

// @title PositionReader
// @dev Library for position read functions
contract PositionReader {
    using Position for Position.Props;

    struct PositionInfo {
        Position.Props position;
        uint256 pendingBorrowingFees;
        PositionPricingUtils.PositionFundingFees pendingFundingFees;
    }

    function getPosition(DataStore dataStore, bytes32 key) external view returns (Position.Props memory) {
        return PositionStoreUtils.get(dataStore, key);
    }

    function getAccountPositions(
        DataStore dataStore,
        address account,
        uint256 start,
        uint256 end
    ) external view returns (Position.Props[] memory) {
        uint256 positionCount = PositionStoreUtils.getAccountPositionCount(dataStore, account);
        if (start >= positionCount) { return new Position.Props[](0); }
        if (end > positionCount) { end = positionCount; }

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
        MarketStore marketStore,
        address account,
        uint256 start,
        uint256 end
    ) external view returns (PositionInfo[] memory) {
        uint256 positionCount = PositionStoreUtils.getAccountPositionCount(dataStore, account);
        if (start >= positionCount) { return new PositionInfo[](0); }
        if (end > positionCount) { end = positionCount; }

        bytes32[] memory positionKeys = PositionStoreUtils.getAccountPositionKeys(dataStore, account, start, end);
        PositionInfo[] memory positionInfoList = new PositionInfo[](positionKeys.length);
        for (uint256 i = 0; i < positionKeys.length; i++) {
            bytes32 positionKey = positionKeys[i];
            positionInfoList[i] = getPositionInfo(dataStore, marketStore, positionKey);
        }

        return positionInfoList;
    }

    function getPositionInfo(
        DataStore dataStore,
        MarketStore marketStore,
        bytes32 positionKey
    ) public view returns (PositionInfo memory) {
        Position.Props memory position = PositionStoreUtils.get(dataStore, positionKey);
        Market.Props memory market = marketStore.get(position.market());
        uint256 pendingBorrowingFees = MarketUtils.getBorrowingFees(dataStore, position);
        PositionPricingUtils.PositionFundingFees memory pendingFundingFees = PositionPricingUtils.getFundingFees(
            dataStore,
            position,
            market.longToken,
            market.shortToken
        );

        return PositionInfo(position, pendingBorrowingFees, pendingFundingFees);
    }

    function getPositionFees(
        DataStore dataStore,
        IReferralStorage referralStorage,
        Position.Props memory position,
        Price.Props memory collateralTokenPrice,
        address longToken,
        address shortToken,
        uint256 sizeDeltaUsd
    ) external view returns (PositionPricingUtils.PositionFees memory) {
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
}
