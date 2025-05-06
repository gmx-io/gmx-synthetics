// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { SendParam, MessagingFee, IOFT } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";

import "./FeeDistributorVault.sol";
import "./FeeHandler.sol";
import "../multichain/MultichainReader.sol";
import "../v1/IRewardTrackerV1.sol";
import "../v1/IRewardDistributorV1.sol";
import "../v1/IVesterV1.sol";
import "../v1/IMintable.sol";

contract FeeDistributor is ReentrancyGuard, RoleModule, OracleModule {
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.BoolItems;

    enum DistributionState {
        None,
        Initiated,
        ReadDataReceived,
        BridgingCompleted
    }

    bytes public constant EMPTY_BYTES = "";

    bytes32 public constant GMX = keccak256(abi.encode("GMX"));
    bytes32 public constant EXTENDED_GMX_TRACKER = keccak256(abi.encode("EXTENDED_GMX_TRACKER"));
    bytes32 public constant DATASTORE = keccak256(abi.encode("DATASTORE"));
    bytes32 public constant REFERRAL_REWARDS_WNT = keccak256(abi.encode("REFERRAL_REWARDS_WNT"));
    bytes32 public constant GLP = keccak256(abi.encode("GLP"));
    bytes32 public constant TREASURY = keccak256(abi.encode("TREASURY"));
    bytes32 public constant LAYERZERO_OFT = keccak256(abi.encode("LAYERZERO_OFT"));
    bytes32 public constant FEE_GLP_TRACKER = keccak256(abi.encode("FEE_GLP_TRACKER"));
    bytes32 public constant CHAINLINK = keccak256(abi.encode("CHAINLINK"));
    bytes32 public constant ESGMX_VESTER = keccak256(abi.encode("ESGMX_VESTER"));

    FeeDistributorVault public immutable feeDistributorVault;
    FeeHandler public immutable feeHandler;
    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    MultichainReader public immutable multichainReader;

    address public immutable gmx;
    address public immutable esGmx;
    address public immutable wnt;

    receive() external payable {}

    constructor(
        RoleStore _roleStore,
        Oracle _oracle,
        FeeDistributorVault _feeDistributorVault,
        FeeHandler _feeHandler,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        MultichainReader _multichainReader,
        address _gmx,
        address _esGmx,
        address _wnt
    ) RoleModule(_roleStore) OracleModule(_oracle) {
        feeDistributorVault = _feeDistributorVault;
        feeHandler = _feeHandler;
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        multichainReader = _multichainReader;
        gmx = _gmx;
        esGmx = _esGmx;
        wnt = _wnt;
    }

    // @dev initiate the weekly fee distribution process
    function initiateDistribute() external nonReentrant onlyFeeDistributionKeeper {
        // validate that the FEE_RECEIVER address stored in dataStore = FeeDistributorVault
        address feeReceiver = dataStore.getAddress(Keys.FEE_RECEIVER);
        if (feeReceiver != address(feeDistributorVault)) {
            revert Errors.InvalidFeeReceiver(feeReceiver);
        }

        // validate distribution state and that distribution is not yet completed for the current week
        validateDistributionState(DistributionState.None);
        validateDistributionNotCompleted();

        // reset referral rewards sent for WNT and esGMX to 0 for the current week's distribution
        setUint(Keys.feeDistributorReferralRewardsSentKey(wnt), 0);
        setUint(Keys.feeDistributorReferralRewardsSentKey(esGmx), 0);

        // populate readRequestInputs and extraOptionsInputs param used for cross chain LZRead request
        uint256[] memory chainIds = getUintArray(Keys.FEE_DISTRIBUTOR_CHAIN_ID);
        uint256 chainIdsLength = chainIds.length;
        MultichainReaderUtils.ReadRequestInputs[]
            memory readRequestInputs = new MultichainReaderUtils.ReadRequestInputs[]((chainIdsLength - 1) * 3);
        uint256 targetChainIndex;
        for (uint256 i; i < chainIdsLength; i++) {
            uint256 chainId = chainIds[i];
            address extendedGmxTracker = getAddress(chainId, EXTENDED_GMX_TRACKER);

            if (chainId == block.chainid) {
                uint256 feeAmountGmxCurrentChain = getUint(Keys.withdrawableBuybackTokenAmountKey(gmx)) +
                    getFeeDistributorVaultBalance(gmx);
                uint256 stakedGmx = IERC20(extendedGmxTracker).totalSupply();
                setUint(Keys.feeDistributorFeeAmountGmxKey(chainId), feeAmountGmxCurrentChain);
                setUint(Keys.feeDistributorStakedGmxKey(chainId), stakedGmx);
                continue;
            }

            address gmxTargetChain = getAddress(chainId, GMX);
            uint32 layerZeroChainId = uint32(getUint(Keys.feeDistributorLayerZeroChainIdKey(chainId)));
            uint256 readRequestIndex = targetChainIndex * 3;
            readRequestInputs[readRequestIndex] = setReadRequestInput(
                layerZeroChainId,
                getAddress(chainId, DATASTORE),
                abi.encodeWithSelector(
                    DataStore.getUint.selector,
                    Keys.withdrawableBuybackTokenAmountKey(gmxTargetChain)
                )
            );
            readRequestIndex++;

            readRequestInputs[readRequestIndex] = setReadRequestInput(
                layerZeroChainId,
                gmxTargetChain,
                abi.encodeWithSelector(IERC20.balanceOf.selector, getAddress(chainId, Keys.FEE_RECEIVER))
            );
            readRequestIndex++;

            readRequestInputs[readRequestIndex] = setReadRequestInput(
                layerZeroChainId,
                extendedGmxTracker,
                abi.encodeWithSelector(IERC20.totalSupply.selector)
            );
            targetChainIndex++;
        }

        MultichainReaderUtils.ExtraOptionsInputs memory extraOptionsInputs;
        extraOptionsInputs.gasLimit = uint128(getUint(Keys.FEE_DISTRIBUTOR_GAS_LIMIT));
        extraOptionsInputs.returnDataSize = ((uint32(chainIdsLength) - 1) * 96) + 8;

        setDistributionState(uint256(DistributionState.Initiated));

        // calculate native token fee required and execute multichainReader.sendReadRequests LZRead request
        MessagingFee memory messagingFee = multichainReader.quoteReadFee(readRequestInputs, extraOptionsInputs);
        multichainReader.sendReadRequests{ value: messagingFee.nativeFee }(readRequestInputs, extraOptionsInputs);

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(2);
        eventData = setUintItem(eventData, 0, "numberOfChainsReadRequests", chainIdsLength - 1);
        eventData = setUintItem(eventData, 1, "messagingFee.nativeFee", messagingFee.nativeFee);
        emitEventLog("FeeDistributionInitiated", eventData);
    }

    // @dev receive and process the LZRead request received data and bridge GMX to other chains if necessary
    // @param guid unused parameter that represents the unique idenfifier for the LZRead request
    // @param receivedData MultichainReaderUtils.ReceivedData the LZRead request received data
    function processLzReceive(
        bytes32 /*guid*/,
        MultichainReaderUtils.ReceivedData calldata receivedData
    ) external onlyMultichainReader {
        // validate the distribution state and that the LZRead response is within the acceptable time limit
        validateDistributionState(DistributionState.Initiated);
        validateReadResponseTimestamp(receivedData.timestamp);

        // withdraw any GMX fees remaining in the feeHandler
        feeHandler.withdrawFees(gmx);

        // set the current chain and LZRead response fee amounts, staked GMX amounts, timestamp and current chain WNT price
        uint256[] memory chainIds = getUintArray(Keys.FEE_DISTRIBUTOR_CHAIN_ID);
        uint256[] memory feeAmountsGmx = createUintArray(chainIds.length);
        uint256[] memory stakedAmountsGmx = createUintArray(chainIds.length);
        uint256 feeAmountGmxCurrentChain = getUint(Keys.feeDistributorFeeAmountGmxKey(block.chainid));
        uint256 stakedGmxCurrentChain = getUint(Keys.feeDistributorStakedGmxKey(block.chainid));
        uint256 totalFeeAmountGmx;
        uint256 totalStakedGmx;
        uint256 currentChainIndex;
        uint256 targetChainIndex;
        for (uint256 i; i < chainIds.length; i++) {
            uint256 chainId = chainIds[i];

            if (chainId == block.chainid) {
                feeAmountsGmx[i] = feeAmountGmxCurrentChain;
                stakedAmountsGmx[i] = stakedGmxCurrentChain;
                totalFeeAmountGmx += feeAmountGmxCurrentChain;
                totalStakedGmx += stakedGmxCurrentChain;
                currentChainIndex = i;
                continue;
            }
            (uint256 feeAmountGmx, uint256 stakedGmx) = decodeReadData(receivedData.readData, targetChainIndex);
            feeAmountsGmx[i] = feeAmountGmx;
            stakedAmountsGmx[i] = stakedGmx;
            totalFeeAmountGmx += feeAmountGmx;
            totalStakedGmx += stakedGmx;
            setUint(Keys.feeDistributorFeeAmountGmxKey(chainId), feeAmountGmx);
            setUint(Keys.feeDistributorStakedGmxKey(chainId), stakedGmx);
            targetChainIndex++;
        }
        setUint(Keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX, totalFeeAmountGmx);
        setUint(Keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX, totalStakedGmx);
        setUint(Keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP, receivedData.timestamp);
        setTokenPrices();

        uint256 requiredGmxAmount = Precision.mulDiv(totalFeeAmountGmx, stakedGmxCurrentChain, totalStakedGmx);
        bool isBridgingCompleted;
        // validate that the this chain has sufficient GMX to distribute fees
        if (feeAmountGmxCurrentChain >= requiredGmxAmount) {
            // only attempt to bridge to other chains if this chain has a surplus of GMX
            if (feeAmountGmxCurrentChain > requiredGmxAmount) {
                // Call the internal bridging function
                uint256 totalGmxBridgedOut = calculateAndBridgeGmx(
                    chainIds,
                    totalFeeAmountGmx,
                    stakedAmountsGmx,
                    totalStakedGmx,
                    feeAmountsGmx,
                    currentChainIndex
                );

                uint256 newFeeAmountGmxCurrentChain = feeAmountGmxCurrentChain - totalGmxBridgedOut;
                // validate that the amount bridged does not result in a GMX fee amount deficit on the current chain
                if (requiredGmxAmount > newFeeAmountGmxCurrentChain) {
                    revert Errors.AttemptedBridgeAmountTooHigh(
                        requiredGmxAmount,
                        feeAmountGmxCurrentChain,
                        totalGmxBridgedOut
                    );
                }
                setUint(Keys.feeDistributorFeeAmountGmxKey(block.chainid), newFeeAmountGmxCurrentChain);
            }
            isBridgingCompleted = true;
            setDistributionState(uint256(DistributionState.BridgingCompleted));
        } else {
            isBridgingCompleted = false;
            setDistributionState(uint256(DistributionState.ReadDataReceived));
        }

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(1);
        eventData = setUintItem(eventData, 0, "feeAmountGmxCurrentChain", feeAmountGmxCurrentChain);
        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "receivedData", abi.encode(receivedData));
        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "isBridgingCompleted", isBridgingCompleted);
        emitEventLog("FeeDistributionDataReceived", eventData);
    }

    // @dev function executed via an automated Gelato transaction when bridged GMX is received on this chain
    function bridgedGmxReceived() external nonReentrant onlyFeeDistributionKeeper {
        validateDistributionState(DistributionState.ReadDataReceived);
        validateReadResponseTimestamp(getUint(Keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP));
        validateDistributionNotCompleted();

        uint256 totalFeeAmountGmx = getUint(Keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);
        uint256 stakedGmxCurrentChain = getUint(Keys.feeDistributorStakedGmxKey(block.chainid));
        uint256 totalStakedGmx = getUint(Keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);
        uint256 requiredGmxAmount = Precision.mulDiv(totalFeeAmountGmx, stakedGmxCurrentChain, totalStakedGmx);
        uint256 origFeeAmountGmxCurrentChain = getUint(Keys.feeDistributorFeeAmountGmxKey(block.chainid));

        // the gross amount of GMX that should be received, before taking into account slippage
        uint256 grossGmxReceived = requiredGmxAmount - origFeeAmountGmxCurrentChain;
        // the slippage factor used when bridging to account for bridging fees and potential slippage
        uint256 slippageFactor = getUint(Keys.feeDistributorBridgeSlippageFactorKey(block.chainid));
        // calculate the minimum acceptable amount of bridged GMX received, taking into account allowed slippage
        uint256 minGmxReceived = Precision.applyFactor(grossGmxReceived, slippageFactor);
        // the minimum allowed GMX amount after bridging, taking into account slippage
        uint256 minRequiredGmxAmount = origFeeAmountGmxCurrentChain + minGmxReceived;
        // retrieve the current GMX available to distribute now that bridging has been completed
        uint256 feeAmountGmxCurrentChain = getFeeDistributorVaultBalance(gmx);

        // if the calculated amount doesn't meet the min bridging requirement, revert
        if (feeAmountGmxCurrentChain < minRequiredGmxAmount) {
            revert Errors.BridgedAmountNotSufficient(minRequiredGmxAmount, feeAmountGmxCurrentChain);
        }

        // now that the GMX available to distribute has been validated, update in dataStore and update DistributionState
        setUint(Keys.feeDistributorFeeAmountGmxKey(block.chainid), feeAmountGmxCurrentChain);
        setDistributionState(uint256(DistributionState.BridgingCompleted));

        // infer the bridged GMX received - note that it is technically possible for this value to not match the actual
        // bridged GMX received if for example, GMX is sent to the FeeDistributorVault from another source or GMX fees
        // are withdrawn from the FeeHandler after processLzReceive() is executed but before this function is executed
        uint256 gmxReceived = feeAmountGmxCurrentChain - origFeeAmountGmxCurrentChain;

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(2);
        eventData = setUintItem(eventData, 0, "gmxReceived", gmxReceived);
        eventData = setUintItem(eventData, 1, "feeAmountGmxCurrentChain", feeAmountGmxCurrentChain);
        emitEventLog("FeeDistributionBridgedGmxReceived", eventData);
    }

    // @dev complete the fee distribution calculations, token transfers and if necessary bridge GMX cross-chain
    // @param wntReferralRewardsInUsd the total WNT referral rewards in USD
    // @param esGmxForReferralRewards the total esGMX to be distributed for referral rewards
    // @param feesV1Usd the total V1 fees in USD
    // @param feesV2Usd the total V2 fees in USD
    function distribute(
        uint256 wntReferralRewardsInUsd,
        uint256 esGmxForReferralRewards,
        uint256 feesV1Usd,
        uint256 feesV2Usd
    ) external nonReentrant onlyFeeDistributionKeeper {
        // validate the distribution states, LZRead response timestamp and distribution has not yet been completed
        validateDistributionState(DistributionState.BridgingCompleted);
        validateReadResponseTimestamp(getUint(Keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP));
        validateDistributionNotCompleted();

        // withdraw any WNT fees remaining in the feeHandler
        feeHandler.withdrawFees(wnt);

        // calculate the WNT GLP fees and other costs
        (
            uint256 wntForKeepers,
            uint256 wntForChainlink,
            uint256 wntForTreasury,
            uint256 wntForReferralRewards,
            uint256 wntForGlp
        ) = calculateWntFeesAndCosts(wntReferralRewardsInUsd, feesV1Usd, feesV2Usd);

        // transfer calculated fees and costs to the appropriate addresses
        transferFeesAndCosts(wntForKeepers, wntForChainlink, wntForTreasury, wntForGlp);

        // set the total fees in USD and referral reward amounts
        setUint(Keys.feeDistributorFeeAmountUsdKey(1), feesV1Usd);
        setUint(Keys.feeDistributorFeeAmountUsdKey(2), feesV2Usd);
        setUint(Keys.feeDistributorReferralRewardsAmountKey(wnt), wntForReferralRewards);
        setUint(Keys.feeDistributorReferralRewardsAmountKey(esGmx), esGmxForReferralRewards);
        setUint(Keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, block.timestamp);
        setDistributionState(uint256(DistributionState.None));

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(8);
        eventData = setUintItem(eventData, 0, "feesV1Usd", feesV1Usd);
        eventData = setUintItem(eventData, 1, "feesV2Usd", feesV2Usd);
        eventData = setUintItem(eventData, 2, "wntForKeepers", wntForKeepers);
        eventData = setUintItem(eventData, 3, "wntForChainlink", wntForChainlink);
        eventData = setUintItem(eventData, 4, "wntForTreasury", wntForTreasury);
        eventData = setUintItem(eventData, 5, "wntForGlp", wntForGlp);
        eventData = setUintItem(eventData, 6, "wntForReferralRewards", wntForReferralRewards);
        eventData = setUintItem(eventData, 7, "esGmxForReferralRewards", esGmxForReferralRewards);
        emitEventLog("FeeDistributionCompleted", eventData);
    }

    // @dev distribute the calculated referral rewards to the specified accounts
    // @param token the token in which the referral rewards will be sent
    // @param maxBatchSize the maximum number of accounts that will be sent in one transaction
    // @param accounts the accounts to which referral rewards will be sent
    // @param amounts the amounts of referral rewards that will be sent to each account
    function sendReferralRewards(
        address token,
        uint256 maxBatchSize,
        address[] calldata accounts,
        uint256[] calldata amounts
    ) external nonReentrant onlyFeeDistributionKeeper {
        // validate the distribution state and that the accounts and amounts arrays are valid lengths
        validateDistributionState(DistributionState.None);

        if (accounts.length != amounts.length) {
            revert Errors.ReferralRewardsArrayMismatch(token, accounts.length, amounts.length);
        }

        if (accounts.length > maxBatchSize) {
            revert Errors.ReferralRewardsAmountExceedsMaxBatchSize(token, accounts.length, maxBatchSize);
        }

        uint256 totalTokensSent = getUint(Keys.feeDistributorReferralRewardsSentKey(token));
        if (token == esGmx) {
            // validate the esGMX amount is valid and that there are sufficient esGMX in the feeDistributorVault
            uint256 esGmxForReferralRewards = getUint(Keys.feeDistributorReferralRewardsAmountKey(esGmx));
            uint256 maxEsGmxReferralRewards = getUint(Keys.FEE_DISTRIBUTOR_REFERRAL_REWARDS_ESGMX_LIMIT);
            if (esGmxForReferralRewards > maxEsGmxReferralRewards) {
                revert Errors.ReferralRewardsThresholdBreached(esGmx, esGmxForReferralRewards, maxEsGmxReferralRewards);
            }

            uint256 vaultEsGmxBalance = getFeeDistributorVaultBalance(esGmx);
            if (esGmxForReferralRewards > vaultEsGmxBalance) {
                IMintable(esGmx).mint(address(feeDistributorVault), esGmxForReferralRewards - vaultEsGmxBalance);
            }

            // send the esGMX referral rewards to the specified accounts and update bonus reward amounts
            for (uint256 i; i < accounts.length; i++) {
                address account = accounts[i];
                uint256 esGmxAmount = amounts[i];
                transferOut(token, account, esGmxAmount);
                totalTokensSent += esGmxAmount;

                address vester = getAddress(block.chainid, ESGMX_VESTER);
                uint256 updatedBonusRewards = IVester(vester).bonusRewards(account) + esGmxAmount;
                IVester(vester).setBonusRewards(account, updatedBonusRewards);

                EventUtils.EventLogData memory eventData;
                eventData.uintItems.initItems(2);
                eventData = setUintItem(eventData, 0, "esGmxAmount", esGmxAmount);
                eventData = setUintItem(eventData, 1, "updatedBonusRewards", updatedBonusRewards);
                emitEventLog("EsGmxReferralRewardsSent", eventData);
            }
        } else if (token == wnt) {
            // send the WNT referral rewards to the specified accounts
            for (uint256 i; i < accounts.length; i++) {
                address account = accounts[i];
                uint256 wntAmount = amounts[i];
                transferOut(token, account, wntAmount);
                totalTokensSent += wntAmount;

                EventUtils.EventLogData memory eventData;
                eventData.uintItems.initItems(1);
                eventData = setUintItem(eventData, 0, "wntAmount", wntAmount);
                emitEventLog("WntReferralRewardsSent", eventData);
            }
        } else {
            revert Errors.InvalidReferralRewardToken(token);
        }

        // validate that the total referral rewards sent out is not greater than the total calculated amount
        uint256 tokensForReferralRewards = getUint(Keys.feeDistributorReferralRewardsAmountKey(token));
        if (totalTokensSent > tokensForReferralRewards) {
            revert Errors.ReferralRewardsThresholdBreached(token, totalTokensSent, tokensForReferralRewards);
        }

        setUint(Keys.feeDistributorReferralRewardsSentKey(token), totalTokensSent);
    }

    function calculateAndBridgeGmx(
        uint256[] memory chainIds,
        uint256 totalFeeAmountGmx,
        uint256[] memory stakedAmountsGmx,
        uint256 totalStakedGmx,
        uint256[] memory feeAmountsGmx,
        uint256 currentChainIndex
    ) internal returns (uint256) {
        uint256 chainIdsLength = chainIds.length;
        uint256[] memory bridgingAmounts = createUintArray(chainIdsLength);
        uint256 targetGmxAmountCurrentChain = Precision.mulDiv(
            totalFeeAmountGmx,
            stakedAmountsGmx[currentChainIndex],
            totalStakedGmx
        );
        uint256 currentChainSurplus = feeAmountsGmx[currentChainIndex] - targetGmxAmountCurrentChain;
        for (uint256 i; i < chainIdsLength; i++) {
            if (i == currentChainIndex) continue;

            uint256 targetGmxAmount = Precision.mulDiv(totalFeeAmountGmx, stakedAmountsGmx[i], totalStakedGmx);

            // If the other chain has a deficit (feeAmountsGmx[i] < targetAmount), bridge GMX to it
            if (feeAmountsGmx[i] < targetGmxAmount) {
                uint256 deficit = targetGmxAmount - feeAmountsGmx[i];
                uint256 bridgeAmount = currentChainSurplus > deficit ? deficit : currentChainSurplus;

                bridgingAmounts[i] = bridgeAmount;
                currentChainSurplus -= bridgeAmount;

                if (currentChainSurplus == 0) break;
            }
        }

        return bridgeGmx(chainIds, bridgingAmounts);
    }

    function bridgeGmx(uint256[] memory chainIds, uint256[] memory bridgingAmounts) internal returns (uint256) {
        // Execute bridging transactions from current chain
        address layerzeroOft = getAddress(block.chainid, LAYERZERO_OFT);
        uint256 sharedDecimals = IOFT(layerzeroOft).sharedDecimals();
        uint256 decimalConversionRate = 10 ** (18 - sharedDecimals);
        uint256 totalGmxBridgedOut;
        for (uint256 i; i < chainIds.length; i++) {
            uint256 bridgingAmount = bridgingAmounts[i];
            if (bridgingAmount == 0) continue;

            uint256 sendAmount = removeDust(bridgingAmount, decimalConversionRate);

            // Move GMX needed for bridging to this contract from FeeDistributorVault
            transferOut(gmx, address(this), sendAmount);

            // If the Layerzero OFT contract on this chain is not also the GMX token, approve the sendAmount
            if (layerzeroOft != gmx) {
                IERC20(gmx).approve(layerzeroOft, sendAmount);
            }

            // Prepare remaining params needed for the bridging transaction
            uint256 chainId = chainIds[i];
            uint32 layerzeroChainId = uint32(getUint(Keys.feeDistributorLayerZeroChainIdKey(chainId)));
            bytes32 to = Cast.toBytes32(getAddress(chainId, Keys.FEE_RECEIVER));
            uint256 minAmountOut = removeDust(
                Precision.applyFactor(sendAmount, getUint(Keys.feeDistributorBridgeSlippageFactorKey(chainId))),
                decimalConversionRate
            );
            SendParam memory sendParam = SendParam(
                layerzeroChainId,
                to,
                sendAmount,
                minAmountOut,
                EMPTY_BYTES,
                EMPTY_BYTES,
                EMPTY_BYTES
            );
            MessagingFee memory messagingFee = IOFT(layerzeroOft).quoteSend(sendParam, false);

            // Make the bridge call to the OFT contract
            IOFT(layerzeroOft).send{ value: messagingFee.nativeFee }(
                sendParam,
                messagingFee,
                address(feeDistributorVault)
            );

            // Add to the total bridged out
            totalGmxBridgedOut += sendAmount;
        }

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(1);
        eventData = setUintItem(eventData, 0, "totalGmxBridgedOut", totalGmxBridgedOut);
        emitEventLog("FeeDistributionGmxBridgedOut", eventData);

        return totalGmxBridgedOut;
    }

    function transferFeesAndCosts(
        uint256 wntForKeepers,
        uint256 wntForChainlink,
        uint256 wntForTreasury,
        uint256 wntForGlp
    ) internal {
        // transfer the WNT that needs to be sent to each keeper
        address[] memory keepers = getAddressArray(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        uint256[] memory keepersTargetBalance = getUintArray(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        uint256 wntToKeepers;
        for (uint256 i; i < keepers.length; i++) {
            address keeper = keepers[i];
            uint256 keeperBalance = keeper.balance;
            uint256 keeperTargetBalance = keepersTargetBalance[i];
            if (keeperBalance < keeperTargetBalance) {
                uint256 wntToKeeper = keeperTargetBalance - keeperBalance;
                feeDistributorVault.transferOutNativeToken(keeper, wntToKeeper);
                wntToKeepers += wntToKeeper;
            }
        }
        if (wntForKeepers != wntToKeepers) {
            revert Errors.KeeperAmountMismatch(wntForKeepers, wntToKeepers);
        }

        // transfer the WNT for chainlink costs and WNT to the treasury
        transferOut(wnt, getAddress(block.chainid, CHAINLINK), wntForChainlink);
        transferOut(wnt, getAddress(block.chainid, TREASURY), wntForTreasury);

        // update the reward distribution details and transfer the WNT and GMX fees for GLP and GMX
        updateRewardDistribution(wnt, getAddress(block.chainid, FEE_GLP_TRACKER), wntForGlp);
        updateRewardDistribution(
            gmx,
            getAddress(block.chainid, EXTENDED_GMX_TRACKER),
            getUint(Keys.feeDistributorFeeAmountGmxKey(block.chainid))
        );
    }

    function updateRewardDistribution(address rewardToken, address tracker, uint256 rewardAmount) internal {
        // transfer the calculated fees for the week and update the last distribution time and tokens per interval
        transferOut(rewardToken, tracker, rewardAmount);
        address distributor = IRewardTracker(tracker).distributor();
        IRewardDistributor(distributor).updateLastDistributionTime();
        IRewardDistributor(distributor).setTokensPerInterval(rewardAmount / 1 weeks);
    }

    function setUint(bytes32 fullKey, uint256 value) internal {
        dataStore.setUint(fullKey, value);
    }

    function setDistributionState(uint256 value) internal {
        setUint(Keys.FEE_DISTRIBUTOR_STATE, value);
    }

    function transferOut(address token, address receiver, uint256 amount) internal {
        feeDistributorVault.transferOut(token, receiver, amount);
    }

    function emitEventLog(string memory eventName, EventUtils.EventLogData memory eventData) internal {
        eventEmitter.emitEventLog(eventName, eventData);
    }

    function setTokenPrices() internal withOraclePrices(retrieveSetPricesParams()) {
        setUint(Keys.FEE_DISTRIBUTOR_GMX_PRICE, oracle.getPrimaryPrice(gmx).max);
        setUint(Keys.FEE_DISTRIBUTOR_WNT_PRICE, oracle.getPrimaryPrice(wnt).max);
    }

    function retrieveSetPricesParams() internal view returns (OracleUtils.SetPricesParams memory) {
        address[] memory tokens = createAddressArray(2);
        tokens[0] = gmx;
        tokens[1] = wnt;
        address[] memory providers = createAddressArray(2);
        providers[0] = getAddress(Keys.oracleProviderForTokenKey(gmx));
        providers[1] = getAddress(Keys.oracleProviderForTokenKey(wnt));
        bytes[] memory data = new bytes[](2);
        return (OracleUtils.SetPricesParams(tokens, providers, data));
    }

    function calculateWntFeesAndCosts(
        uint256 wntReferralRewardsInUsd,
        uint256 feesV1Usd,
        uint256 feesV2Usd
    ) internal view returns (uint256, uint256, uint256, uint256, uint256) {
        // the WNT fee amount related calculations
        uint256 totalWntBalance = getFeeDistributorVaultBalance(wnt);

        // calculate the WNT that needs to be sent to each keeper
        (uint256 keeperCostsTreasury, uint256 keeperCostsGlp) = calculateKeeperCosts();
        uint256 wntForKeepers = keeperCostsTreasury + keeperCostsGlp;

        // calculate the WNT for chainlink costs and amount of WNT to be sent to the treasury
        (uint256 wntForChainlink, uint256 wntForTreasury) = calculateChainlinkAndTreasuryAmounts(
            totalWntBalance,
            feesV1Usd,
            feesV2Usd,
            keeperCostsTreasury
        );

        // calculate the total WNT referral rewards to be sent and validate the calculated amount
        uint256 wntForReferralRewards = calculateWntForReferralRewards(
            wntReferralRewardsInUsd,
            feesV1Usd,
            totalWntBalance
        );

        // calculate the amount of WNT to be used as GLP fees, validate the calculated amount and adjust if necessary
        uint256 wntForGlp = totalWntBalance -
            keeperCostsGlp -
            keeperCostsTreasury -
            wntForChainlink -
            wntForTreasury -
            wntForReferralRewards;

        (wntForTreasury, wntForGlp) = finalizeWntForTreasuryAndGlp(
            totalWntBalance,
            wntForChainlink,
            wntForTreasury,
            keeperCostsTreasury,
            wntForGlp
        );

        return (wntForKeepers, wntForChainlink, wntForTreasury, wntForReferralRewards, wntForGlp);
    }

    function calculateKeeperCosts() internal view returns (uint256, uint256) {
        address[] memory keepers = getAddressArray(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        uint256[] memory keepersTargetBalance = getUintArray(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        bool[] memory keepersV2 = dataStore.getBoolArray(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        if (keepers.length != keepersTargetBalance.length || keepers.length != keepersV2.length) {
            revert Errors.KeeperArrayLengthMismatch(keepers.length, keepersTargetBalance.length, keepersV2.length);
        }

        uint256 keeperCostsTreasury;
        uint256 keeperCostsGlp;
        uint256 keeperGlpFactor = getUint(Keys.FEE_DISTRIBUTOR_KEEPER_GLP_FACTOR);
        for (uint256 i; i < keepers.length; i++) {
            uint256 keeperTargetBalance = keepersTargetBalance[i];
            uint256 keeperBalance = keepers[i].balance;
            if (keeperTargetBalance > keeperBalance) {
                uint256 keeperCost = keeperTargetBalance - keeperBalance;
                if (keepersV2[i]) {
                    keeperCostsTreasury += keeperCost;
                } else {
                    uint256 keeperCostGlp = Precision.applyFactor(keeperCost, keeperGlpFactor);
                    keeperCostsGlp += keeperCostGlp;
                    keeperCostsTreasury += (keeperCost - keeperCostGlp);
                }
            }
        }

        return (keeperCostsTreasury, keeperCostsGlp);
    }

    function calculateChainlinkAndTreasuryAmounts(
        uint256 totalWntBalance,
        uint256 feesV1Usd,
        uint256 feesV2Usd,
        uint256 keeperCostsTreasury
    ) internal view returns (uint256, uint256) {
        uint256 chainlinkTreasuryWntAmount = Precision.mulDiv(totalWntBalance, feesV2Usd, feesV1Usd + feesV2Usd);
        uint256 wntForChainlink = Precision.applyFactor(
            chainlinkTreasuryWntAmount,
            getUint(Keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR)
        );
        uint256 wntForTreasury = chainlinkTreasuryWntAmount - wntForChainlink - keeperCostsTreasury;

        return (wntForChainlink, wntForTreasury);
    }

    function calculateWntForReferralRewards(
        uint256 wntReferralRewardsInUsd,
        uint256 feesV1Usd,
        uint256 totalWntBalance
    ) internal view returns (uint256) {
        uint256 wntReferralRewardsInUsdLimit = getUint(Keys.FEE_DISTRIBUTOR_REFERRAL_REWARDS_WNT_USD_LIMIT);
        if (wntReferralRewardsInUsd > wntReferralRewardsInUsdLimit) {
            revert Errors.WntReferralRewardsInUsdLimitExceeded(wntReferralRewardsInUsd, wntReferralRewardsInUsdLimit);
        }

        uint256 wntForReferralRewardsThreshold = getUint(Keys.feeDistributorAmountThresholdKey(REFERRAL_REWARDS_WNT));
        uint256 maxWntReferralRewardsInUsd = Precision.applyFactor(feesV1Usd, wntForReferralRewardsThreshold);
        if (wntReferralRewardsInUsd > maxWntReferralRewardsInUsd) {
            revert Errors.WntReferralRewardsInUsdThresholdBreached(wntReferralRewardsInUsd, maxWntReferralRewardsInUsd);
        }
        uint256 scaledWntPrice = getUint(Keys.FEE_DISTRIBUTOR_WNT_PRICE) * Precision.FLOAT_PRECISION;
        uint256 wntForReferralRewards = Precision.toFactor(wntReferralRewardsInUsd, scaledWntPrice);
        uint256 maxWntReferralRewards = Precision.applyFactor(totalWntBalance, wntForReferralRewardsThreshold);
        if (wntForReferralRewards > maxWntReferralRewards) {
            revert Errors.ReferralRewardsThresholdBreached(wnt, wntForReferralRewards, maxWntReferralRewards);
        }

        return wntForReferralRewards;
    }

    function finalizeWntForTreasuryAndGlp(
        uint256 totalWntBalance,
        uint256 wntForChainlink,
        uint256 wntForTreasury,
        uint256 keeperCostsTreasury,
        uint256 wntForGlp
    ) internal view returns (uint256, uint256) {
        uint256 expectedWntForGlp = totalWntBalance - wntForChainlink - wntForTreasury + keeperCostsTreasury;
        uint256 glpFeeThreshold = getUint(Keys.feeDistributorAmountThresholdKey(GLP));
        uint256 minWntForGlp = Precision.applyFactor(expectedWntForGlp, glpFeeThreshold);
        if (wntForGlp < minWntForGlp) {
            uint256 treasuryFeeThreshold = getUint(Keys.feeDistributorAmountThresholdKey(TREASURY));
            uint256 minTreasuryWntAmount = Precision.applyFactor(wntForTreasury, treasuryFeeThreshold);
            uint256 wntGlpShortfall = minWntForGlp - wntForGlp;
            uint256 maxTreasuryWntShortfall = wntForTreasury - minTreasuryWntAmount;
            if (wntGlpShortfall > maxTreasuryWntShortfall) {
                revert Errors.TreasuryFeeThresholdBreached(wntForTreasury, wntGlpShortfall, maxTreasuryWntShortfall);
            }

            wntForTreasury -= wntGlpShortfall;
            wntForGlp += wntGlpShortfall;
        }

        return (wntForTreasury, wntForGlp);
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

    function getFeeDistributorVaultBalance(address token) internal view returns (uint256) {
        return IERC20(token).balanceOf(address(feeDistributorVault));
    }

    function getUintArray(bytes32 key) internal view returns (uint256[] memory) {
        return dataStore.getUintArray(key);
    }

    function getAddressArray(bytes32 key) internal view returns (address[] memory) {
        return dataStore.getAddressArray(key);
    }

    function validateReadResponseTimestamp(uint256 readResponseTimestamp) internal view {
        if (block.timestamp - readResponseTimestamp > getUint(Keys.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY)) {
            revert Errors.OutdatedReadResponse(readResponseTimestamp);
        }
    }

    function validateDistributionState(DistributionState allowedDistributionState) internal view {
        uint256 distributionStateUint = getUint(Keys.FEE_DISTRIBUTOR_STATE);
        if (allowedDistributionState != DistributionState(distributionStateUint)) {
            revert Errors.InvalidDistributionState(distributionStateUint);
        }
    }

    function validateDistributionNotCompleted() internal view {
        uint256 dayOfWeek = ((block.timestamp / 1 days) + 4) % 7;
        uint256 daysSinceDistributionDay = (dayOfWeek + 7 - getUint(Keys.FEE_DISTRIBUTOR_DISTRIBUTION_DAY)) % 7;
        uint256 midnightToday = block.timestamp - (block.timestamp % 1 days);
        uint256 startOfDistributionWeek = midnightToday - (daysSinceDistributionDay * 1 days);
        uint256 lastDistributionTime = getUint(Keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP);
        if (lastDistributionTime > startOfDistributionWeek) {
            revert Errors.FeeDistributionAlreadyCompleted(lastDistributionTime, startOfDistributionWeek);
        }
    }

    function setUintItem(
        EventUtils.EventLogData memory eventData,
        uint256 itemNumber,
        string memory itemName,
        uint256 uintItem
    ) internal pure returns (EventUtils.EventLogData memory) {
        eventData.uintItems.setItem(itemNumber, itemName, uintItem);
        return eventData;
    }

    function setReadRequestInput(
        uint32 chainId,
        address target,
        bytes memory callData
    ) internal pure returns (MultichainReaderUtils.ReadRequestInputs memory) {
        return MultichainReaderUtils.ReadRequestInputs(chainId, target, callData);
    }

    function createUintArray(uint256 arrayLength) internal pure returns (uint256[] memory) {
        return new uint256[](arrayLength);
    }

    function createAddressArray(uint256 arrayLength) internal pure returns (address[] memory) {
        return new address[](arrayLength);
    }

    function decodeReadData(
        bytes calldata readData,
        uint256 targetChainIndex
    ) internal pure returns (uint256, uint256) {
        uint256 offset = targetChainIndex * 96;
        (uint256 feeAmountGmx1, uint256 feeAmountGmx2, uint256 stakedGmx) = abi.decode(
            readData[offset:(offset + 96)],
            (uint256, uint256, uint256)
        );
        uint256 feeAmount = feeAmountGmx1 + feeAmountGmx2;
        return (feeAmount, stakedGmx);
    }

    function removeDust(uint256 amount, uint256 decimalConversionRate) internal pure returns (uint256) {
        return (amount / decimalConversionRate) * decimalConversionRate;
    }
}
