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

    struct DistributeInputParams {
        uint256 wntReferralRewardsInUsd;
        uint256 esGmxForReferralRewards;
        uint256 feesV1Usd;
        uint256 feesV2Usd;
    }

    struct DistributeParams {
        address wnt;
        address gmx;
        address[] keepers;
        uint256[] keepersTargetBalance;
        uint256 wntForChainlink;
        uint256 wntForTreasury;
        uint256 wntForReferralRewards;
        uint256 wntForGlp;
        uint256 wntForKeepers;
    }

    struct HandleGmxFeeBridgingParams {
        uint256 feeAmountGmxCurrentChainOrig;
        uint256[] chainIds;
        uint256[] feeAmountGmx;
        uint256[] stakedGmx;
        uint256 totalStakedGmx;
        uint256 currentChain;
        uint256 requiredFeeAmount;
        uint256 pendingFeeBridgeAmount;
        uint256 slippageFactor;
        uint256 minFeeReceived;
        uint256 minRequiredFeeAmount;
        uint256[] target;
        int256[] difference;
        uint256[][] bridging;
        int256 needed;
        address synapseRouter;
        uint256 originDeadline;
        uint256 sendAmount;
        address feeReceiver;
        address gmxDestChain;
        uint256 minAmountOut;
        uint256 destDeadline;
        bytes callData;
    }

    struct HandleGmxFeeBridgingOutputParams {
        uint256 feeAmountGmxCurrentChain;
        uint256 totalFeeAmountGmx;
        uint256 totalGmxBridgedOut;
    }

    struct TransferFeesAndCostsParams {
        address[] keepers;
        uint256[] keepersTargetBalance;
        address wnt;
        address gmx;
        uint256 wntForChainlink;
        uint256 wntForTreasury;
        uint256 wntForGlp;
        uint256 feeAmountGmxCurrentChain;
        uint256 wntForReferralRewards;
        uint256 esGmxForReferralRewards;
        uint256 feesV1Usd;
        uint256 feesV2Usd;
    }

    struct ComputeWntFeesAndCostsParams {
        uint256 totalWntBalance;
        uint256 totalFeesUsd;
        bool[] keepersV2;
        uint256 keeperCostsTreasury;
        uint256 keeperCostsGlp;
        uint256 keeperGlpFactor;
        uint256 keeperCost;
        uint256 keeperCostGlp;
        uint256 chainlinkTreasuryWntAmount;
        uint256 wntReferralRewardsInUsdLimit;
        uint256 wntForReferralRewardsThreshold;
        uint256 maxWntReferralRewardsInUsd;
        uint256 maxWntReferralRewards;
        uint256 expectedWntForGlp;
        uint256 glpFeeThreshold;
        uint256 minWntForGlp;
        uint256 treasuryFeeThreshold;
        uint256 minTreasuryWntAmount;
        uint256 wntGlpShortfall;
        uint256 maxTreasuryWntShortfall;
    }

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

    // @dev initiate the weekly fee distribution process
    function initiateDistribute() external nonReentrant onlyFeeDistributionKeeper {
        // validate distribution state and that distribution is not yet completed for the current week
        validateDistributionState(DistributionState.None);
        validateDistributionNotCompleted();

        // reset referral rewards sent for WNT and esGMX to 0 for the current week's distribution
        setUint(Keys.feeDistributorReferralRewardsSentKey(getAddress(Keys.WNT)), 0);
        setUint(Keys.feeDistributorReferralRewardsSentKey(getAddress(block.chainid, esGmxKey)), 0);

        // populate readRequestInputs and extraOptionsInputs param used for cross chain LZRead request
        uint256[] memory chainIds = getUintArray(Keys.FEE_DISTRIBUTOR_CHAIN_ID);
        MultichainReaderUtils.ReadRequestInputs[]
            memory readRequestInputs = new MultichainReaderUtils.ReadRequestInputs[]((chainIds.length - 1) * 3);
        bool skippedCurrentChain;
        for (uint256 i; i < chainIds.length; i++) {
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
            readRequestInputs[readRequestIndex].chainId = layerZeroChainId;
            readRequestInputs[readRequestIndex].target = getAddress(chainId, dataStoreKey);
            readRequestInputs[readRequestIndex].callData = abi.encodeWithSelector(
                DataStore.getUint.selector,
                Keys.withdrawableBuybackTokenAmountKey(gmx)
            );
            readRequestIndex++;

            readRequestInputs[readRequestIndex].chainId = layerZeroChainId;
            readRequestInputs[readRequestIndex].target = gmx;
            readRequestInputs[readRequestIndex].callData = abi.encodeWithSelector(
                IERC20.balanceOf.selector,
                getAddress(chainId, Keys.FEE_RECEIVER)
            );
            readRequestIndex++;

            readRequestInputs[readRequestIndex].chainId = layerZeroChainId;
            readRequestInputs[readRequestIndex].target = extendedGmxTracker;
            readRequestInputs[readRequestIndex].callData = abi.encodeWithSelector(IERC20.totalSupply.selector);
        }

        MultichainReaderUtils.ExtraOptionsInputs memory extraOptionsInputs;
        extraOptionsInputs.gasLimit = uint128(getUint(Keys.FEE_DISTRIBUTOR_GAS_LIMIT));
        extraOptionsInputs.returnDataSize = ((uint32(chainIds.length) - 1) * 96) + 8;

        // calculate native token fee required and execute multichainReader.sendReadRequests LZRead request
        MessagingFee memory messagingFee = multichainReader.quoteReadFee(readRequestInputs, extraOptionsInputs);
        multichainReader.sendReadRequests{value: messagingFee.nativeFee}(readRequestInputs, extraOptionsInputs);

        setUint(Keys.FEE_DISTRIBUTION_STATE, uint256(DistributionState.Initiated));

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "NumberOfChainsReadRequests", chainIds.length - 1);
        eventData.uintItems.setItem(1, "messagingFee.nativeFee", messagingFee.nativeFee);

        emitEventLog("initiateDistribute", eventData);
    }

    // @dev receive and process the LZRead request received data
    // @param guid unused parameter that represents the unique idenfifier for the LZRead request
    // @param receivedData MultichainReaderUtils.ReceivedData the LZRead request received data
    function processLzReceive(
        bytes32 /*guid*/,
        MultichainReaderUtils.ReceivedData calldata receivedData
    ) external nonReentrant onlyMultichainReader {
        // validate the distribution state and that the LZRead response is within the acceptable time limit
        validateDistributionState(DistributionState.Initiated);
        validateReadResponseTimestamp(receivedData.timestamp);

        // set the LZRead response fee amounts, staked GMX amounts, timestamp and current chain WNT price
        uint256[] memory chainIds = getUintArray(Keys.FEE_DISTRIBUTOR_CHAIN_ID);
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
        setUint(Keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP, receivedData.timestamp);
        setUint(Keys.FEE_DISTRIBUTION_STATE, uint256(DistributionState.ReadDataReceived));

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "NumberOfChainsReceivedData", chainIds.length - 1);
        eventData.uintItems.setItem(1, "ReceivedDataTimestamp", receivedData.timestamp);
        eventData.uintItems.setItem(2, "wntPriceInUsd", wntPriceInUsd);

        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "ReceivedDataReadData", receivedData.readData);

        emitEventLog("FeeDistributionReceivedData", eventData);
    }

    // @dev complete the fee distribution calculations, token transfers and if necessary bridge GMX cross-chain
    // @param inputParams DistributeInputParams the input params calculated by the FeeDistribution keeper
    function distribute(DistributeInputParams calldata inputParams) external nonReentrant onlyFeeDistributionKeeper {
        // validate the distribution states, LZRead response timestamp and distribution has not yet been completed
        DistributionState[] memory allowedDistributionStates = new DistributionState[](2);
        allowedDistributionStates[0] = DistributionState.ReadDataReceived;
        allowedDistributionStates[1] = DistributionState.DistributePending;
        validateDistributionStates(allowedDistributionStates);
        validateReadResponseTimestamp(getUint(Keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP));
        validateDistributionNotCompleted();

        DistributeParams memory params;
        HandleGmxFeeBridgingOutputParams memory bridgeParams;

        params.wnt = getAddress(Keys.WNT);
        params.gmx = getAddress(block.chainid, gmxKey);

        //withdraw any WNT and GMX fees remaining in the feeHandler
        feeHandler.withdrawFees(params.wnt);
        feeHandler.withdrawFees(params.gmx);

        // calculate the WNT GLP fees and other costs
        (
            params.keepers,
            params.keepersTargetBalance,
            params.wntForChainlink,
            params.wntForTreasury,
            params.wntForReferralRewards,
            params.wntForGlp
        ) = calculateWntFeesAndCosts(
            params.wnt,
            inputParams.wntReferralRewardsInUsd,
            inputParams.feesV1Usd,
            inputParams.feesV2Usd
        );

        // determine if GMX fees need to be bridged and execute GMX bridge transactions
        bridgeParams = handleGmxFeeBridging(params.gmx);

        // transfer calculated fees and costs to the appropriate addresses
        params.wntForKeepers = transferFeesAndCosts(
            TransferFeesAndCostsParams(
                params.keepers,
                params.keepersTargetBalance,
                params.wnt,
                params.gmx,
                params.wntForChainlink,
                params.wntForTreasury,
                params.wntForGlp,
                bridgeParams.feeAmountGmxCurrentChain,
                params.wntForReferralRewards,
                inputParams.esGmxForReferralRewards,
                inputParams.feesV1Usd,
                inputParams.feesV2Usd
            )
        );

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(10);
        eventData.uintItems.setItem(0, "feesV1Usd", inputParams.feesV1Usd);
        eventData.uintItems.setItem(1, "feesV2Usd", inputParams.feesV2Usd);
        eventData.uintItems.setItem(2, "feeAmountGmxCurrentChain", bridgeParams.feeAmountGmxCurrentChain);
        eventData.uintItems.setItem(3, "totalFeeAmountGmx", bridgeParams.totalFeeAmountGmx);
        eventData.uintItems.setItem(4, "totalGmxBridgedOut", bridgeParams.totalGmxBridgedOut);
        eventData.uintItems.setItem(5, "wntForKeepers", params.wntForKeepers);
        eventData.uintItems.setItem(6, "wntForChainlink", params.wntForChainlink);
        eventData.uintItems.setItem(7, "wntForTreasury", params.wntForTreasury);
        eventData.uintItems.setItem(8, "wntForReferralRewards", params.wntForReferralRewards);
        eventData.uintItems.setItem(9, "wntForGlp", params.wntForGlp);

        emitEventLog("FeeDistributionCompleted", eventData);
    }

    // @dev distribute the calculated WNT referral rewards to the specified accounts
    // @param accounts the accounts to which WNT referral rewards will be sent
    // @param amounts the amounts of WNT referral rewards that will be sent to each account
    // @param maxBatchSize the maximum number of accounts that will be sent in one transaction
    function sendWnt(
        address[] calldata accounts,
        uint256[] calldata amounts,
        uint256 maxBatchSize
    ) external nonReentrant onlyFeeDistributionKeeper {
        // validate the distribution state and that the accounts and amounts arrays are valid lengths
        validateDistributionState(DistributionState.None);

        address wnt = getAddress(Keys.WNT);
        if (accounts.length != amounts.length) {
            revert Errors.ReferralRewardsArrayMismatch(wnt, accounts.length, amounts.length);
        }

        if (accounts.length > maxBatchSize) {
            revert Errors.ReferralRewardsAmountExceedsMaxBatchSize(wnt, accounts.length, maxBatchSize);
        }

        // send the WNT referral rewards to the specified accounts
        uint256 totalWntSent = getUint(Keys.feeDistributorReferralRewardsSentKey(wnt));
        for (uint256 i; i < accounts.length; i++) {
            address account = accounts[i];
            uint256 wntAmount = amounts[i];
            transferOut(wnt, account, wntAmount);
            totalWntSent = totalWntSent + wntAmount;

            EventUtils.EventLogData memory eventData;
            eventData.uintItems.initItems(1);
            eventData.uintItems.setItem(0, "wntAmount", wntAmount);

            emitEventLog("wntReferralRewardsSent", eventData);
        }

        // validate that the total WNT referral rewards sent out is not greater than the total calculated amount
        uint256 wntForReferralRewards = getUint(Keys.feeDistributorReferralRewardsAmountKey(wnt));
        if (totalWntSent > wntForReferralRewards) {
            revert Errors.WntReferralRewardsThresholdBreached(totalWntSent, wntForReferralRewards);
        }

        setUint(Keys.feeDistributorReferralRewardsSentKey(wnt), totalWntSent);
    }

    // @dev distribute the calculated esGMX referral rewards to the specified accounts
    // @param accounts the accounts to which esGMX referral rewards will be sent
    // @param amounts the amounts of esGMX referral rewards that will be sent to each account
    // @param maxBatchSize the maximum number of accounts that will be sent in one transaction
    function sendEsGmx(
        address[] calldata accounts,
        uint256[] calldata amounts,
        uint256 maxBatchSize
    ) external nonReentrant onlyFeeDistributionKeeper {
        // validate the distribution state and that the accounts and amounts arrays are valid lengths
        validateDistributionState(DistributionState.None);

        address esGmx = getAddress(block.chainid, esGmxKey);
        if (accounts.length != amounts.length) {
            revert Errors.ReferralRewardsArrayMismatch(esGmx, accounts.length, amounts.length);
        }

        if (accounts.length > maxBatchSize) {
            revert Errors.ReferralRewardsAmountExceedsMaxBatchSize(esGmx, accounts.length, maxBatchSize);
        }

        // send the WNT referral rewards to the specified accounts
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
            transferOut(esGmx, account, esGmxAmount);
            totalEsGmxSent = totalEsGmxSent + esGmxAmount;

            EventUtils.EventLogData memory eventData;
            eventData.uintItems.initItems(1);
            eventData.uintItems.setItem(0, "esGmxAmount", esGmxAmount);

            emitEventLog("esGmxReferralRewardsSent", eventData);
        }

        // validate that the total esGMX referral rewards sent out is not greater than the total calculated amount
        if (totalEsGmxSent > esGmxForReferralRewards) {
            revert Errors.EsGmxReferralRewardsThresholdBreached(totalEsGmxSent, esGmxForReferralRewards);
        }

        setUint(Keys.feeDistributorReferralRewardsSentKey(esGmx), totalEsGmxSent);
    }

    // @dev allows for the withdrawal of tokens from the feeDistributorVault
    // @param token the token to be withdrawn
    // @param receiver the address to which the tokens are sent
    // @param amount the amount of token to be withdrawn
    // @param shouldUnwrapNativeToken whether a WNT should be unwrapped when withdrawing
    function withdrawTokens(
        address token,
        address receiver,
        uint256 amount,
        bool shouldUnwrapNativeToken
    ) external nonReentrant onlyController {
        feeDistributorVault.transferOut(token, receiver, amount, shouldUnwrapNativeToken);
    }

    function updateRewardDistribution(address rewardToken, address tracker, uint256 rewardAmount) internal {
        // transfer the calculated fees for the week and update the last distribution time and tokens per interval
        transferOut(rewardToken, tracker, rewardAmount);
        address distributor = IRewardTracker(tracker).distributor();
        IRewardDistributor(distributor).updateLastDistributionTime();
        IRewardDistributor(distributor).setTokensPerInterval(rewardAmount / 1 weeks);
    }

    function handleGmxFeeBridging(address gmx) internal returns (HandleGmxFeeBridgingOutputParams memory) {
        // calculation of the amount of GMX that needs to be bridged to ensure all chains have sufficient fees
        HandleGmxFeeBridgingParams memory params;
        HandleGmxFeeBridgingOutputParams memory outputParams;
        params.feeAmountGmxCurrentChainOrig = getUint(Keys.feeDistributorFeeAmountGmxKey(block.chainid));
        outputParams.feeAmountGmxCurrentChain = params.feeAmountGmxCurrentChainOrig;
        DistributionState distributionState = DistributionState(getUint(Keys.FEE_DISTRIBUTION_STATE));
        if (distributionState == DistributionState.DistributePending) {
            outputParams.feeAmountGmxCurrentChain = IERC20(gmx).balanceOf(address(feeDistributorVault));
            setUint(Keys.feeDistributorFeeAmountGmxKey(block.chainid), outputParams.feeAmountGmxCurrentChain);
        }

        params.chainIds = getUintArray(Keys.FEE_DISTRIBUTOR_CHAIN_ID);
        params.feeAmountGmx = new uint256[](params.chainIds.length);
        params.stakedGmx = new uint256[](params.chainIds.length);
        for (uint256 i; i < params.chainIds.length; i++) {
            if (params.chainIds[i] == block.chainid) {
                params.currentChain = i;
                params.feeAmountGmx[i] = outputParams.feeAmountGmxCurrentChain;
                outputParams.totalFeeAmountGmx = outputParams.totalFeeAmountGmx + outputParams.feeAmountGmxCurrentChain;
                params.stakedGmx[i] = getUint(Keys.feeDistributorStakedGmxKey(params.chainIds[i]));
                params.totalStakedGmx = params.totalStakedGmx + params.stakedGmx[i];
            } else {
                params.feeAmountGmx[i] = getUint(Keys.feeDistributorFeeAmountGmxKey(params.chainIds[i]));
                outputParams.totalFeeAmountGmx = outputParams.totalFeeAmountGmx + params.feeAmountGmx[i];
                params.stakedGmx[i] = getUint(Keys.feeDistributorStakedGmxKey(params.chainIds[i]));
                params.totalStakedGmx = params.totalStakedGmx + params.stakedGmx[i];
            }
        }

        // uses the minimum bridged fees received due to slippage if bridged fees are required plus an additional
        // buffer to determine the minimum acceptable fee amount that's allowed in case of any further deviations
        params.requiredFeeAmount =
            (outputParams.totalFeeAmountGmx * params.stakedGmx[params.currentChain]) /
            params.totalStakedGmx;
        params.pendingFeeBridgeAmount = params.requiredFeeAmount - params.feeAmountGmxCurrentChainOrig;
        params.slippageFactor = getUint(Keys.feeDistributorBridgeSlippageFactorKey(params.currentChain));
        params.minFeeReceived = params.pendingFeeBridgeAmount == 0
            ? 0
            : Precision.applyFactor(params.pendingFeeBridgeAmount, params.slippageFactor) -
                getUint(Keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_AMOUNT);
        params.minRequiredFeeAmount = params.feeAmountGmxCurrentChainOrig + params.minFeeReceived;

        if (params.minRequiredFeeAmount > outputParams.feeAmountGmxCurrentChain) {
            if (distributionState == DistributionState.DistributePending) {
                revert Errors.BridgedAmountNotSufficient(
                    params.minRequiredFeeAmount,
                    outputParams.feeAmountGmxCurrentChain
                );
            }
            setUint(Keys.FEE_DISTRIBUTION_STATE, uint256(DistributionState.DistributePending));
            return (outputParams);
        }

        if (distributionState == DistributionState.ReadDataReceived) {
            params.target = new uint256[](params.chainIds.length);
            for (uint256 i; i < params.chainIds.length; i++) {
                params.target[i] = (outputParams.totalFeeAmountGmx * params.stakedGmx[i]) / params.totalStakedGmx;
            }

            params.difference = new int256[](params.chainIds.length);
            for (uint256 i; i < params.chainIds.length; i++) {
                params.difference[i] = int256(params.feeAmountGmx[i]) - int256(params.target[i]);
            }

            params.bridging = new uint256[][](params.chainIds.length);
            for (uint256 i; i < params.chainIds.length; i++) {
                params.bridging[i] = new uint256[](params.chainIds.length);
            }

            // the outer loop iterates through each chain to see if it has surplus
            uint256 deficitIndex;
            for (uint256 surplusIndex; surplusIndex < params.chainIds.length; surplusIndex++) {
                if (params.difference[surplusIndex] <= 0) continue;

                // move deficitIndex forward until a chain is found that has a deficit
                // (difference[deficitIndex] < 0)
                while (deficitIndex < params.chainIds.length && params.difference[deficitIndex] >= 0) {
                    deficitIndex++;
                }

                // if the deficitIndex iteration is complete, there are no more deficits to fill; break out
                if (deficitIndex == params.chainIds.length) break;

                // now fill the deficit on chain `deficitIndex` using the surplus on chain `surplusIndex`
                while (params.difference[surplusIndex] > 0 && deficitIndex < params.chainIds.length) {
                    // the needed amount is the absolute value of the deficit
                    // e.g. if difference[deficitIndex] == -100, needed == 100
                    params.needed = -params.difference[deficitIndex];

                    if (params.needed > params.difference[surplusIndex]) {
                        // if needed > difference[surplusIndex], then the deficit is larger than the
                        // surplus so all GMX that the surplus chain has is sent to the deficit chain
                        params.bridging[surplusIndex][deficitIndex] += uint256(params.difference[surplusIndex]);

                        // reduce the deficit by the surplus that was just sent
                        params.difference[deficitIndex] += params.difference[surplusIndex];

                        // the surplus chain is now fully used up
                        params.difference[surplusIndex] = 0;
                    } else {
                        // otherwise the needed amount of GMX for the deficit chain can be fully covered
                        params.bridging[surplusIndex][deficitIndex] += uint256(params.needed);

                        // reduce the surplus by exactly the needed amount
                        params.difference[surplusIndex] -= params.needed;

                        // the deficit chain is now at zero difference (fully covered)
                        params.difference[deficitIndex] = 0;

                        // move on to the next deficit chain
                        deficitIndex++;

                        // skip any chain that doesn't have a deficit
                        while (deficitIndex < params.chainIds.length && params.difference[deficitIndex] >= 0) {
                            deficitIndex++;
                        }
                    }
                }
            }
        }

        // populate the bridging transaction calldata and execute the GMX bridging transactions
        params.synapseRouter = getAddress(block.chainid, synapseRouterKey);
        params.originDeadline = block.timestamp + getUint(Keys.feeDistributorBridgeOriginDeadlineKey(block.chainid));
        for (uint256 i; i < params.chainIds.length; i++) {
            params.sendAmount = params.bridging[params.currentChain][i];
            if (params.sendAmount > 0) {
                transferOut(gmx, address(this), params.sendAmount);
                IERC20(gmx).approve(params.synapseRouter, params.sendAmount);

                params.feeReceiver = getAddress(params.chainIds[i], Keys.FEE_RECEIVER);
                params.gmxDestChain = getAddress(params.chainIds[i], gmxKey);
                params.minAmountOut = Precision.applyFactor(params.sendAmount, params.slippageFactor);
                params.destDeadline =
                    block.timestamp +
                    getUint(Keys.feeDistributorBridgeDestDeadlineKey(params.chainIds[i]));
                params.callData = abi.encodeWithSignature(
                    "bridge(address,uint256,address,uint256,(address,address,uint256,uint256,bytes),(address,address,uint256,uint256,bytes))",
                    params.feeReceiver,
                    params.chainIds[i],
                    gmx,
                    params.sendAmount,
                    address(0),
                    gmx,
                    params.sendAmount,
                    params.originDeadline,
                    "",
                    address(0),
                    params.gmxDestChain,
                    params.minAmountOut,
                    params.destDeadline,
                    ""
                );
                (bool success, bytes memory result) = params.synapseRouter.call(params.callData);
                if (!success) {
                    revert Errors.BridgingTransactionFailed(result);
                }

                outputParams.totalGmxBridgedOut += params.sendAmount;
            }
        }

        // validate that the amount bridged does not exceed the calculated amount to be sent
        if (params.minRequiredFeeAmount > outputParams.feeAmountGmxCurrentChain - outputParams.totalGmxBridgedOut) {
            revert Errors.AttemptedBridgeAmountTooHigh(
                params.minRequiredFeeAmount,
                outputParams.feeAmountGmxCurrentChain,
                outputParams.totalGmxBridgedOut
            );
        }
        return (outputParams);
    }

    function transferFeesAndCosts(TransferFeesAndCostsParams memory params) internal returns (uint256) {
        // transfer the WNT that needs to be sent to each keeper
        uint256 wntForKeepers;
        for (uint256 i; i < params.keepers.length; i++) {
            if (params.keepers[i].balance < params.keepersTargetBalance[i]) {
                feeDistributorVault.transferOutNativeToken(
                    params.keepers[i],
                    params.keepersTargetBalance[i] - params.keepers[i].balance
                );
                wntForKeepers = wntForKeepers + params.keepersTargetBalance[i] - params.keepers[i].balance;
            }
        }

        // transfer the WNT for chainlink costs and WNT to the treasury
        transferOut(params.wnt, getAddress(block.chainid, chainlinkKey), params.wntForChainlink);
        transferOut(params.wnt, getAddress(block.chainid, treasuryKey), params.wntForTreasury);

        // update the reward distribution details and transfer the WNT and GMX fees for GLP and GMX
        updateRewardDistribution(params.wnt, getAddress(block.chainid, feeGlpTrackerKey), params.wntForGlp);
        updateRewardDistribution(
            params.gmx,
            getAddress(block.chainid, extendedGmxTrackerKey),
            params.feeAmountGmxCurrentChain
        );

        // set the total fees in USD and referral reward amounts
        setUint(Keys.feeDistributorFeeAmountUsdKey(1), params.feesV1Usd);
        setUint(Keys.feeDistributorFeeAmountUsdKey(2), params.feesV2Usd);
        setUint(Keys.feeDistributorReferralRewardsAmountKey(params.wnt), params.wntForReferralRewards);
        setUint(
            Keys.feeDistributorReferralRewardsAmountKey(getAddress(block.chainid, esGmxKey)),
            params.esGmxForReferralRewards
        );
        setUint(Keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, block.timestamp);
        setUint(Keys.FEE_DISTRIBUTION_STATE, uint256(DistributionState.None));

        return wntForKeepers;
    }

    function setUint(bytes32 fullKey, uint256 value) internal {
        dataStore.setUint(fullKey, value);
    }

    function transferOut(address token, address receiver, uint256 amount) internal {
        feeDistributorVault.transferOut(token, receiver, amount);
    }

    function emitEventLog(string memory eventName, EventUtils.EventLogData memory eventData) internal {
        eventEmitter.emitEventLog(eventName, eventData);
    }

    function calculateWntFeesAndCosts(
        address wnt,
        uint256 wntReferralRewardsInUsd,
        uint256 feesV1Usd,
        uint256 feesV2Usd
    ) internal view returns (address[] memory, uint256[] memory, uint256, uint256, uint256, uint256) {
        // the WNT fee amount related calculations
        ComputeWntFeesAndCostsParams memory params;
        params.totalWntBalance = IERC20(wnt).balanceOf(address(feeDistributorVault));
        params.totalFeesUsd = feesV1Usd + feesV2Usd;

        // calculate the WNT that needs to be sent to each keeper
        address[] memory keepers = dataStore.getAddressArray(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        uint256[] memory keepersTargetBalance = getUintArray(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        params.keepersV2 = dataStore.getBoolArray(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        if (keepers.length != keepersTargetBalance.length || keepers.length != params.keepersV2.length) {
            revert Errors.KeeperArrayLengthMismatch(
                keepers.length,
                keepersTargetBalance.length,
                params.keepersV2.length
            );
        }

        params.keeperCostsTreasury;
        params.keeperCostsGlp;
        params.keeperGlpFactor = getUint(Keys.FEE_DISTRIBUTOR_KEEPER_GLP_FACTOR);
        for (uint256 i; i < keepers.length; i++) {
            params.keeperCost = keepersTargetBalance[i] - keepers[i].balance;
            if (params.keeperCost > 0) {
                if (params.keepersV2[i]) {
                    params.keeperCostsTreasury = params.keeperCostsTreasury + params.keeperCost;
                } else {
                    params.keeperCostGlp = Precision.applyFactor(params.keeperCost, params.keeperGlpFactor);
                    params.keeperCostsGlp = params.keeperCostsGlp + params.keeperCostGlp;
                    params.keeperCostsTreasury = params.keeperCostsTreasury + params.keeperCost - params.keeperCostGlp;
                }
            }
        }

        // calculate the WNT for chainlink costs and amount of WNT to be sent to the treasury
        params.chainlinkTreasuryWntAmount = Precision.mulDiv(params.totalWntBalance, feesV2Usd, params.totalFeesUsd);
        uint256 wntForChainlink = Precision.applyFactor(
            params.chainlinkTreasuryWntAmount,
            getUint(Keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR)
        );
        uint256 wntForTreasury = params.chainlinkTreasuryWntAmount - wntForChainlink - params.keeperCostsTreasury;

        // calculate the total WNT referral rewards to be sent and validate the calculated amount
        params.wntReferralRewardsInUsdLimit = getUint(Keys.FEE_DISTRIBUTOR_REFERRAL_REWARDS_WNT_USD_LIMIT);
        if (wntReferralRewardsInUsd > params.wntReferralRewardsInUsdLimit) {
            revert Errors.WntReferralRewardsInUsdLimitExceeded(
                wntReferralRewardsInUsd,
                params.wntReferralRewardsInUsdLimit
            );
        }

        params.wntForReferralRewardsThreshold = getUint(Keys.feeDistributorAmountThresholdKey(referralRewardsWntKey));
        params.maxWntReferralRewardsInUsd = Precision.applyFactor(feesV1Usd, params.wntForReferralRewardsThreshold);
        if (wntReferralRewardsInUsd > params.maxWntReferralRewardsInUsd) {
            revert Errors.WntReferralRewardsInUsdThresholdBreached(
                wntReferralRewardsInUsd,
                params.maxWntReferralRewardsInUsd
            );
        }

        uint256 wntForReferralRewards = Precision.toFactor(
            wntReferralRewardsInUsd,
            getUint(Keys.FEE_DISTRIBUTION_WNT_PRICE_IN_USD)
        );
        params.maxWntReferralRewards = Precision.applyFactor(
            params.totalWntBalance,
            params.wntForReferralRewardsThreshold
        );
        if (wntForReferralRewards > params.maxWntReferralRewards) {
            revert Errors.WntReferralRewardsThresholdBreached(wntForReferralRewards, params.maxWntReferralRewards);
        }

        // calculate the amount of WNT to be used as GLP fees, validate the calculated amount and adjust if necessary
        uint256 wntForGlp = params.totalWntBalance -
            params.keeperCostsGlp -
            wntForChainlink -
            wntForTreasury -
            wntForReferralRewards;
        params.expectedWntForGlp = params.totalWntBalance - params.chainlinkTreasuryWntAmount;
        params.glpFeeThreshold = getUint(Keys.feeDistributorAmountThresholdKey(glpKey));
        params.minWntForGlp = Precision.applyFactor(params.expectedWntForGlp, params.glpFeeThreshold);
        if (wntForGlp < params.minWntForGlp) {
            params.treasuryFeeThreshold = getUint(Keys.feeDistributorAmountThresholdKey(treasuryKey));
            params.minTreasuryWntAmount = Precision.applyFactor(wntForTreasury, params.treasuryFeeThreshold);
            params.wntGlpShortfall = params.minWntForGlp - wntForGlp;
            params.maxTreasuryWntShortfall = wntForTreasury - params.minTreasuryWntAmount;
            if (params.wntGlpShortfall > params.maxTreasuryWntShortfall) {
                revert Errors.TreasuryFeeThresholdBreached(
                    wntForTreasury,
                    params.wntGlpShortfall,
                    params.maxTreasuryWntShortfall
                );
            }

            wntForTreasury = wntForTreasury - params.wntGlpShortfall;
            wntForGlp = wntForGlp + params.wntGlpShortfall;
        }

        return (keepers, keepersTargetBalance, wntForChainlink, wntForTreasury, wntForReferralRewards, wntForGlp);
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

    function getUintArray(bytes32 key) internal view returns (uint256[] memory) {
        return dataStore.getUintArray(key);
    }
}
