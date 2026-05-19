// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../data/DataStore.sol";
import "../data/Keys2.sol";
import "../error/Errors.sol";
import "../token/TokenUtils.sol";

enum DistributionState {
    None,
    Initiated,
    ReadDataReceived,
    BridgingCompleted
}

struct Transfer {
    uint256 from;
    uint256 to;
    uint256 amount;
}

// @title FeeDistributorUtils
library FeeDistributorUtils {
    function withdrawNativeToken(DataStore dataStore, address receiver, uint256 amount) external {
        TokenUtils.sendNativeToken(dataStore, receiver, amount);
    }

    function withdrawToken(DataStore dataStore, address token, address receiver, uint256 amount) external {
        TokenUtils.transfer(dataStore, token, receiver, amount);
    }

    function calculateKeeperCosts(DataStore dataStore) external view returns (uint256, uint256) {
        address[] memory keepers = dataStore.getAddressArray(Keys2.FEE_DISTRIBUTOR_KEEPER_COSTS);
        uint256[] memory keepersTargetBalance = dataStore.getUintArray(Keys2.FEE_DISTRIBUTOR_KEEPER_COSTS);
        bool[] memory keepersV2 = dataStore.getBoolArray(Keys2.FEE_DISTRIBUTOR_KEEPER_COSTS);
        if (keepers.length != keepersTargetBalance.length || keepers.length != keepersV2.length) {
            revert Errors.KeeperArrayLengthMismatch(keepers.length, keepersTargetBalance.length, keepersV2.length);
        }

        uint256 keeperCostsV1;
        uint256 keeperCostsV2;
        for (uint256 i; i < keepers.length; i++) {
            uint256 keeperTargetBalance = keepersTargetBalance[i];
            uint256 keeperBalance = keepers[i].balance;
            if (keeperTargetBalance > keeperBalance) {
                uint256 keeperCost = keeperTargetBalance - keeperBalance;
                if (!keepersV2[i]) {
                    keeperCostsV1 += keeperCost;
                } else {
                    keeperCostsV2 += keeperCost;
                }
            }
        }

        return (keeperCostsV1, keeperCostsV2);
    }

    function retrieveChainIds(DataStore dataStore) external view returns (uint256[] memory) {
        uint256[] memory chainIds = dataStore.getUintArray(Keys2.FEE_DISTRIBUTOR_CHAIN_ID);
        sort(chainIds, 0, int256(chainIds.length - 1));
        return chainIds;
    }

    function computeTransfers(
        uint256[] memory balances,
        uint256[] memory targetBalances
    ) external pure returns (Transfer[] memory) {
        uint256 n = balances.length;
        if (targetBalances.length != n) {
            revert Errors.BridgingBalanceArrayMismatch(n, targetBalances.length);
        }

        int256[] memory diff = new int256[](n);
        for (uint256 i; i < n; i++) {
            diff[i] = int256(targetBalances[i]) - int256(balances[i]);
        }

        Transfer[] memory transfers = new Transfer[](n * n); // max possible
        uint256 count = 0;

        for (uint256 i; i < n; i++) {
            if (diff[i] <= 0) continue;

            for (uint256 j; j < n && diff[i] > 0; j++) {
                if (diff[j] >= 0) continue;

                uint256 sendAmount = uint256(min(diff[i], -diff[j]));
                if (sendAmount > 0) {
                    transfers[count++] = Transfer(j, i, sendAmount);
                    diff[i] -= int256(sendAmount);
                    diff[j] += int256(sendAmount);
                }
            }
        }

        // Trim output
        Transfer[] memory result = new Transfer[](count);
        for (uint256 i; i < count; i++) {
            result[i] = transfers[i];
        }

        return result;
    }

    function min(int256 a, int256 b) internal pure returns (int256) {
        return a < b ? a : b;
    }

    function sort(uint256[] memory chainIds, int256 left, int256 right) internal pure {
        int256 i = left;
        int256 j = right;
        uint256 pivot = chainIds[uint256(left + (right - left) / 2)];

        while (i <= j) {
            while (chainIds[uint256(i)] < pivot) i++;
            while (chainIds[uint256(j)] > pivot) j--;
            if (i <= j) {
                (chainIds[uint256(i)], chainIds[uint256(j)]) = (chainIds[uint256(j)], chainIds[uint256(i)]);
                i++;
                j--;
            }
        }
        if (left < j) sort(chainIds, left, j);
        if (i < right) sort(chainIds, i, right);
    }
}
