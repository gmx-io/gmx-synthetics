// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./FeeDistributorVault.sol";
import "./FeeHandler.sol";
import "../external/MultichainReader.sol";
import "../v1/IRewardTracker.sol";
import "../v1/IRewardDistributor.sol";
import "../v1/IMintable.sol";

contract FeeDistributor is ReentrancyGuard, RoleModule {
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.BytesItems;

    enum DistributionState {
        None,
        Initiated,
        ReadDataReceived,
        DistributePending
    }

    uint256 public constant v1 = 1;
    uint256 public constant v2 = 2;

    bytes32 public constant gmxKey = keccak256(abi.encode("GMX"));
    bytes32 public constant extendedGmxTrackerKey = keccak256(abi.encode("EXTENDED_GMX_TRACKER"));
    bytes32 public constant dataStoreKey = keccak256(abi.encode("DATASTORE"));
    bytes32 public constant referralRewardsWntKey = keccak256(abi.encode("REFERRAL_REWARDS_WNT"));
    bytes32 public constant referralRewardsEsGmxKey = keccak256(abi.encode("REFERRAL_REWARDS_ESGMX"));
    bytes32 public constant glpKey = keccak256(abi.encode("GLP"));
    bytes32 public constant treasuryKey = keccak256(abi.encode("TREASURY"));
    bytes32 public constant synapseRouterKey = keccak256(abi.encode("SYNAPSE_ROUTER"));
    bytes32 public constant feeGlpTrackerKey = keccak256(abi.encode("FEE_GLP_TRACKER"));
    bytes32 public constant chainlinkKey = keccak256(abi.encode("CHAINLINK"));
    bytes32 public constant feeDistributionKeeperKey = keccak256(abi.encode("FEE_DISTRIBUTION_KEEPER"));
    bytes32 public constant esGmxKey = keccak256(abi.encode("ESGMX"));

    FeeDistributorVault public immutable feeDistributorVault;
    FeeHandler public immutable feeHandler;
    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    MultichainReader public immutable multichainReader;
    IVaultV1 public immutable vaultV1;

    constructor(
        RoleStore _roleStore,
        FeeDistributorVault _feeDistributorVault,
        FeeHandler _feeHandler,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        MultichainReader _multichainReader,
        IVaultV1 _vaultV1
    ) RoleModule(_roleStore) {
        feeDistributorVault = _feeDistributorVault;
        feeHandler = _feeHandler;
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        multichainReader = _multichainReader;
        vaultV1 = _vaultV1;
    }

    function initiateDistribute() external nonReentrant onlyFeeDistributionKeeper {
        validateDistributionState(DistributionState.None);
        validateDistributionNotCompleted();

        setUint(Keys.feeDistributorReferralRewardsSentKey(getAddress(Keys.WNT)), 0);
        setUint(Keys.feeDistributorReferralRewardsSentKey(getAddress(block.chainid, esGmxKey)), 0);

        uint256 chainCount = dataStore.getUintCount(Keys.FEE_DISTRIBUTOR_CHAIN_ID);
        MultichainReaderUtils.ReadRequestInputs[]
            memory readRequestsInputs = new MultichainReaderUtils.ReadRequestInputs[]((chainCount - 1) * 3);
        bool skippedCurrentChain;
        uint256[] memory chainIds = dataStore.getUintArray(Keys.FEE_DISTRIBUTOR_CHAIN_ID);
        for (uint256 i; i < chainCount; i++) {
            uint256 chainId = chainIds[i];
            address gmx = getAddress(chainId, gmxKey);
            address extendedGmxTracker = getAddress(chainId, extendedGmxTrackerKey);

            if (chainId == block.chainid) {
                uint256 feeAmountGmx = getUint(Keys.withdrawableBuybackTokenAmountKey(gmx)) +
                    IERC20(gmx).balanceOf(address(feeDistributorVault));
                uint256 stakedGmx = IERC20(extendedGmxTracker).totalSupply();
                setUint(Keys.feeDistributorFeeAmountGmxKey(chainId), feeAmountGmx);
                setUint(Keys.feeDistributorStakedGmxKey(chainId), stakedGmx);
                skippedCurrentChain = true;
                continue;
            }

            uint32 layerZeroChainId = uint32(getUint(Keys.feeDistributorLayerZeroChainIdKey(chainId)));
            uint256 readRequestIndex = skippedCurrentChain ? (i - 1) * 3 : i * 3;
            readRequestsInputs[readRequestIndex].chainId = layerZeroChainId;
            readRequestsInputs[readRequestIndex].target = getAddress(chainId, dataStoreKey);
            readRequestsInputs[readRequestIndex].callData = abi.encodeWithSelector(
                DataStore.getUint.selector,
                Keys.withdrawableBuybackTokenAmountKey(gmx)
            );
            readRequestIndex++;

            readRequestsInputs[readRequestIndex].chainId = layerZeroChainId;
            readRequestsInputs[readRequestIndex].target = gmx;
            readRequestsInputs[readRequestIndex].callData = abi.encodeWithSelector(
                IERC20.balanceOf.selector,
                getAddress(chainId, Keys.FEE_RECEIVER)
            );
            readRequestIndex++;

            readRequestsInputs[readRequestIndex].chainId = layerZeroChainId;
            readRequestsInputs[readRequestIndex].target = extendedGmxTracker;
            readRequestsInputs[readRequestIndex].callData = abi.encodeWithSelector(IERC20.totalSupply.selector);
        }

        MultichainReaderUtils.ExtraOptionsInputs memory extraOptionsInputs;
        extraOptionsInputs.gasLimit = uint128(getUint(Keys.FEE_DISTRIBUTOR_GAS_LIMIT));
        extraOptionsInputs.returnDataSize = ((uint32(chainCount) - 1) * 96) + 8;

        MessagingFee memory messagingFee = multichainReader.quoteReadFee(readRequestsInputs, extraOptionsInputs);
        multichainReader.sendReadRequests{value: messagingFee.nativeFee}(readRequestsInputs, extraOptionsInputs);

        setUint(Keys.FEE_DISTRIBUTION_STATE, uint256(DistributionState.Initiated));
    }

    function processLzReceive(
        bytes32 /*guid*/,
        MultichainReaderUtils.ReceivedData calldata receivedData
    ) external nonReentrant onlyMultichainReader {
        validateDistributionState(DistributionState.Initiated);
        validateReadResponseTimestamp(receivedData.timestamp);

        setUint(Keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP, receivedData.timestamp);

        uint256[] memory chainIds = dataStore.getUintArray(Keys.FEE_DISTRIBUTOR_CHAIN_ID);
        for (uint256 i; i < chainIds.length; i++) {
            uint256 chainId = chainIds[i];
            bool skippedCurrentChain;
            if (chainId == block.chainid) {
                skippedCurrentChain = true;
                continue;
            }

            uint256 offset = skippedCurrentChain ? (i - 1) * 96 : i * 96;
            (uint256 feeAmountGmx1, uint256 feeAmountGmx2, uint256 stakedGmx) = abi.decode(
                receivedData.readData[offset:offset + 96],
                (uint256, uint256, uint256)
            );
            setUint(Keys.feeDistributorFeeAmountGmxKey(chainId), feeAmountGmx1 + feeAmountGmx2);
            setUint(Keys.feeDistributorStakedGmxKey(chainId), stakedGmx);
        }

        uint256 wntPriceInUsd = vaultV1.getMaxPrice(getAddress(Keys.WNT));
        setUint(Keys.FEE_DISTRIBUTION_WNT_PRICE_IN_USD, wntPriceInUsd);
        setUint(Keys.FEE_DISTRIBUTION_STATE, uint256(DistributionState.ReadDataReceived));

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "NumberOfChainsReceivedData", chainIds.length - 1);
        eventData.uintItems.setItem(1, "ReceivedDataTimestamp", receivedData.timestamp);
        eventData.uintItems.setItem(2, "wntPriceInUsd", wntPriceInUsd);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "ReceivedDataReadData", receivedData.readData);

        eventEmitter.emitEventLog("FeeDistributionReceivedData", eventData);
    }

    function distribute(
        uint256 wntReferralRewardsInUsd,
        uint256 esGmxForReferralRewards,
        uint256 feesV1Usd,
        uint256 feesV2Usd
    ) external nonReentrant onlyFeeDistributionKeeper {
        DistributionState[] memory allowedDistributionStates = new DistributionState[](2);
        allowedDistributionStates[0] = DistributionState.ReadDataReceived;
        allowedDistributionStates[1] = DistributionState.DistributePending;
        validateDistributionStates(allowedDistributionStates);
        validateReadResponseTimestamp(getUint(Keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP));
        validateDistributionNotCompleted();

        address wnt = getAddress(Keys.WNT);
        address gmx = getAddress(block.chainid, gmxKey);

        feeHandler.withdrawFees(wnt);
        feeHandler.withdrawFees(gmx);

        // fee amount related calculations
        uint256 totalWntBalance = IERC20(wnt).balanceOf(address(feeDistributorVault));
        uint256 totalFeesUsd = feesV1Usd + feesV2Usd;

        address[] memory keepers = dataStore.getAddressArray(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        uint256[] memory keepersTargetBalance = dataStore.getUintArray(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        bool[] memory keepersV2 = dataStore.getBoolArray(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        if (keepers.length != keepersTargetBalance.length || keepers.length != keepersV2.length) {
            revert Errors.KeeperArrayLengthMismatch(keepers.length, keepersTargetBalance.length, keepersV2.length);
        }

        uint256 keeperCostsTreasury;
        uint256 keeperCostsGlp;
        uint256 keeperGlpFactor = getUint(Keys.FEE_DISTRIBUTOR_KEEPER_GLP_FACTOR);
        for (uint256 i; i < keepers.length; i++) {
            uint256 keeperCost = keepersTargetBalance[i] - keepers[i].balance;
            if (keeperCost > 0) {
                if (keepersV2[i]) {
                    keeperCostsTreasury = keeperCostsTreasury + keeperCost;
                } else {
                    uint256 keeperCostGlp = Precision.applyFactor(keeperCost, keeperGlpFactor);
                    keeperCostsGlp = keeperCostsGlp + keeperCostGlp;
                    keeperCostsTreasury = keeperCostsTreasury + keeperCost - keeperCostGlp;
                }
            }
        }

        uint256 chainlinkTreasuryWntAmount = Precision.mulDiv(totalWntBalance, feesV2Usd, totalFeesUsd);
        uint256 wntForChainlink = Precision.applyFactor(
            chainlinkTreasuryWntAmount,
            getUint(Keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR)
        );
        uint256 wntForTreasury = chainlinkTreasuryWntAmount - wntForChainlink - keeperCostsTreasury;

        uint256 wntReferralRewardsInUsdLimit = getUint(Keys.FEE_DISTRIBUTOR_REFERRAL_REWARDS_WNT_USD_LIMIT); 
        if (wntReferralRewardsInUsd > wntReferralRewardsInUsdLimit) {
            revert Errors.WntReferralRewardsInUsdLimitExceeded(wntReferralRewardsInUsd, wntReferralRewardsInUsdLimit);
        }

        uint256 wntForReferralRewardsThreshold = getUint(Keys.feeDistributorAmountThresholdKey(referralRewardsWntKey));
        uint256 maxWntReferralRewardsInUsd = Precision.applyFactor(feesV1Usd, wntForReferralRewardsThreshold);
        if (wntReferralRewardsInUsd > maxWntReferralRewardsInUsd) {
            revert Errors.WntReferralRewardsInUsdThresholdBreached(wntReferralRewardsInUsd, maxWntReferralRewardsInUsd);
        }

        uint256 wntForReferralRewards = Precision.toFactor(
            wntReferralRewardsInUsd,
            getUint(Keys.FEE_DISTRIBUTION_WNT_PRICE_IN_USD)
        );
        uint256 maxWntReferralRewards = Precision.applyFactor(totalWntBalance, wntForReferralRewardsThreshold);
        if (wntForReferralRewards > maxWntReferralRewards) {
            revert Errors.WntReferralRewardsThresholdBreached(wntForReferralRewards, maxWntReferralRewards);
        }

        uint256 wntForGlp = totalWntBalance - keeperCostsGlp - wntForChainlink - wntForTreasury - wntForReferralRewards;
        uint256 expectedWntForGlp = totalWntBalance - chainlinkTreasuryWntAmount;
        uint256 glpFeeThreshold = getUint(Keys.feeDistributorAmountThresholdKey(glpKey));
        uint256 minWntForGlp = Precision.applyFactor(expectedWntForGlp, glpFeeThreshold);
        if (wntForGlp < minWntForGlp) {
            uint256 treasuryFeeThreshold = getUint(Keys.feeDistributorAmountThresholdKey(treasuryKey));
            uint256 minTreasuryWntAmount = Precision.applyFactor(wntForTreasury, treasuryFeeThreshold);
            uint256 wntGlpShortfall = minWntForGlp - wntForGlp;
            uint256 maxTreasuryWntShortfall = wntForTreasury - minTreasuryWntAmount;
            if (wntGlpShortfall > maxTreasuryWntShortfall) {
                revert Errors.TreasuryFeeThresholdBreached(wntForTreasury, wntGlpShortfall, maxTreasuryWntShortfall);
            }

            wntForTreasury = wntForTreasury - wntGlpShortfall;
            wntForGlp = wntForGlp + wntGlpShortfall;
        }

        // calculation of the amount of GMX that needs to be bridged to ensure all chains have sufficient fees
        uint256 feeAmountGmxCurrentChainOrig = getUint(Keys.feeDistributorFeeAmountGmxKey(block.chainid));
        uint256 feeAmountGmxCurrentChain = feeAmountGmxCurrentChainOrig;
        DistributionState distributionState = DistributionState(getUint(Keys.FEE_DISTRIBUTION_STATE));
        if (distributionState == DistributionState.DistributePending) {
            feeAmountGmxCurrentChain = IERC20(gmx).balanceOf(address(feeDistributorVault));
            setUint(Keys.feeDistributorFeeAmountGmxKey(block.chainid), feeAmountGmxCurrentChain);
        }

        uint256[] memory chainIds = dataStore.getUintArray(Keys.FEE_DISTRIBUTOR_CHAIN_ID);
        uint256 chainCount = chainIds.length;

        uint256[] memory feeAmountGmx = new uint256[](chainCount);
        uint256 totalFeeAmountGmx;

        uint256[] memory stakedGmx = new uint256[](chainCount);
        uint256 totalStakedGmx;

        uint256 currentChain;
        for (uint256 i; i < chainCount; i++) {
            uint256 chainId = chainIds[i];
            if (chainId == block.chainid) {
                currentChain = i;
                feeAmountGmx[i] = feeAmountGmxCurrentChain;
                totalFeeAmountGmx = totalFeeAmountGmx + feeAmountGmxCurrentChain;
                stakedGmx[i] = getUint(Keys.feeDistributorStakedGmxKey(chainId));
                totalStakedGmx = totalStakedGmx + stakedGmx[i];
            } else {
                feeAmountGmx[i] = getUint(Keys.feeDistributorFeeAmountGmxKey(chainId));
                totalFeeAmountGmx = totalFeeAmountGmx + feeAmountGmx[i];
                stakedGmx[i] = getUint(Keys.feeDistributorStakedGmxKey(chainId));
                totalStakedGmx = totalStakedGmx + stakedGmx[i];
            }
        }

        // uses the minimum bridged fees received due to slippage if bridged fees are required plus an additional
        // buffer to determine the minimum acceptable fee amount that's allowed in case of any further deviations
        uint256 requiredFeeAmount = (totalFeeAmountGmx * stakedGmx[currentChain]) / totalStakedGmx;
        uint256 pendingFeeBridgeAmount = requiredFeeAmount - feeAmountGmxCurrentChainOrig;
        uint256 slippageFactor = getUint(Keys.feeDistributorBridgeSlippageFactorKey(currentChain));
        uint256 minFeeReceived = pendingFeeBridgeAmount == 0
            ? 0
            : Precision.applyFactor(pendingFeeBridgeAmount, slippageFactor) -
                getUint(Keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_AMOUNT);
        uint256 minRequiredFeeAmount = feeAmountGmxCurrentChainOrig + minFeeReceived;

        if (minRequiredFeeAmount > feeAmountGmxCurrentChain) {
            if (distributionState == DistributionState.DistributePending) {
                revert Errors.BridgedAmountNotSufficient(minRequiredFeeAmount, feeAmountGmxCurrentChain);
            }
            setUint(Keys.FEE_DISTRIBUTION_STATE, uint256(DistributionState.DistributePending));
            return;
        }

        uint256 totalGmxBridgedOut;
        if (distributionState == DistributionState.ReadDataReceived) {
            uint256[] memory target = new uint256[](chainCount);
            for (uint256 i; i < chainCount; i++) {
                target[i] = (totalFeeAmountGmx * stakedGmx[i]) / totalStakedGmx;
            }

            int256[] memory difference = new int256[](chainCount);
            for (uint256 i; i < chainCount; i++) {
                difference[i] = int256(feeAmountGmx[i]) - int256(target[i]);
            }

            uint256[][] memory bridging = new uint256[][](chainCount);
            for (uint256 i; i < chainCount; i++) {
                bridging[i] = new uint256[](chainCount);
            }

            // the outer loop iterates through each chain to see if it has surplus
            uint256 deficitIndex;
            for (uint256 surplusIndex; surplusIndex < chainCount; surplusIndex++) {
                if (difference[surplusIndex] <= 0) continue;

                // move deficitIndex forward until a chain is found that has a deficit
                // (difference[deficitIndex] < 0)
                while (deficitIndex < chainCount && difference[deficitIndex] >= 0) {
                    deficitIndex++;
                }

                // if the deficitIndex iteration is complete, there are no more deficits to fill; break out
                if (deficitIndex == chainCount) break;

                // now fill the deficit on chain `deficitIndex` using the surplus on chain `surplusIndex`
                while (difference[surplusIndex] > 0 && deficitIndex < chainCount) {
                    // the needed amount is the absolute value of the deficit
                    // e.g. if difference[deficitIndex] == -100, needed == 100
                    int256 needed = -difference[deficitIndex];

                    if (needed > difference[surplusIndex]) {
                        // if needed > difference[surplusIndex], then the deficit is larger than the
                        // surplus so all GMX that the surplus chain has is sent to the deficit chain
                        bridging[surplusIndex][deficitIndex] += uint256(difference[surplusIndex]);

                        // reduce the deficit by the surplus that was just sent
                        difference[deficitIndex] += difference[surplusIndex];

                        // the surplus chain is now fully used up
                        difference[surplusIndex] = 0;
                    } else {
                        // otherwise the needed amount of GMX for the deficit chain can be fully covered
                        bridging[surplusIndex][deficitIndex] += uint256(needed);

                        // reduce the surplus by exactly the needed amount
                        difference[surplusIndex] -= needed;

                        // the deficit chain is now at zero difference (fully covered)
                        difference[deficitIndex] = 0;

                        // move on to the next deficit chain
                        deficitIndex++;

                        // skip any chain that doesn't have a deficit
                        while (deficitIndex < chainCount && difference[deficitIndex] >= 0) {
                            deficitIndex++;
                        }
                    }
                }
            }

            address synapseRouter = getAddress(block.chainid, synapseRouterKey);
            address nullAddress;
            uint256 originDeadline = block.timestamp +
                getUint(Keys.feeDistributorBridgeOriginDeadlineKey(block.chainid));
            bytes memory rawParams = "";
            for (uint256 i; i < chainCount; i++) {
                uint256 sendAmount = bridging[currentChain][i];
                if (sendAmount > 0) {
                    feeDistributorVault.transferOut(gmx, address(this), sendAmount);
                    IERC20(gmx).approve(synapseRouter, sendAmount);

                    uint256 chainId = chainIds[i];
                    address gmxDestChain = getAddress(chainId, gmxKey);
                    address feeReceiver = getAddress(chainId, Keys.FEE_RECEIVER);
                    uint256 minAmountOut = Precision.applyFactor(sendAmount, slippageFactor);
                    uint256 destDeadline = block.timestamp + getUint(Keys.feeDistributorBridgeDestDeadlineKey(chainId));

                    bytes memory callData = abi.encodeWithSignature(
                        "bridge(address,uint256,address,uint256,(address,address,uint256,uint256,bytes),(address,address,uint256,uint256,bytes))",
                        feeReceiver,
                        chainId,
                        gmx,
                        sendAmount,
                        nullAddress,
                        gmx,
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

                    totalGmxBridgedOut += sendAmount;
                }
            }
            if (minRequiredFeeAmount > feeAmountGmxCurrentChain - totalGmxBridgedOut) {
                revert Errors.AttemptedBridgeAmountTooHigh(
                    minRequiredFeeAmount,
                    feeAmountGmxCurrentChain,
                    totalGmxBridgedOut
                );
            }
        }

        uint256 wntForKeepers;
        for (uint256 i; i < keepers.length; i++) {
            address keeper = keepers[i];
            if (keeper.balance < keepersTargetBalance[i]) {
                uint256 sendAmount = keepersTargetBalance[i] - keeper.balance;
                feeDistributorVault.transferOutNativeToken(keeper, sendAmount);
                wntForKeepers = wntForKeepers + sendAmount;
            }
        }

        feeDistributorVault.transferOut(wnt, getAddress(block.chainid, chainlinkKey), wntForChainlink);
        feeDistributorVault.transferOut(wnt, getAddress(block.chainid, treasuryKey), wntForTreasury);

        updateRewardDistribution(wnt, getAddress(block.chainid, feeGlpTrackerKey), wntForGlp);
        updateRewardDistribution(gmx, getAddress(block.chainid, extendedGmxTrackerKey), feeAmountGmxCurrentChain);

        setUint(Keys.feeDistributorFeeAmountUsdKey(v1), feesV1Usd);
        setUint(Keys.feeDistributorFeeAmountUsdKey(v2), feesV2Usd);
        setUint(Keys.feeDistributorReferralRewardsAmountKey(wnt), wntForReferralRewards);
        setUint(
            Keys.feeDistributorReferralRewardsAmountKey(getAddress(block.chainid, esGmxKey)),
            esGmxForReferralRewards
        );
        setUint(Keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, block.timestamp);
        setUint(Keys.FEE_DISTRIBUTION_STATE, uint256(DistributionState.None));

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(10);
        eventData.uintItems.setItem(0, "feesV1Usd", feesV1Usd);
        eventData.uintItems.setItem(1, "feesV2Usd", feesV2Usd);
        eventData.uintItems.setItem(2, "feeAmountGmxCurrentChain", feeAmountGmxCurrentChain);
        eventData.uintItems.setItem(3, "totalFeeAmountGmx", totalFeeAmountGmx);
        eventData.uintItems.setItem(4, "totalGmxBridgedOut", totalGmxBridgedOut);
        eventData.uintItems.setItem(5, "wntForKeepers", wntForKeepers);
        eventData.uintItems.setItem(6, "wntForChainlink", wntForChainlink);
        eventData.uintItems.setItem(7, "wntForTreasury", wntForTreasury);
        eventData.uintItems.setItem(8, "wntForReferralRewards", wntForReferralRewards);
        eventData.uintItems.setItem(9, "wntForGlp", wntForGlp);

        eventEmitter.emitEventLog("FeeDistributionCompleted", eventData);
    }

    function sendWnt(
        address[] calldata accounts,
        uint256[] calldata amounts,
        uint256 maxBatchSize
    ) external nonReentrant onlyFeeDistributionKeeper {
        validateDistributionState(DistributionState.None);

        address wnt = getAddress(Keys.WNT);
        if (accounts.length != amounts.length) {
            revert Errors.ReferralRewardsArrayMismatch(wnt, accounts.length, amounts.length);
        }

        if (accounts.length > maxBatchSize) {
            revert Errors.ReferralRewardsAmountExceedsMaxBatchSize(wnt, accounts.length, maxBatchSize);
        }

        uint256 totalWntSent = getUint(Keys.feeDistributorReferralRewardsSentKey(wnt));
        for (uint256 i; i < accounts.length; i++) {
            address account = accounts[i];
            uint256 wntAmount = amounts[i];
            feeDistributorVault.transferOut(wnt, account, wntAmount);
            totalWntSent = totalWntSent + wntAmount;

            EventUtils.EventLogData memory eventData;
            eventData.uintItems.initItems(1);
            eventData.uintItems.setItem(0, "wntAmount", wntAmount);

            eventEmitter.emitEventLog("wntReferralRewardsSent", eventData);
        }

        uint256 wntForReferralRewards = getUint(Keys.feeDistributorReferralRewardsAmountKey(wnt));
        if (totalWntSent > wntForReferralRewards) {
            revert Errors.WntReferralRewardsThresholdBreached(totalWntSent, wntForReferralRewards);
        }

        setUint(Keys.feeDistributorReferralRewardsSentKey(wnt), totalWntSent);
    }

    function sendEsGmx(
        address[] calldata accounts,
        uint256[] calldata amounts,
        uint256 maxBatchSize
    ) external nonReentrant onlyFeeDistributionKeeper {
        validateDistributionState(DistributionState.None);

        address esGmx = getAddress(block.chainid, esGmxKey);
        if (accounts.length != amounts.length) {
            revert Errors.ReferralRewardsArrayMismatch(esGmx, accounts.length, amounts.length);
        }

        if (accounts.length > maxBatchSize) {
            revert Errors.ReferralRewardsAmountExceedsMaxBatchSize(esGmx, accounts.length, maxBatchSize);
        }

        uint256 esGmxForReferralRewards = getUint(Keys.feeDistributorReferralRewardsAmountKey(esGmx));
        uint256 maxEsGmxReferralRewards = getUint(Keys.feeDistributorAmountThresholdKey(referralRewardsEsGmxKey));
        if (esGmxForReferralRewards > maxEsGmxReferralRewards) {
            revert Errors.EsGmxReferralRewardsThresholdBreached(esGmxForReferralRewards, maxEsGmxReferralRewards);
        }

        uint256 vaultEsGmxBalance = IERC20(esGmx).balanceOf(address(feeDistributorVault));
        if (esGmxForReferralRewards > vaultEsGmxBalance) {
            IMintable(esGmx).mint(address(feeDistributorVault), esGmxForReferralRewards - vaultEsGmxBalance);
        }

        uint256 totalEsGmxSent = getUint(Keys.feeDistributorReferralRewardsSentKey(esGmx));
        for (uint256 i; i < accounts.length; i++) {
            address account = accounts[i];
            uint256 esGmxAmount = amounts[i];
            feeDistributorVault.transferOut(esGmx, account, esGmxAmount);
            totalEsGmxSent = totalEsGmxSent + esGmxAmount;

            EventUtils.EventLogData memory eventData;
            eventData.uintItems.initItems(1);
            eventData.uintItems.setItem(0, "esGmxAmount", esGmxAmount);

            eventEmitter.emitEventLog("esGmxReferralRewardsSent", eventData);
        }

        if (totalEsGmxSent > esGmxForReferralRewards) {
            revert Errors.EsGmxReferralRewardsThresholdBreached(totalEsGmxSent, esGmxForReferralRewards);
        }

        setUint(Keys.feeDistributorReferralRewardsSentKey(esGmx), totalEsGmxSent);
    }

    function withdrawTokens(
        address token,
        address receiver,
        uint256 amount,
        bool shouldUnwrapNativeToken
    ) external nonReentrant onlyController {
        feeDistributorVault.transferOut(token, receiver, amount, shouldUnwrapNativeToken);
    }

    function updateRewardDistribution(address rewardToken, address tracker, uint256 rewardAmount) internal {
        feeDistributorVault.transferOut(rewardToken, tracker, rewardAmount);
        address distributor = IRewardTracker(tracker).distributor();
        IRewardDistributor(distributor).updateLastDistributionTime();
        IRewardDistributor(distributor).setTokensPerInterval(rewardAmount / 1 weeks);
    }

    function setUint(bytes32 fullKey, uint256 value) internal {
        dataStore.setUint(fullKey, value);
    }

    function validateDistributionState(DistributionState allowedDistributionState) internal view {
        uint256 distributionStateUint = getUint(Keys.FEE_DISTRIBUTION_STATE);
        if (allowedDistributionState != DistributionState(distributionStateUint)) {
            revert Errors.InvalidDistributionState(distributionStateUint);
        }
    }

    function validateDistributionStates(DistributionState[] memory allowedDistributionStates) internal view {
        uint256 distributionStateUint = getUint(Keys.FEE_DISTRIBUTION_STATE);
        for (uint256 i; i < allowedDistributionStates.length; i++) {
            if (allowedDistributionStates[i] == DistributionState(distributionStateUint)) {
                return;
            }
        }
        revert Errors.InvalidDistributionState(distributionStateUint);
    }

    function validateDistributionNotCompleted() internal view {
        uint256 dayOfWeek = ((block.timestamp / 1 weeks) + 4) % 7;
        uint256 daysSinceStartOfWeek = (dayOfWeek + 7 - getUint(Keys.FEE_DISTRIBUTOR_DISTRIBUTION_DAY)) % 7;
        uint256 midnightToday = (block.timestamp - (block.timestamp % 1 weeks));
        uint256 startOfWeek = midnightToday - (daysSinceStartOfWeek * 1 weeks);
        uint256 lastDistributionTime = getUint(Keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP);
        if (lastDistributionTime > startOfWeek) {
            revert Errors.FeeDistributionAlreadyCompleted(lastDistributionTime, startOfWeek);
        }
    }

    function validateReadResponseTimestamp(uint256 readResponseTimestamp) internal view {
        if (block.timestamp - readResponseTimestamp > getUint(Keys.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY)) {
            revert Errors.OutdatedReadResponse(readResponseTimestamp);
        }
    }

    function getUint(bytes32 fullKey) internal view returns (uint256) {
        return dataStore.getUint(fullKey);
    }

    function getAddress(bytes32 fullKey) internal view returns (address) {
        return dataStore.getAddress(fullKey);
    }

    function getAddress(uint256 chainId, bytes32 addressKey) internal view returns (address) {
        return getAddress(Keys.feeDistributorAddressInfoKey(chainId, addressKey));
    }
}
