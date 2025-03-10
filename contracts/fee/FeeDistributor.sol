// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./FeeDistributorVault.sol";
import "./FeeHandler.sol";
import "../external/MultichainReader.sol";
import "../v1/IRewardTrackerV1.sol";
import "../v1/IRewardDistributorV1.sol";
import "../v1/IVesterV1.sol";
import "../v1/IMintable.sol";

contract FeeDistributor is ReentrancyGuard, RoleModule, OracleModule {
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.BytesItems;

    enum DistributionState {
        None,
        Initiated,
        ReadDataReceived,
        DistributePending
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
    bytes32 public constant esGmxVesterKey = keccak256(abi.encode("ESGMX_VESTER"));

    FeeDistributorVault public immutable feeDistributorVault;
    FeeHandler public immutable feeHandler;
    DataStore public immutable dataStore;
    EventEmitter public immutable eventEmitter;
    MultichainReader public immutable multichainReader;
    IVaultV1 public immutable vaultV1;

    address public immutable gmx;
    address public immutable esGmx;
    address public immutable wnt;

    constructor(
        RoleStore _roleStore,
        Oracle _oracle,
        FeeDistributorVault _feeDistributorVault,
        FeeHandler _feeHandler,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        MultichainReader _multichainReader,
        IVaultV1 _vaultV1,
        address _gmx,
        address _esGmx,
        address _wnt
    ) RoleModule(_roleStore) OracleModule(_oracle) {
        feeDistributorVault = _feeDistributorVault;
        feeHandler = _feeHandler;
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        multichainReader = _multichainReader;
        vaultV1 = _vaultV1;
        gmx = _gmx;
        esGmx = _esGmx;
        wnt = _wnt;
    }

    // @dev initiate the weekly fee distribution process
    function initiateDistribute() external nonReentrant onlyFeeDistributionKeeper {
        // validate distribution state and that distribution is not yet completed for the current week
        validateDistributionState(DistributionState.None);
        validateDistributionNotCompleted();

        // reset referral rewards sent for WNT and esGMX to 0 for the current week's distribution
        setUint(Keys.feeDistributorReferralRewardsSentKey(wnt), 0);
        setUint(Keys.feeDistributorReferralRewardsSentKey(esGmx), 0);

        // populate readRequestInputs and extraOptionsInputs param used for cross chain LZRead request
        uint256[] memory chainIds = getUintArray(Keys.FEE_DISTRIBUTOR_CHAIN_ID);
        MultichainReaderUtils.ReadRequestInputs[]
            memory readRequestInputs = new MultichainReaderUtils.ReadRequestInputs[]((chainIds.length - 1) * 3);
        bool skippedCurrentChain;
        for (uint256 i; i < chainIds.length; i++) {
            uint256 chainId = chainIds[i];
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

            address gmxOnChainId = getAddress(chainId, gmxKey);
            uint32 layerZeroChainId = uint32(getUint(Keys.feeDistributorLayerZeroChainIdKey(chainId)));
            uint256 readRequestIndex = skippedCurrentChain ? (i - 1) * 3 : i * 3;
            readRequestInputs[readRequestIndex] = setReadRequestInput(
                layerZeroChainId,
                getAddress(chainId, dataStoreKey),
                abi.encodeWithSelector(DataStore.getUint.selector, Keys.withdrawableBuybackTokenAmountKey(gmxOnChainId))
            );
            readRequestIndex++;

            readRequestInputs[readRequestIndex] = setReadRequestInput(
                layerZeroChainId,
                gmxOnChainId,
                abi.encodeWithSelector(IERC20.balanceOf.selector, getAddress(chainId, Keys.FEE_RECEIVER))
            );
            readRequestIndex++;

            readRequestInputs[readRequestIndex] = setReadRequestInput(
                layerZeroChainId,
                extendedGmxTracker,
                abi.encodeWithSelector(IERC20.totalSupply.selector)
            );
        }

        MultichainReaderUtils.ExtraOptionsInputs memory extraOptionsInputs;
        extraOptionsInputs.gasLimit = uint128(getUint(Keys.FEE_DISTRIBUTOR_GAS_LIMIT));
        extraOptionsInputs.returnDataSize = ((uint32(chainIds.length) - 1) * 96) + 8;

        // calculate native token fee required and execute multichainReader.sendReadRequests LZRead request
        MessagingFee memory messagingFee = multichainReader.quoteReadFee(readRequestInputs, extraOptionsInputs);
        multichainReader.sendReadRequests{ value: messagingFee.nativeFee }(readRequestInputs, extraOptionsInputs);

        setUint(Keys.FEE_DISTRIBUTION_STATE, uint256(DistributionState.Initiated));

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(2);
        eventData = setUintItem(eventData, 0, "numberOfChainsReadRequests", chainIds.length - 1);
        eventData = setUintItem(eventData, 1, "messagingFee.nativeFee", messagingFee.nativeFee);
        emitEventLog("FeeDistributionInitiated", eventData);
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

        address[] memory tokens = createAddressArray(1);
        tokens[0] = gmx;
        address[] memory providers = createAddressArray(1);
        providers[0] = getAddress(Keys.oracleProviderForTokenKey(gmx));
        bytes[] memory data = new bytes[](1);
        data[0] = "";
        uint256 gmxPrice = retrieveGmxPrice(OracleUtils.SetPricesParams(tokens, providers, data));
        uint256 wntPrice = vaultV1.getMaxPrice(wnt);
        setUint(Keys.FEE_DISTRIBUTION_GMX_PRICE, gmxPrice);
        setUint(Keys.FEE_DISTRIBUTION_WNT_PRICE, wntPrice);
        setUint(Keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP, receivedData.timestamp);
        setUint(Keys.FEE_DISTRIBUTION_STATE, uint256(DistributionState.ReadDataReceived));

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(4);
        eventData = setUintItem(eventData, 0, "numberOfChainsReceivedData", chainIds.length - 1);
        eventData = setUintItem(eventData, 1, "receivedData.timestamp", receivedData.timestamp);
        eventData = setUintItem(eventData, 2, "gmxPrice", gmxPrice);
        eventData = setUintItem(eventData, 3, "wntPrice", wntPrice);
        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "receivedData.ReadData", receivedData.readData);
        emitEventLog("FeeDistributionDataReceived", eventData);
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
        validateDistributionState();
        validateReadResponseTimestamp(getUint(Keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP));
        validateDistributionNotCompleted();

        //withdraw any WNT and GMX fees remaining in the feeHandler
        feeHandler.withdrawFees(wnt);
        feeHandler.withdrawFees(gmx);

        // calculate the WNT GLP fees and other costs
        (
            uint256 wntForChainlink,
            uint256 wntForTreasury,
            uint256 wntForReferralRewards,
            uint256 wntForGlp
        ) = calculateWntFeesAndCosts(wntReferralRewardsInUsd, feesV1Usd, feesV2Usd);

        // determine if GMX fees need to be bridged and execute GMX bridge transactions
        (uint256 feeAmountGmxCurrentChain, uint256 totalFeeAmountGmx) = handleGmxFeeBridging();

        // transfer calculated fees and costs to the appropriate addresses
        uint256 wntForKeepers = transferFeesAndCosts(
            wntForChainlink,
            wntForTreasury,
            wntForGlp,
            feeAmountGmxCurrentChain
        );

        // set the total fees in USD and referral reward amounts
        setUint(Keys.feeDistributorFeeAmountUsdKey(1), feesV1Usd);
        setUint(Keys.feeDistributorFeeAmountUsdKey(2), feesV2Usd);
        setUint(Keys.feeDistributorReferralRewardsAmountKey(wnt), wntForReferralRewards);
        setUint(Keys.feeDistributorReferralRewardsAmountKey(esGmx), esGmxForReferralRewards);
        setUint(Keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, block.timestamp);
        setUint(Keys.FEE_DISTRIBUTION_STATE, uint256(DistributionState.None));

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(10);
        eventData = setUintItem(eventData, 0, "feesV1Usd", feesV1Usd);
        eventData = setUintItem(eventData, 1, "feesV2Usd", feesV2Usd);
        eventData = setUintItem(eventData, 2, "feeAmountGmxCurrentChain", feeAmountGmxCurrentChain);
        eventData = setUintItem(eventData, 3, "totalFeeAmountGmx", totalFeeAmountGmx);
        eventData = setUintItem(eventData, 4, "wntForKeepers", wntForKeepers);
        eventData = setUintItem(eventData, 5, "wntForChainlink", wntForChainlink);
        eventData = setUintItem(eventData, 6, "wntForTreasury", wntForTreasury);
        eventData = setUintItem(eventData, 7, "wntForGlp", wntForGlp);
        eventData = setUintItem(eventData, 8, "wntForReferralRewards", wntForReferralRewards);
        eventData = setUintItem(eventData, 9, "esGmxForReferralRewards", esGmxForReferralRewards);
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
            uint256 maxEsGmxReferralRewards = getUint(Keys.feeDistributorAmountThresholdKey(referralRewardsEsGmxKey));
            if (esGmxForReferralRewards > maxEsGmxReferralRewards) {
                revert Errors.ReferralRewardsThresholdBreached(esGmx, esGmxForReferralRewards, maxEsGmxReferralRewards);
            }

            uint256 vaultEsGmxBalance = IERC20(esGmx).balanceOf(address(feeDistributorVault));
            if (esGmxForReferralRewards > vaultEsGmxBalance) {
                IMintable(esGmx).mint(address(feeDistributorVault), esGmxForReferralRewards - vaultEsGmxBalance);
            }

            // send the esGMX referral rewards to the specified accounts and update bonus reward amounts
            for (uint256 i; i < accounts.length; i++) {
                address account = accounts[i];
                uint256 esGmxAmount = amounts[i];
                transferOut(token, account, esGmxAmount);
                totalTokensSent = totalTokensSent + esGmxAmount;

                address vester = getAddress(block.chainid, esGmxVesterKey);
                uint256 bonusReward = IVester(vester).bonusRewards(account);
                uint256 updatedBonusReward = bonusReward + esGmxAmount;
                IVester(vester).setBonusRewards(account, updatedBonusReward);

                EventUtils.EventLogData memory eventData;
                eventData.uintItems.initItems(1);
                eventData = setUintItem(eventData, 0, "esGmxAmount", esGmxAmount);
                emitEventLog("EsGmxReferralRewardsSent", eventData);
            }
        } else if (token == wnt) {
            // send the WNT referral rewards to the specified accounts
            for (uint256 i; i < accounts.length; i++) {
                address account = accounts[i];
                uint256 wntAmount = amounts[i];
                transferOut(token, account, wntAmount);
                totalTokensSent = totalTokensSent + wntAmount;

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

    function retrieveGmxPrice(
        OracleUtils.SetPricesParams memory params
    ) internal withOraclePrices(params) returns (uint256) {
        return oracle.getPrimaryPrice(gmx).max;
    }

    function handleGmxFeeBridging() internal returns (uint256, uint256) {
        // 1. Read distribution state from storage
        DistributionState distributionState = DistributionState(getUint(Keys.FEE_DISTRIBUTION_STATE));

        // 2. Load current chain’s original GMX fee amount from storage
        uint256 originalFeeAmountCurrentChain = getUint(Keys.feeDistributorFeeAmountGmxKey(block.chainid));
        uint256 feeAmountGmxCurrentChain = originalFeeAmountCurrentChain;

        // If distribution is pending, we update the GMX fee amount to the vault’s current GMX balance
        if (distributionState == DistributionState.DistributePending) {
            feeAmountGmxCurrentChain = IERC20(gmx).balanceOf(address(feeDistributorVault));
            setUint(Keys.feeDistributorFeeAmountGmxKey(block.chainid), feeAmountGmxCurrentChain);
        }

        // 3. Get the list of chain IDs to consider
        uint256[] memory chainIds = getUintArray(Keys.FEE_DISTRIBUTOR_CHAIN_ID);

        // Prepare parallel arrays to track each chain’s feeAmounts and stakedAmounts
        uint256[] memory feeAmounts = createUintArray(chainIds.length);
        uint256[] memory stakedAmounts = createUintArray(chainIds.length);

        // 4. Sum up all chain fees and staked amounts; override the current chain’s fee with the new value
        uint256 currentChainIndex;
        uint256 totalFeeAmountGmx;
        uint256 totalStakedGmx;
        for (uint256 i; i < chainIds.length; i++) {
            if (chainIds[i] == block.chainid) {
                feeAmounts[i] = feeAmountGmxCurrentChain;
                currentChainIndex = i;
            } else {
                feeAmounts[i] = getUint(Keys.feeDistributorFeeAmountGmxKey(chainIds[i]));
            }

            stakedAmounts[i] = getUint(Keys.feeDistributorStakedGmxKey(chainIds[i]));

            totalFeeAmountGmx += feeAmounts[i];
            totalStakedGmx += stakedAmounts[i];
        }

        // 5. Compute how much GMX the current chain is supposed to have, based on its stake share
        uint256 requiredFeeAmount = (totalFeeAmountGmx * stakedAmounts[currentChainIndex]) / totalStakedGmx;

        // Calculate the difference between required and original
        int256 pendingFeeBridge = int256(requiredFeeAmount) - int256(originalFeeAmountCurrentChain);

        // 6. Slippage logic
        uint256 minFeeReceived;
        uint256 slippageFactor = getUint(Keys.feeDistributorBridgeSlippageFactorKey(currentChainIndex));
        if (pendingFeeBridge > 0) {
            minFeeReceived =
                Precision.applyFactor(uint256(pendingFeeBridge), slippageFactor) -
                getUint(Keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_AMOUNT);
        }
        uint256 minRequiredFeeAmount = originalFeeAmountCurrentChain + minFeeReceived;

        // 7. If we don’t meet the min bridging requirement, revert or set distribution pending
        if (minRequiredFeeAmount > feeAmountGmxCurrentChain) {
            if (distributionState == DistributionState.DistributePending) {
                revert Errors.BridgedAmountNotSufficient(minRequiredFeeAmount, feeAmountGmxCurrentChain);
            }
            setUint(Keys.FEE_DISTRIBUTION_STATE, uint256(DistributionState.DistributePending));
            return (feeAmountGmxCurrentChain, totalFeeAmountGmx);
        }

        // 8. Attempt to bridge GMX to other chains if DistributionState = ReadDataReceived
        if (distributionState == DistributionState.ReadDataReceived) {
            // Call our internal bridging function
            uint256 totalGmxBridgedOut = calculateAndBridgeGmx(
                chainIds,
                totalFeeAmountGmx,
                stakedAmounts,
                totalStakedGmx,
                feeAmounts,
                currentChainIndex,
                slippageFactor
            );

            // validate that the amount bridged does not exceed the calculated amount to be sent
            if (minRequiredFeeAmount > feeAmountGmxCurrentChain - totalGmxBridgedOut) {
                revert Errors.AttemptedBridgeAmountTooHigh(
                    minRequiredFeeAmount,
                    feeAmountGmxCurrentChain,
                    totalGmxBridgedOut
                );
            }
        }

        return (feeAmountGmxCurrentChain, totalFeeAmountGmx);
    }

    // This internal function handles the surplus-deficit bridging logic
    function calculateAndBridgeGmx(
        uint256[] memory chainIds,
        uint256 totalFeeAmountGmx,
        uint256[] memory stakedAmounts,
        uint256 totalStakedGmx,
        uint256[] memory feeAmounts,
        uint256 currentChainIndex,
        uint256 slippageFactor
    ) internal returns (uint256) {
        // Prepare arrays
        uint256[] memory targetFeeAmounts = createUintArray(chainIds.length);
        int256[] memory differences = new int256[](chainIds.length);
        uint256[][] memory bridging = new uint256[][](chainIds.length);

        // 1. Compute each chain’s “ideal” fee amount = totalFee * chain_stake / totalStaked
        for (uint256 i; i < chainIds.length; i++) {
            targetFeeAmounts[i] = (totalFeeAmountGmx * stakedAmounts[i]) / totalStakedGmx;
        }

        // 2. Determine surplus/deficit on each chain
        for (uint256 i; i < chainIds.length; i++) {
            differences[i] = int256(feeAmounts[i]) - int256(targetFeeAmounts[i]);
            // Initialize bridging array for each chain
            bridging[i] = createUintArray(chainIds.length);
        }

        // 3. Match surpluses to deficits
        uint256 deficitIndex;
        for (uint256 surplusIndex; surplusIndex < chainIds.length; surplusIndex++) {
            if (differences[surplusIndex] <= 0) continue;

            while (differences[surplusIndex] > 0 && deficitIndex < chainIds.length) {
                // Move deficitIndex to a chain that actually needs GMX
                while (deficitIndex < chainIds.length && differences[deficitIndex] >= 0) {
                    deficitIndex++;
                }
                if (deficitIndex == chainIds.length) break;

                // The amount needed by the deficit chain
                uint256 needed = uint256(-differences[deficitIndex]);
                // The surplus available on the surplus chain
                uint256 surplus = uint256(differences[surplusIndex]);

                if (needed > surplus) {
                    // Surplus doesn't fully fix the deficit
                    bridging[surplusIndex][deficitIndex] += surplus;
                    differences[deficitIndex] += int256(surplus);
                    differences[surplusIndex] = 0;
                } else {
                    // Surplus fully (or exactly) covers the needed
                    bridging[surplusIndex][deficitIndex] += needed;
                    differences[surplusIndex] -= int256(needed);
                    differences[deficitIndex] = 0;
                    // Move on to the next deficit
                    deficitIndex++;
                }
            }
        }

        uint256 totalGmxBridgedOut = bridgeGmx(chainIds, bridging[currentChainIndex], slippageFactor);

        return totalGmxBridgedOut;
    }

    function bridgeGmx(
        uint256[] memory chainIds,
        uint256[] memory bridging,
        uint256 slippageFactor
    ) internal returns (uint256) {
        // 4. Execute bridging transactions only for bridging from current chain
        address synapseRouter = getAddress(block.chainid, synapseRouterKey);
        uint256 originDeadline = block.timestamp + getUint(Keys.feeDistributorBridgeOriginDeadlineKey(block.chainid));
        uint256 totalGmxBridgedOut;
        for (uint256 i; i < chainIds.length; i++) {
            uint256 sendAmount = bridging[i];
            if (sendAmount == 0) continue;

            // Move GMX to this contract, then approve router
            transferOut(gmx, address(this), sendAmount);
            IERC20(gmx).approve(synapseRouter, sendAmount);

            // Build bridging data
            address feeReceiver = getAddress(chainIds[i], Keys.FEE_RECEIVER);
            address gmxDestChain = getAddress(chainIds[i], gmxKey);
            uint256 minAmountOut = Precision.applyFactor(sendAmount, slippageFactor);
            uint256 destDeadline = block.timestamp + getUint(Keys.feeDistributorBridgeDestDeadlineKey(chainIds[i]));

            bytes memory callData = abi.encodeWithSignature(
                "bridge(address,uint256,address,uint256,(address,address,uint256,uint256,bytes),(address,address,uint256,uint256,bytes))",
                // (feeReceiver, chainId, token, amount) for the “Origin” call
                feeReceiver,
                chainIds[i],
                gmx,
                sendAmount,
                // extra bridging params on origin
                address(0),
                gmx,
                sendAmount,
                originDeadline,
                "",
                // bridging params on the destination
                address(0),
                gmxDestChain,
                minAmountOut,
                destDeadline,
                ""
            );

            // Make the call
            (bool success, bytes memory result) = synapseRouter.call(callData);
            if (!success) {
                revert Errors.BridgingTransactionFailed(result);
            }

            // Add to our total bridged out
            totalGmxBridgedOut += sendAmount;
        }

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(1);
        eventData = setUintItem(eventData, 0, "totalGmxBridgedOut", totalGmxBridgedOut);
        emitEventLog("GmxBridgedOut", eventData);

        return totalGmxBridgedOut;
    }

    function transferFeesAndCosts(
        uint256 wntForChainlink,
        uint256 wntForTreasury,
        uint256 wntForGlp,
        uint256 feeAmountGmxCurrentChain
    ) internal returns (uint256) {
        // transfer the WNT that needs to be sent to each keeper
        address[] memory keepers = dataStore.getAddressArray(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        uint256[] memory keepersTargetBalance = getUintArray(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        uint256 wntForKeepers;
        for (uint256 i; i < keepers.length; i++) {
            if (keepers[i].balance < keepersTargetBalance[i]) {
                feeDistributorVault.transferOutNativeToken(keepers[i], keepersTargetBalance[i] - keepers[i].balance);
                wntForKeepers = wntForKeepers + keepersTargetBalance[i] - keepers[i].balance;
            }
        }

        // transfer the WNT for chainlink costs and WNT to the treasury
        transferOut(wnt, getAddress(block.chainid, chainlinkKey), wntForChainlink);
        transferOut(wnt, getAddress(block.chainid, treasuryKey), wntForTreasury);

        // update the reward distribution details and transfer the WNT and GMX fees for GLP and GMX
        updateRewardDistribution(wnt, getAddress(block.chainid, feeGlpTrackerKey), wntForGlp);
        updateRewardDistribution(gmx, getAddress(block.chainid, extendedGmxTrackerKey), feeAmountGmxCurrentChain);

        return wntForKeepers;
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

    function transferOut(address token, address receiver, uint256 amount) internal {
        feeDistributorVault.transferOut(token, receiver, amount);
    }

    function emitEventLog(string memory eventName, EventUtils.EventLogData memory eventData) internal {
        eventEmitter.emitEventLog(eventName, eventData);
    }

    function calculateWntFeesAndCosts(
        uint256 wntReferralRewardsInUsd,
        uint256 feesV1Usd,
        uint256 feesV2Usd
    ) internal view returns (uint256, uint256, uint256, uint256) {
        // the WNT fee amount related calculations
        uint256 totalWntBalance = IERC20(wnt).balanceOf(address(feeDistributorVault));

        // calculate the WNT that needs to be sent to each keeper
        (uint256 keeperCostsTreasury, uint256 keeperCostsGlp) = calculateKeeperCosts();

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

        (wntForGlp, wntForTreasury) = finalizeWntForGlpAndTreasury(
            totalWntBalance,
            wntForChainlink,
            wntForTreasury,
            keeperCostsTreasury,
            wntForGlp
        );

        return (wntForChainlink, wntForTreasury, wntForReferralRewards, wntForGlp);
    }

    function calculateKeeperCosts() internal view returns (uint256, uint256) {
        address[] memory keepers = dataStore.getAddressArray(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
        uint256[] memory keepersTargetBalance = getUintArray(Keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
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

        uint256 wntForReferralRewardsThreshold = getUint(Keys.feeDistributorAmountThresholdKey(referralRewardsWntKey));
        uint256 maxWntReferralRewardsInUsd = Precision.applyFactor(feesV1Usd, wntForReferralRewardsThreshold);
        if (wntReferralRewardsInUsd > maxWntReferralRewardsInUsd) {
            revert Errors.WntReferralRewardsInUsdThresholdBreached(wntReferralRewardsInUsd, maxWntReferralRewardsInUsd);
        }

        uint256 wntForReferralRewards = Precision.toFactor(
            wntReferralRewardsInUsd,
            getUint(Keys.FEE_DISTRIBUTION_WNT_PRICE)
        );
        uint256 maxWntReferralRewards = Precision.applyFactor(totalWntBalance, wntForReferralRewardsThreshold);
        if (wntForReferralRewards > maxWntReferralRewards) {
            revert Errors.ReferralRewardsThresholdBreached(wnt, wntForReferralRewards, maxWntReferralRewards);
        }

        return wntForReferralRewards;
    }

    function finalizeWntForGlpAndTreasury(
        uint256 totalWntBalance,
        uint256 wntForChainlink,
        uint256 wntForTreasury,
        uint256 keeperCostsTreasury,
        uint256 wntForGlp
    ) internal view returns (uint256, uint256) {
        uint256 expectedWntForGlp = totalWntBalance - wntForChainlink - wntForTreasury + keeperCostsTreasury;
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

    function getUintArray(bytes32 key) internal view returns (uint256[] memory) {
        return dataStore.getUintArray(key);
    }

    function validateDistributionState(DistributionState allowedDistributionState) internal view {
        uint256 distributionStateUint = getUint(Keys.FEE_DISTRIBUTION_STATE);
        if (allowedDistributionState != DistributionState(distributionStateUint)) {
            revert Errors.InvalidDistributionState(distributionStateUint);
        }
    }

    function validateDistributionState() internal view {
        uint256 distributionStateUint = getUint(Keys.FEE_DISTRIBUTION_STATE);
        if (
            DistributionState(distributionStateUint) != DistributionState.ReadDataReceived ||
            DistributionState(distributionStateUint) != DistributionState.DistributePending
        ) {
            revert Errors.InvalidDistributionState(distributionStateUint);
        }
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

    function setUintItem(
        EventUtils.EventLogData memory eventData,
        uint256 itemNumber,
        string memory itemName,
        uint256 uintItem
    ) internal pure returns (EventUtils.EventLogData memory) {
        eventData.uintItems.setItem(itemNumber, itemName, uintItem);
        return eventData;
    }

    function createUintArray(uint256 arrayLength) internal pure returns (uint256[] memory) {
        uint256[] memory uintArray = new uint256[](arrayLength);
        return uintArray;
    }

    function createAddressArray(uint256 arrayLength) internal pure returns (address[] memory) {
        address[] memory addressArray = new address[](arrayLength);
        return addressArray;
    }

    function setReadRequestInput(
        uint32 chainId,
        address target,
        bytes memory callData
    ) internal pure returns (MultichainReaderUtils.ReadRequestInputs memory) {
        return MultichainReaderUtils.ReadRequestInputs(chainId, target, callData);
    }
}
