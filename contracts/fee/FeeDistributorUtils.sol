// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@layerzerolabs/oft-evm/contracts/OFTCore.sol";
import "../data/DataStore.sol";
import "../data/Keys2.sol";
import "../error/Errors.sol";
import "../token/TokenUtils.sol";
import "../utils/Precision.sol";
import "../utils/Cast.sol";
import "./FeeDistributorVault.sol";

enum DistributionState {
    None,
    Initiated,
    ReadDataReceived,
    BridgingCompleted,
    // Committed logically precedes Initiated but is appended so persisted numeric values are unchanged
    Committed
}

struct Transfer {
    uint256 from;
    uint256 to;
    uint256 amount;
}

// @title FeeDistributorUtils
library FeeDistributorUtils {
    struct BridgeGmxParams {
        DataStore dataStore;
        FeeDistributorVault feeDistributorVault;
        address gmx;
        uint256[] chainIds;
        Transfer[] transfers;
        uint256 currentChainIndex;
    }

    function calculateFeeAmounts(
        DataStore dataStore,
        address feeDistributorVault,
        address secondaryFeeToken
    ) external returns (uint256 feesForKeepers, uint256 feesForChainlink, uint256 feesForTreasury) {
        // calculate the amount of secondaryFeeToken that needs to be sent to each keeper
        address[] memory keepers = dataStore.getAddressArray(Keys2.FEE_DISTRIBUTOR_KEEPER_COSTS);
        uint256[] memory keepersTargetBalance = dataStore.getUintArray(Keys2.FEE_DISTRIBUTOR_KEEPER_COSTS);
        if (keepers.length != keepersTargetBalance.length) {
            revert Errors.KeeperArrayLengthMismatch(keepers.length, keepersTargetBalance.length);
        }

        for (uint256 i; i < keepers.length; i++) {
            uint256 keeperTargetBalance = keepersTargetBalance[i];
            uint256 keeperBalance = keepers[i].balance;
            if (keeperTargetBalance > keeperBalance) {
                feesForKeepers += (keeperTargetBalance - keeperBalance);
            }
        }

        // calculate secondaryFeeToken fee amounts and transfer to appropriate addresses
        uint256 totalSecondaryFeeTokenBalance = IERC20(secondaryFeeToken).balanceOf(feeDistributorVault);

        // calculate the amount of secondaryFeeToken for chainlink costs and to be sent to the treasury
        feesForChainlink = Precision.applyFactor(
            totalSecondaryFeeTokenBalance,
            dataStore.getUint(Keys2.FEE_DISTRIBUTOR_CHAINLINK_FACTOR)
        );
        feesForTreasury = totalSecondaryFeeTokenBalance - feesForChainlink;

        if (feesForKeepers > feesForTreasury) {
            uint256 maxFeesFromTreasury = dataStore.getUint(Keys2.FEE_DISTRIBUTOR_MAX_FEE_AMOUNT_FROM_TREASURY);
            uint256 additionalFeesFromTreasury = feesForKeepers - feesForTreasury;
            if (additionalFeesFromTreasury > maxFeesFromTreasury) {
                revert Errors.MaxFeesFromTreasuryExceeded(maxFeesFromTreasury, additionalFeesFromTreasury);
            }
            IERC20(secondaryFeeToken).transferFrom(
                dataStore.getAddress(Keys2.feeDistributorAddressInfoKey(keccak256(abi.encode("TREASURY")))),
                feeDistributorVault,
                additionalFeesFromTreasury
            );
            feesForTreasury = 0;
        } else {
            feesForTreasury -= feesForKeepers;
        }
    }

    function withdrawNativeToken(DataStore dataStore, address receiver, uint256 amount) external {
        TokenUtils.sendNativeToken(dataStore, receiver, amount);
    }

    function withdrawToken(DataStore dataStore, address token, address receiver, uint256 amount) external {
        TokenUtils.transfer(dataStore, token, receiver, amount);
    }

    function retrieveChainIds(DataStore dataStore) external view returns (uint256[] memory) {
        uint256[] memory chainIds = dataStore.getUintArray(Keys2.FEE_DISTRIBUTOR_CHAIN_ID);
        sort(chainIds, 0, int256(chainIds.length - 1));
        return chainIds;
    }

    function getGmxAmounts(
        DataStore dataStore,
        address feeDistributorVault,
        address gmx,
        uint256 currentChainId
    ) external view returns (uint256, uint256, uint256) {
        uint256 totalFeeAmountGmx = dataStore.getUint(Keys2.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);
        uint256 stakedGmxCurrentChain = dataStore.getUint(Keys2.feeDistributorStakedGmxKey(currentChainId));
        uint256 totalStakedGmx = dataStore.getUint(Keys2.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);
        uint256 requiredGmxAmount = Precision.mulDiv(totalFeeAmountGmx, stakedGmxCurrentChain, totalStakedGmx);
        uint256 origFeeAmountGmx = dataStore.getUint(Keys2.feeDistributorFeeAmountGmxKey(currentChainId));

        // The incoming minimum was calculated from the individual bridgeable transfers when
        // the read response was processed, rather than from the undusted aggregate deficit.
        uint256 minRequiredGmxAmount = origFeeAmountGmx + dataStore.getUint(Keys2.FEE_DISTRIBUTOR_MIN_INCOMING_GMX);
        // retrieve the current GMX available to distribute now that bridging has been completed, excluding the
        // GMX that became withdrawable after the fee amount was snapshotted and capping the amount at this chain's
        // calculated GMX amount, so that any excess is distributed in the next fee distribution period
        uint256 postSnapshotFeeAmountGmx = dataStore.getUint(Keys2.FEE_DISTRIBUTOR_POST_SNAPSHOT_FEE_AMOUNT_GMX);
        uint256 gmxBalance = IERC20(gmx).balanceOf(feeDistributorVault);
        uint256 feeAmountGmx = gmxBalance > postSnapshotFeeAmountGmx ? gmxBalance - postSnapshotFeeAmountGmx : 0;
        if (feeAmountGmx > requiredGmxAmount) {
            feeAmountGmx = requiredGmxAmount;
        }

        return (origFeeAmountGmx, minRequiredGmxAmount, feeAmountGmx);
    }

    function getGmxTransfers(
        uint256 totalFeeAmountGmx,
        uint256[] memory stakedAmountsGmx,
        uint256 totalStakedGmx,
        uint256[] memory feeAmountsGmx
    ) external pure returns (Transfer[] memory) {
        uint256[] memory target = new uint256[](feeAmountsGmx.length);
        for (uint256 i; i < target.length; i++) {
            target[i] = Precision.mulDiv(totalFeeAmountGmx, stakedAmountsGmx[i], totalStakedGmx);
        }
        return computeTransfers(feeAmountsGmx, target);
    }

    function bridgeGmx(BridgeGmxParams memory params) external returns (uint256 totalGmxBridgedOut) {
        address oft = params.dataStore.getAddress(
            Keys2.feeDistributorAddressInfoKey(keccak256(abi.encode("LAYERZERO_OFT")))
        );
        OFTCore layerzeroOft = OFTCore(oft);
        uint256 conversionRate = layerzeroOft.decimalConversionRate();
        for (uint256 i; i < params.transfers.length; i++) {
            if (params.transfers[i].from != params.currentChainIndex) continue;
            uint256 chainId = params.chainIds[params.transfers[i].to];
            (uint256 sendAmount, uint256 minReceived) = getBridgeAmounts(
                params.transfers[i].amount,
                conversionRate,
                params.dataStore.getUint(Keys2.feeDistributorBridgeSlippageFactorKey(chainId))
            );
            if (sendAmount == 0) continue;

            // Library calls execute in FeeDistributor's context, including vault transfers,
            // approvals, native fee payments and the LayerZero refund address.
            params.feeDistributorVault.transferOut(params.gmx, address(this), sendAmount);
            if (layerzeroOft.approvalRequired()) {
                IERC20(params.gmx).approve(oft, sendAmount);
            }

            SendParam memory sendParam;
            sendParam.dstEid = uint32(params.dataStore.getUint(Keys2.feeDistributorLayerZeroChainIdKey(chainId)));
            sendParam.to = Cast.toBytes32(
                params.dataStore.getAddress(
                    Keys2.feeDistributorAddressInfoForChainKey(chainId, keccak256(abi.encode("FEE_DISTRIBUTOR_VAULT")))
                )
            );
            sendParam.amountLD = sendAmount;
            sendParam.minAmountLD = minReceived;
            sendParam.extraOptions = "";
            sendParam.composeMsg = "";
            sendParam.oftCmd = "";
            MessagingFee memory messagingFee = layerzeroOft.quoteSend(sendParam, false);
            layerzeroOft.send{ value: messagingFee.nativeFee }(sendParam, messagingFee, address(this));
            totalGmxBridgedOut += sendAmount;
        }
    }

    function getMinIncomingGmx(
        DataStore dataStore,
        Transfer[] memory transfers,
        uint256 currentChainIndex,
        uint256 currentChainId
    ) external view returns (uint256 minIncomingGmx) {
        // GMX uses the same local and shared decimals on all supported chains. The OFT
        // conversion rate and destination receipt factors must agree across the deployment.
        address oft = dataStore.getAddress(Keys2.feeDistributorAddressInfoKey(keccak256(abi.encode("LAYERZERO_OFT"))));
        uint256 conversionRate = OFTCore(oft).decimalConversionRate();
        uint256 receiptFactor = dataStore.getUint(Keys2.feeDistributorBridgeSlippageFactorKey(currentChainId));
        for (uint256 i; i < transfers.length; i++) {
            if (transfers[i].to != currentChainIndex) continue;
            (, uint256 minReceived) = getBridgeAmounts(transfers[i].amount, conversionRate, receiptFactor);
            minIncomingGmx += minReceived;
        }
    }

    function getBridgeAmounts(
        uint256 plannedAmount,
        uint256 conversionRate,
        uint256 receiptFactor
    ) internal pure returns (uint256 sendAmount, uint256 minReceived) {
        sendAmount = (plannedAmount / conversionRate) * conversionRate;
        // A minimum is a comparison threshold, not a transfer amount. Rounding it to an
        // OFT unit again could turn the receipt requirement for a nonzero transfer into zero.
        minReceived = Precision.applyFactor(sendAmount, receiptFactor);
    }

    function computeTransfers(
        uint256[] memory balances,
        uint256[] memory targetBalances
    ) public pure returns (Transfer[] memory) {
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

    // how long after the epoch week a read may still be requested
    uint256 internal constant MAX_INITIATION_GRACE = 1 hours;
    // longest a response may stay valid; the configured delay cannot exceed this
    uint256 internal constant MAX_READ_RESPONSE_DELAY_BOUND = 3 days;
    // allowance for cross-chain block.timestamp drift before a reset
    uint256 internal constant MIN_RESET_TIMESTAMP_MARGIN = 1 hours;

    function initiationDeadline(uint256 epoch) external pure returns (uint256) {
        return _initiationDeadline(epoch);
    }

    function resetAvailableAt(uint256 epoch) external pure returns (uint256) {
        return _initiationDeadline(epoch) + MAX_READ_RESPONSE_DELAY_BOUND + MIN_RESET_TIMESTAMP_MARGIN;
    }

    function maxReadResponseDelayBound() external pure returns (uint256) {
        return MAX_READ_RESPONSE_DELAY_BOUND;
    }

    function _initiationDeadline(uint256 epoch) private pure returns (uint256) {
        return epoch + 1 weeks + MAX_INITIATION_GRACE;
    }
}
