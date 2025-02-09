// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import {MessagingFee, MessagingReceipt} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

import {MultichainReaderUtils} from "../external/MultichainReaderUtils.sol";

import "../role/RoleModule.sol";
import "./FeeHandler.sol";
import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../external/MultichainReader.sol";
import "../router/IExchangeRouter.sol";
import "../v1/IVaultV1.sol";
import "../v1/IRewardTracker.sol";
import "../v1/IRewardDistributor.sol";

contract FeeDistributor is ReentrancyGuard, RoleModule {
    using EventUtils for EventUtils.BoolItems;

    uint256 public constant v1 = 1;
    uint256 public constant v2 = 2;

    bytes32 public constant gmxKey = keccak256(abi.encode("GMX"));
    bytes32 public constant feeKeeperKey = keccak256(abi.encode("FEE_KEEPER"));
    bytes32 public constant extendedGmxTrackerKey = keccak256(abi.encode("EXTENDED_GMX_TRACKER"));
    bytes32 public constant dataStoreKey = keccak256(abi.encode("DATASTORE"));
    bytes32 public constant referralRewardsWntKey = keccak256(abi.encode("REFERRAL_REWARDS_WNT"));
    bytes32 public constant glpKey = keccak256(abi.encode("GLP"));
    bytes32 public constant treasuryKey = keccak256(abi.encode("TREASURY"));
    bytes32 public constant synapseRouterKey = keccak256(abi.encode("SYNAPSE_ROUTER"));
    bytes32 public constant feeGlpTrackerKey = keccak256(abi.encode("FEE_GLP_TRACKER"));
    bytes32 public constant chainlinkKey = keccak256(abi.encode("CHAINLINK"));

    FeeHandler public immutable feeHandler;
    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    MultichainReader public immutable multichainReader;
    IVaultV1 public immutable vaultV1;

    constructor(
        RoleStore _roleStore,
        FeeHandler _feeHandler,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        MultichainReader _multichainReader,
        IVaultV1 _vaultV1
    ) RoleModule(_roleStore) {
        feeHandler = _feeHandler;
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        multichainReader = _multichainReader;
        vaultV1 = _vaultV1;
    }

    function initiateDistribute() external nonReentrant onlyFeeDistributionKeeper {
        _validateDistributionNotCompleted();

        uint256 chainCount = dataStore.getUintCount(Keys.FEE_DISTRIBUTOR_CHAIN_ID);
        MultichainReaderUtils.ReadRequestInputs[]
            memory readRequestsInputs = new MultichainReaderUtils.ReadRequestInputs[]((chainCount - 1) * 3);
        bool skippedCurrentChain;
        uint256[] memory chainIds = dataStore.getUintValuesAt(Keys.FEE_DISTRIBUTOR_CHAIN_ID, 0, chainCount);
        for (uint256 i; i < chainCount; i++) {
            uint256 chainId = chainIds[i];
            address gmx = dataStore.getAddress(Keys.feeDistributorAddressInfoKey(chainId, gmxKey));
            address feeKeeper = dataStore.getAddress(Keys.feeDistributorAddressInfoKey(chainId, feeKeeperKey));
            address extendedGmxTracker = dataStore.getAddress(
                Keys.feeDistributorAddressInfoKey(chainId, extendedGmxTrackerKey)
            );

            if (chainId == block.chainid) {
                uint256 feeAmount = dataStore.getUint(Keys.withdrawableBuybackTokenAmountKey(gmx)) +
                    IERC20(gmx).balanceOf(feeKeeper);
                uint256 stakedGmx = IERC20(extendedGmxTracker).totalSupply();
                dataStore.setUint(Keys.feeDistributorFeeAmountKey(chainId), feeAmount);
                dataStore.setUint(Keys.feeDistributorStakedGmxKey(chainId), stakedGmx);
                skippedCurrentChain = true;
                continue;
            }

            uint32 layerZeroChainId = uint32(dataStore.getUint(Keys.feeDistributorLayerZeroChainIdKey(chainId)));
            uint256 readRequestIndex = skippedCurrentChain ? (i - 1) * 3 : i * 3;
            readRequestsInputs[readRequestIndex].chainId = layerZeroChainId;
            readRequestsInputs[readRequestIndex].target = dataStore.getAddress(
                Keys.feeDistributorAddressInfoKey(chainId, dataStoreKey)
            );
            readRequestsInputs[readRequestIndex].callData = abi.encodeWithSelector(
                DataStore.getUint.selector,
                Keys.withdrawableBuybackTokenAmountKey(gmx)
            );
            readRequestIndex++;

            readRequestsInputs[readRequestIndex].chainId = layerZeroChainId;
            readRequestsInputs[readRequestIndex].target = gmx;
            readRequestsInputs[readRequestIndex].callData = abi.encodeWithSelector(
                IERC20.balanceOf.selector,
                feeKeeper
            );
            readRequestIndex++;

            readRequestsInputs[readRequestIndex].chainId = layerZeroChainId;
            readRequestsInputs[readRequestIndex].target = extendedGmxTracker;
            readRequestsInputs[readRequestIndex].callData = abi.encodeWithSelector(IERC20.totalSupply.selector);
        }

        MultichainReaderUtils.ExtraOptionsInputs memory extraOptionsInputs;
        extraOptionsInputs.gasLimit = uint128(dataStore.getUint(Keys.FEE_DISTRIBUTOR_GAS_LIMIT));
        extraOptionsInputs.returnDataSize = ((uint32(chainCount) - 1) * 96) + 8;

        MessagingFee memory messagingFee = multichainReader.quoteReadFee(readRequestsInputs, extraOptionsInputs);
        multichainReader.sendReadRequests{value: messagingFee.nativeFee}(readRequestsInputs, extraOptionsInputs);

        dataStore.setBool(Keys.FEE_DISTRIBUTOR_DISTRIBUTION_INITIATED, true);
    }

    function processLzReceive(
        bytes32 /*guid*/,
        MultichainReaderUtils.ReceivedData calldata receivedDataInput
    ) external {
        _validateReadResponseTimestamp(receivedDataInput.timestamp);
        dataStore.setUint(Keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP, receivedDataInput.timestamp);

        uint256 chainCount = dataStore.getUintCount(Keys.FEE_DISTRIBUTOR_CHAIN_ID);
        uint256[] memory chainIds = dataStore.getUintValuesAt(Keys.FEE_DISTRIBUTOR_CHAIN_ID, 0, chainCount);
        for (uint256 i; i < chainCount; i++) {
            uint256 chainId = chainIds[i];
            bool skippedCurrentChain;
            if (chainId == block.chainid) {
                skippedCurrentChain = true;
                continue;
            }

            uint256 offset = skippedCurrentChain ? (i - 1) * 96 : i * 96;
            (uint256 feeAmount1, uint256 feeAmount2, uint256 stakedGmx) = abi.decode(
                receivedDataInput.readData[offset:offset + 96],
                (uint256, uint256, uint256)
            );
            dataStore.setUint(Keys.feeDistributorFeeAmountKey(chainId), feeAmount1 + feeAmount2);
            dataStore.setUint(Keys.feeDistributorStakedGmxKey(chainId), stakedGmx);
        }

        EventUtils.EventLogData memory eventData;
        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "distributeReferralRewards", false);

        eventEmitter.emitEventLog("TriggerReferralKeeper", eventData);
    }

    function distribute() external nonReentrant onlyFeeDistributionKeeper {
        if (!dataStore.getBool(Keys.FEE_DISTRIBUTOR_DISTRIBUTION_INITIATED)) {
            revert Errors.DistributionNotInitiated();
        }
        _validateReadResponseTimestamp(dataStore.getUint(Keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP));
        _validateDistributionNotCompleted();

        address wnt = dataStore.getAddress(Keys.WNT);
        uint256 wntPrice = vaultV1.getMaxPrice(wnt);
        address gmxCurrentChain = dataStore.getAddress(Keys.feeDistributorAddressInfoKey(block.chainid, gmxKey));

        address feeKeeperCurrentChain = dataStore.getAddress(
            Keys.feeDistributorAddressInfoKey(block.chainid, feeKeeperKey)
        );

        feeHandler.withdrawFees(wnt);
        feeHandler.withdrawFees(gmxCurrentChain);

        // fee amount calculations for all chains
        uint256 totalWntBalance = IERC20(wnt).balanceOf(feeKeeperCurrentChain);

        uint256 feesV1Usd = dataStore.getUint(Keys.feeDistributorFeeAmountUsdKey(v1));
        uint256 feesV2Usd = dataStore.getUint(Keys.feeDistributorFeeAmountUsdKey(v2));
        uint256 totalFeesUsd = feesV1Usd + feesV2Usd;

        uint256 keeperCosts;
        uint256 keeperCount = dataStore.getAddressCount(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        uint256 keeperTargetBalanceCount = dataStore.getUintCount(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        if (keeperCount != keeperTargetBalanceCount) {
            revert Errors.KeeperArrayLengthMismatch(keeperCount, keeperTargetBalanceCount);
        }

        address[] memory keepers = new address[](keeperCount);
        uint256[] memory keeperTargetBalances = new uint256[](keeperTargetBalanceCount);
        for (uint256 i; i < keeperCount; i++) {
            uint256 balance = keepers[i].balance;
            uint256 targetBalance = keeperTargetBalances[i];
            if (balance < targetBalance) {
                keeperCosts = keeperCosts + (targetBalance - balance);
            }
        }

        uint256 treasuryChainlinkWntAmount = Precision.mulDiv(totalWntBalance, feesV2Usd, totalFeesUsd);
        uint256 treasuryWntAmount = Precision.mulDiv(treasuryChainlinkWntAmount, uint256(88), uint256(100));
        uint256 chainlinkWntAmount = Precision.mulDiv(treasuryChainlinkWntAmount, uint256(12), uint256(100));

        uint256 referralRewardsWntUsd = dataStore.getUint(Keys.feeDistributorReferralRewardsAmountKey(wnt));
        uint256 referralRewardsWnt = Precision.mulDiv(referralRewardsWntUsd, Precision.FLOAT_PRECISION, wntPrice);
        uint256 referralRewardsWntThreshold = dataStore.getUint(
            Keys.feeDistributorAmountThresholdKey(referralRewardsWntKey)
        );
        uint256 maxReferralRewardsWntUSD = Precision.applyFactor(feesV1Usd, referralRewardsWntThreshold);
        if (referralRewardsWntUsd > maxReferralRewardsWntUSD) {
            revert Errors.ReferralRewardsWntThresholdBreached(
                referralRewardsWnt,
                referralRewardsWntUsd - maxReferralRewardsWntUSD
            );
        }

        uint256 remainingWnt = totalWntBalance -
            keeperCosts -
            chainlinkWntAmount -
            treasuryWntAmount -
            referralRewardsWnt;

        uint256 expectedGlpWntAmount = totalWntBalance - treasuryChainlinkWntAmount;
        uint256 glpFeeThreshold = dataStore.getUint(Keys.feeDistributorAmountThresholdKey(glpKey));
        uint256 minGlpWntAmount = Precision.applyFactor(expectedGlpWntAmount, glpFeeThreshold);
        if (remainingWnt < minGlpWntAmount) {
            uint256 treasuryFeeThreshold = dataStore.getUint(Keys.feeDistributorAmountThresholdKey(treasuryKey));
            uint256 minTreasuryWntAmount = Precision.applyFactor(treasuryWntAmount, treasuryFeeThreshold);
            uint256 wntGlpShortfall = minGlpWntAmount - remainingWnt;
            uint256 maxTreasuryWntShortfall = treasuryWntAmount - minTreasuryWntAmount;
            if (wntGlpShortfall > maxTreasuryWntShortfall) {
                revert Errors.TreasuryFeeThresholdBreached(
                    treasuryWntAmount,
                    wntGlpShortfall - maxTreasuryWntShortfall
                );
            }

            treasuryWntAmount = treasuryWntAmount - wntGlpShortfall;
            remainingWnt = remainingWnt + wntGlpShortfall;
        }

        // Calculation of amount of GMX that need to be bridged to ensure all chains have sufficient fees
        // Need to add potential require checks on bridging calculation math
        uint256 feeAmountCurrentChainOrig = dataStore.getUint(Keys.feeDistributorFeeAmountKey(block.chainid));
        uint256 feeAmountCurrentChain = feeAmountCurrentChainOrig;
        bool feeDistributorFeeDeficit = dataStore.getBool(Keys.FEE_DISTRIBUTOR_HAS_FEE_DEFICIT);
        if (feeDistributorFeeDeficit) {
            address gmx = dataStore.getAddress(Keys.feeDistributorAddressInfoKey(block.chainid, gmxKey));
            feeAmountCurrentChain = IERC20(gmx).balanceOf(feeKeeperCurrentChain);
            dataStore.setUint(Keys.feeDistributorFeeAmountKey(block.chainid), feeAmountCurrentChain);
        }

        uint256 chainCount = dataStore.getUintCount(Keys.FEE_DISTRIBUTOR_CHAIN_ID);
        uint256[] memory chainIds = dataStore.getUintValuesAt(Keys.FEE_DISTRIBUTOR_CHAIN_ID, 0, chainCount);
        uint256[] memory feeAmount = new uint256[](chainCount);
        uint256 totalFeeAmount;
        uint256[] memory stakedGmx = new uint256[](chainCount);
        uint256 totalStakedGmx;
        uint256 currentChain;
        for (uint256 i; i < chainCount; i++) {
            uint256 chainId = chainIds[i];
            if (chainId == block.chainid) {
                currentChain = i;
                feeAmount[i] = feeAmountCurrentChain;
                totalFeeAmount = totalFeeAmount + feeAmountCurrentChain;
                stakedGmx[i] = dataStore.getUint(Keys.feeDistributorStakedGmxKey(chainId));
                totalStakedGmx = totalStakedGmx + stakedGmx[i];
            } else {
                feeAmount[i] = dataStore.getUint(Keys.feeDistributorFeeAmountKey(chainId));
                totalFeeAmount = totalFeeAmount + feeAmount[i];
                stakedGmx[i] = dataStore.getUint(Keys.feeDistributorStakedGmxKey(chainId));
                totalStakedGmx = totalStakedGmx + stakedGmx[i];
            }
        }

        // Uses the minimum bridged fees received due to slippage if bridged fees are required plus an additional
        // buffer to determine the minimum acceptable fee amount in case it is slightly below the target amount
        uint256 requiredFeeAmount = (totalFeeAmount * stakedGmx[currentChain]) / totalStakedGmx;
        uint256 feeDeficit = requiredFeeAmount - feeAmountCurrentChainOrig;
        uint256 slippageFactor = Precision.FLOAT_PRECISION -
            dataStore.getUint(Keys.feeDistributorMaxBridgeSlippageKey(currentChain));
        uint256 minFeeReceived = feeDeficit == 0
            ? 0
            : Precision.applyFactor(feeDeficit, slippageFactor) - dataStore.getUint(Keys.FEE_DISTRIBUTOR_FEE_BUFFER);
        uint256 minRequiredFeeAmount = feeAmountCurrentChainOrig + minFeeReceived;

        if (minRequiredFeeAmount > feeAmountCurrentChain) {
            if (feeDistributorFeeDeficit) {
                revert Errors.BridgedAmountNotSufficient(requiredFeeAmount, feeAmountCurrentChain);
            }
            dataStore.setBool(Keys.FEE_DISTRIBUTOR_HAS_FEE_DEFICIT, true);
            return;
        }

        if (!feeDistributorFeeDeficit) {
            uint256[] memory target = new uint256[](chainCount);
            for (uint256 i; i < chainCount; i++) {
                if (totalStakedGmx == 0) {
                    target[i] = 0;
                } else {
                    target[i] = (totalFeeAmount * stakedGmx[i]) / totalStakedGmx;
                }
            }

            int256[] memory difference = new int256[](chainCount);
            for (uint256 i; i < chainCount; i++) {
                difference[i] = int256(feeAmount[i]) - int256(target[i]);
            }

            uint256[][] memory bridging = new uint256[][](chainCount);
            for (uint256 i; i < chainCount; i++) {
                bridging[i] = new uint256[](chainCount);
            }

            uint256 deficit;
            for (uint256 surplus; surplus < chainCount; surplus++) {
                if (difference[surplus] <= 0) continue;

                while (deficit < chainCount && difference[deficit] >= 0) {
                    deficit++;
                }
                if (deficit == chainCount) break;

                while (difference[surplus] > 0 && deficit < chainCount) {
                    int256 needed = -difference[deficit];
                    if (needed > difference[surplus]) {
                        bridging[surplus][deficit] += uint256(difference[surplus]);
                        difference[deficit] += difference[surplus];
                        difference[surplus] = 0;
                    } else {
                        bridging[surplus][deficit] += uint256(needed);
                        difference[surplus] -= needed;
                        difference[deficit] = 0;
                        deficit++;
                        while (deficit < chainCount && difference[deficit] >= 0) {
                            deficit++;
                        }
                    }
                }
            }

            uint256 amountToBridgeOut;
            for (uint256 i; i < chainCount; i++) {
                uint256 sendAmount = bridging[currentChain][i];
                // perhaps should be an amount greater than 0 to account for fees
                if (sendAmount > 0) {
                    uint256 chainId = chainIds[i];
                    address synapseRouter = dataStore.getAddress(
                        Keys.feeDistributorAddressInfoKey(block.chainid, synapseRouterKey)
                    );
                    address gmxDestChain = dataStore.getAddress(Keys.feeDistributorAddressInfoKey(chainId, gmxKey));
                    address feeKeeper = dataStore.getAddress(Keys.feeDistributorAddressInfoKey(chainId, feeKeeperKey));

                    address nullAddress;
                    uint256 minAmountOut = Precision.applyFactor(sendAmount, slippageFactor);
                    // using the deadline logic that the synapse front-end seems to use
                    uint256 originDeadline = block.timestamp + 600;
                    uint256 destDeadline = block.timestamp + 604800;
                    bytes memory rawParams = "";

                    // It appears on the synapse front-end a small slippage amount is used for the sending chain, here no slippage is assumed
                    bytes memory callData = abi.encodeWithSignature(
                        "bridge(address,uint256,address,uint256,(address,address,uint256,uint256,bytes),(address,address,uint256,uint256,bytes))",
                        feeKeeper,
                        chainId,
                        gmxCurrentChain,
                        sendAmount,
                        nullAddress,
                        gmxCurrentChain,
                        sendAmount,
                        originDeadline,
                        rawParams,
                        nullAddress,
                        gmxDestChain,
                        minAmountOut,
                        destDeadline,
                        rawParams
                    );
                    (bool success, bytes memory result) = synapseRouter.call(callData);
                    if (!success) {
                        revert Errors.BridgingTransactionFailed(result);
                    }
                }
                amountToBridgeOut += sendAmount;
            }
        }

        // fee distribution
        IWNT(wnt).withdraw(keeperCosts);

        for (uint256 i; i < keeperCount; i++) {
            address keeper = keepers[i];
            uint256 balance = keeper.balance;
            uint256 targetBalance = keeperTargetBalances[i];
            if (balance < targetBalance) {
                uint256 sendAmount = targetBalance - balance;
                (bool success, bytes memory result) = keeper.call{value: sendAmount}("");
                if (!success) {
                    revert Errors.SendEthToKeeperFailed(keeper, sendAmount, result);
                }
            }
        }

        address extendedGmxTracker = dataStore.getAddress(
            Keys.feeDistributorAddressInfoKey(block.chainid, extendedGmxTrackerKey)
        );
        IERC20(gmxCurrentChain).transfer(extendedGmxTracker, feeAmountCurrentChain);

        address gmxRewardDistributor = IRewardTracker(extendedGmxTracker).distributor();
        IRewardDistributor(gmxRewardDistributor).updateLastDistributionTime();
        IRewardDistributor(gmxRewardDistributor).setTokensPerInterval(feeAmountCurrentChain / 604800);

        IERC20(wnt).transfer(
            dataStore.getAddress(Keys.feeDistributorAddressInfoKey(block.chainid, treasuryKey)),
            treasuryWntAmount
        );

        IERC20(wnt).transfer(
            dataStore.getAddress(Keys.feeDistributorAddressInfoKey(block.chainid, chainlinkKey)),
            chainlinkWntAmount
        );

        address feeGlpTracker = dataStore.getAddress(
            Keys.feeDistributorAddressInfoKey(block.chainid, feeGlpTrackerKey)
        );
        IERC20(gmxCurrentChain).transfer(feeGlpTracker, remainingWnt);
        address glpRewardDistributor = IRewardTracker(feeGlpTracker).distributor();
        IRewardDistributor(glpRewardDistributor).updateLastDistributionTime();
        IRewardDistributor(glpRewardDistributor).setTokensPerInterval(remainingWnt / 604800);

        // after distribution completed
        if (dataStore.getBool(Keys.FEE_DISTRIBUTOR_HAS_FEE_DEFICIT)) {
            dataStore.setBool(Keys.FEE_DISTRIBUTOR_HAS_FEE_DEFICIT, false);
        }
        dataStore.setUint(Keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, block.timestamp);
        dataStore.setBool(Keys.FEE_DISTRIBUTOR_DISTRIBUTION_INITIATED, false);

        EventUtils.EventLogData memory eventData;
        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "distributeReferralRewards", true);

        eventEmitter.emitEventLog("TriggerReferralKeeper", eventData);
    }

    function _validateDistributionNotCompleted() internal view {
        uint256 dayOfWeek = ((block.timestamp / 86400) + 4) % 7;
        uint256 daysSinceStartOfWeek = (dayOfWeek + 7 - dataStore.getUint(Keys.FEE_DISTRIBUTOR_DISTRIBUTION_DAY)) % 7;
        uint256 midnightToday = (block.timestamp - (block.timestamp % 86400));
        uint256 startOfWeek = midnightToday - (daysSinceStartOfWeek * 86400);
        uint256 lastDistributionTime = dataStore.getUint(Keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP);
        if (lastDistributionTime > startOfWeek) {
            revert Errors.DistributionThisWeekAlreadyCompleted(lastDistributionTime, startOfWeek);
        }
    }

    function _validateReadResponseTimestamp(uint256 readResponseTimestamp) internal view {
        if (block.timestamp - readResponseTimestamp > dataStore.getUint(Keys.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY)) {
            revert Errors.OutdatedReadResponse(readResponseTimestamp);
        }
    }
}
