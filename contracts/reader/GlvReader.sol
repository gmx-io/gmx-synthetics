// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../position/Position.sol";

import "../market/Market.sol";
import "../price/Price.sol";

import "../position/Position.sol";
import "../market/Market.sol";

import "../glv/GlvUtils.sol";
import "../glv/GlvStoreUtils.sol";
import "../glv/glvDeposit/GlvDepositStoreUtils.sol";
import "../glv/glvWithdrawal/GlvWithdrawalStoreUtils.sol";
import "../glv/glvShift/GlvShiftStoreUtils.sol";

// @title GlvReader
contract GlvReader {
    function getGlvValue(
        DataStore dataStore,
        address[] memory marketAddresses,
        Price.Props[] memory indexTokenPrices,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        address glv,
        bool maximize
    ) external view returns (uint256) {
        return
            GlvUtils.getGlvValue(
                dataStore,
                marketAddresses,
                indexTokenPrices,
                longTokenPrice,
                shortTokenPrice,
                glv,
                maximize
            );
    }

    function getGlvTokenPrice(
        DataStore dataStore,
        address[] memory marketAddresses,
        Price.Props[] memory indexTokenPrices,
        Price.Props memory longTokenPrice,
        Price.Props memory shortTokenPrice,
        address glv,
        bool maximize
    ) external view returns (uint256, uint256, uint256) {
        return
            GlvUtils.getGlvTokenPrice(
                dataStore,
                marketAddresses,
                indexTokenPrices,
                longTokenPrice,
                shortTokenPrice,
                glv,
                maximize
            );
    }

    function getGlv(DataStore dataStore, address key) external view returns (Glv.Props memory) {
        return GlvStoreUtils.get(dataStore, key);
    }

    function getGlvBySalt(DataStore dataStore, bytes32 salt) external view returns (Glv.Props memory) {
        return GlvStoreUtils.getBySalt(dataStore, salt);
    }

    function getGlvs(DataStore dataStore, uint256 start, uint256 end) external view returns (Glv.Props[] memory) {
        address[] memory glvKeys = GlvStoreUtils.getGlvKeys(dataStore, start, end);
        Glv.Props[] memory glvs = new Glv.Props[](glvKeys.length);
        for (uint256 i; i < glvKeys.length; i++) {
            address glvKey = glvKeys[i];
            Glv.Props memory glv = GlvStoreUtils.get(dataStore, glvKey);
            glvs[i] = glv;
        }

        return glvs;
    }

    function getGlvDeposit(DataStore dataStore, bytes32 key) external view returns (GlvDeposit.Props memory) {
        return GlvDepositStoreUtils.get(dataStore, key);
    }

    function getGlvWithdrawal(DataStore dataStore, bytes32 key) external view returns (GlvWithdrawal.Props memory) {
        return GlvWithdrawalStoreUtils.get(dataStore, key);
    }

    function getGlvShift(DataStore dataStore, bytes32 key) external view returns (GlvShift.Props memory) {
        return GlvShiftStoreUtils.get(dataStore, key);
    }
}