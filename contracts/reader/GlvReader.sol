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
        bytes32 pnlFactorType,
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
                pnlFactorType,
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
        bytes32 pnlFactorType,
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
                pnlFactorType,
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

    function getGlvDeposits(
        DataStore dataStore,
        uint256 start,
        uint256 end
    ) external view returns (GlvDeposit.Props[] memory) {
        bytes32[] memory glvDepositKeys = GlvDepositStoreUtils.getGlvDepositKeys(dataStore, start, end);
        GlvDeposit.Props[] memory glvDeposits = new GlvDeposit.Props[](glvDepositKeys.length);
        for (uint256 i; i < glvDepositKeys.length; i++) {
            bytes32 glvDepositKey = glvDepositKeys[i];
            GlvDeposit.Props memory glvDeposit = GlvDepositStoreUtils.get(dataStore, glvDepositKey);
            glvDeposits[i] = glvDeposit;
        }

        return glvDeposits;
    }

    function getAccountGlvDeposits(
        DataStore dataStore,
        address account,
        uint256 start,
        uint256 end
    ) external view returns (GlvDeposit.Props[] memory) {
        bytes32[] memory glvDepositKeys = GlvDepositStoreUtils.getAccountGlvDepositKeys(dataStore, account, start, end);
        GlvDeposit.Props[] memory glvDeposits = new GlvDeposit.Props[](glvDepositKeys.length);
        for (uint256 i; i < glvDepositKeys.length; i++) {
            bytes32 glvDepositKey = glvDepositKeys[i];
            GlvDeposit.Props memory glvDeposit = GlvDepositStoreUtils.get(dataStore, glvDepositKey);
            glvDeposits[i] = glvDeposit;
        }

        return glvDeposits;
    }

    function getGlvWithdrawal(DataStore dataStore, bytes32 key) external view returns (GlvWithdrawal.Props memory) {
        return GlvWithdrawalStoreUtils.get(dataStore, key);
    }

    function getGlvWithdrawals(
        DataStore dataStore,
        uint256 start,
        uint256 end
    ) external view returns (GlvWithdrawal.Props[] memory) {
        bytes32[] memory glvWithdrawalKeys = GlvWithdrawalStoreUtils.getGlvWithdrawalKeys(dataStore, start, end);
        GlvWithdrawal.Props[] memory glvWithdrawals = new GlvWithdrawal.Props[](glvWithdrawalKeys.length);
        for (uint256 i; i < glvWithdrawalKeys.length; i++) {
            bytes32 glvWithdrawalKey = glvWithdrawalKeys[i];
            GlvWithdrawal.Props memory glvWithdrawal = GlvWithdrawalStoreUtils.get(dataStore, glvWithdrawalKey);
            glvWithdrawals[i] = glvWithdrawal;
        }

        return glvWithdrawals;
    }

    function getAccountGlvWithdrawals(
        DataStore dataStore,
        address account,
        uint256 start,
        uint256 end
    ) external view returns (GlvWithdrawal.Props[] memory) {
        bytes32[] memory glvWithdrawalKeys = GlvWithdrawalStoreUtils.getAccountGlvWithdrawalKeys(
            dataStore,
            account,
            start,
            end
        );
        GlvWithdrawal.Props[] memory glvWithdrawals = new GlvWithdrawal.Props[](glvWithdrawalKeys.length);
        for (uint256 i; i < glvWithdrawalKeys.length; i++) {
            bytes32 glvWithdrawalKey = glvWithdrawalKeys[i];
            GlvWithdrawal.Props memory glvWithdrawal = GlvWithdrawalStoreUtils.get(dataStore, glvWithdrawalKey);
            glvWithdrawals[i] = glvWithdrawal;
        }

        return glvWithdrawals;
    }

    function getGlvShift(DataStore dataStore, bytes32 key) external view returns (GlvShift.Props memory) {
        return GlvShiftStoreUtils.get(dataStore, key);
    }

    function getGlvShifts(
        DataStore dataStore,
        uint256 start,
        uint256 end
    ) external view returns (GlvShift.Props[] memory) {
        bytes32[] memory glvShiftKeys = GlvShiftStoreUtils.getGlvShiftKeys(dataStore, start, end);
        GlvShift.Props[] memory glvShifts = new GlvShift.Props[](glvShiftKeys.length);
        for (uint256 i; i < glvShiftKeys.length; i++) {
            bytes32 glvShiftKey = glvShiftKeys[i];
            GlvShift.Props memory glvShift = GlvShiftStoreUtils.get(dataStore, glvShiftKey);
            glvShifts[i] = glvShift;
        }

        return glvShifts;
    }
}
