// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../error/Errors.sol";

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
    function sortChainIds(uint256[] memory chainIds) external pure returns (uint256[] memory) {
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
