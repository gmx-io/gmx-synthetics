// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@layerzerolabs/oft-evm/contracts/OFTCore.sol";

import "../fee/FeeDistributorUtils.sol";
import "../fee/FeeDistributorVault.sol";
import "../fee/FeeHandler.sol";
import "../multichain/MultichainReader.sol";
import "../oracle/ChainlinkPriceFeedUtils.sol";
import "../claim/ClaimUtils.sol";
import "../v1/IRewardTrackerV1.sol";
import "../v1/IRewardDistributorV1.sol";
import "../v1/IVesterV1.sol";
import "../v1/IMintable.sol";

contract MockFeeDistributor is ReentrancyGuard, RoleModule {
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    // constant and immutable variables are internal to reduce the contract size
    bytes internal constant EMPTY_BYTES = "";

    bytes32 internal constant GMX = keccak256(abi.encode("GMX"));
    bytes32 internal constant EXTENDED_GMX_TRACKER = keccak256(abi.encode("EXTENDED_GMX_TRACKER"));
    bytes32 internal constant DATASTORE = keccak256(abi.encode("DATASTORE"));
    bytes32 internal constant TREASURY = keccak256(abi.encode("TREASURY"));
    bytes32 internal constant LAYERZERO_OFT = keccak256(abi.encode("LAYERZERO_OFT"));
    bytes32 internal constant CHAINLINK = keccak256(abi.encode("CHAINLINK"));
    bytes32 internal constant ESGMX_VESTER = keccak256(abi.encode("ESGMX_VESTER"));

    uint256 internal constant mockChainId = 40000;

    FeeDistributorVault internal immutable feeDistributorVault;
    FeeHandler internal immutable feeHandler;
    DataStore internal immutable dataStore;
    DataStore internal immutable dataStoreForOracle;
    EventEmitter internal immutable eventEmitter;
    MultichainReader internal immutable multichainReader;

    address internal immutable claimVault;
    address internal immutable gmx;
    address internal immutable gmxForOracle;
    address internal immutable esGmx;
    address internal immutable wnt;

    struct MockVariables {
        DataStore dataStoreForOracle;
        address gmxForOracle;
    }

    receive() external payable {}

    constructor(
        RoleStore _roleStore,
        FeeDistributorVault _feeDistributorVault,
        FeeHandler _feeHandler,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        MultichainReader _multichainReader,
        address _claimVault,
        address _gmx,
        address _esGmx,
        address _wnt,
        MockVariables memory _mockVariables
    ) RoleModule(_roleStore) {
        feeDistributorVault = _feeDistributorVault;
        feeHandler = _feeHandler;
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        multichainReader = _multichainReader;
        claimVault = _claimVault;
        gmx = _gmx;
        esGmx = _esGmx;
        wnt = _wnt;

        dataStoreForOracle = _mockVariables.dataStoreForOracle;
        gmxForOracle = _mockVariables.gmxForOracle;
    }

    // @dev withdraw the specified 'amount' of native token from this contract to 'receiver'
    // @param receiver the receiver of the native token
    // @param amount the amount of native token to withdraw
    function withdrawNativeToken(address receiver, uint256 amount) external onlyTimelockAdmin {
        FeeDistributorUtils.withdrawNativeToken(dataStore, receiver, amount);
    }

    // @dev withdraw the specified 'amount' of `token` from this contract to `receiver`
    // @param token the token to withdraw
    // @param amount the amount to withdraw
    // @param receiver the address to withdraw to
    function withdrawToken(address token, address receiver, uint256 amount) external onlyTimelockAdmin {
        FeeDistributorUtils.withdrawToken(dataStore, token, receiver, amount);
    }

    // @dev initiate the weekly fee distribution process
    //
    // The fee distribution process relies on the premise that this function is executed synchronously
    // across all chains to which it is deployed and is executed for the same fee distribution period
    //
    // In cases in which a chain encounters downtime or a keeper experiences issues, a contingency
    // should be in place to ensure the fee distribution is completed without issues
    function initiateDistribute() external nonReentrant onlyFeeDistributionKeeper {
        // validate that the FEE_RECEIVER address stored in dataStore = FeeDistributorVault
        address feeReceiver = _getAddress(Keys.FEE_RECEIVER);
        if (feeReceiver != address(feeDistributorVault)) {
            revert Errors.InvalidFeeReceiver(feeReceiver);
        }

        // validate distribution state and that distribution is not yet completed for the current week
        _validateDistributionState(DistributionState.None);
        _validateDistributionNotCompleted();

        // reset referral rewards deposited for WNT and esGMX to 0 for the current week's distribution
        _setUint(Keys2.feeDistributorReferralRewardsDepositedKey(wnt), 0);
        _setUint(Keys2.feeDistributorReferralRewardsDepositedKey(esGmx), 0);

        // populate readRequestInputs and extraOptionsInputs param used for cross chain LZRead request
        uint256[] memory chainIds = FeeDistributorUtils.retrieveChainIds(dataStore);
        uint256 chainIdsLength = chainIds.length;
        MultichainReaderUtils.ReadRequestInputs[]
            memory readRequestInputs = new MultichainReaderUtils.ReadRequestInputs[]((chainIdsLength - 1) * 3);
        uint256 targetChainIndex;
        for (uint256 i; i < chainIdsLength; i++) {
            uint256 chainId = chainIds[i];
            address extendedGmxTracker = _getAddressInfoForChain(chainId, EXTENDED_GMX_TRACKER);

            if (chainId == mockChainId) {
                uint256 feeAmountGmxCurrentChain = _getUint(Keys.withdrawableBuybackTokenAmountKey(gmx)) +
                    _getFeeDistributorVaultBalance(gmx);
                uint256 stakedGmx = IERC20(extendedGmxTracker).totalSupply();
                _setUint(Keys2.feeDistributorFeeAmountGmxKey(chainId), feeAmountGmxCurrentChain);
                _setUint(Keys2.feeDistributorStakedGmxKey(chainId), stakedGmx);
                continue;
            }

            address gmxTargetChain = _getAddressInfoForChain(chainId, GMX);
            uint32 layerZeroChainId = uint32(_getUint(Keys2.feeDistributorLayerZeroChainIdKey(chainId)));
            uint256 readRequestIndex = targetChainIndex * 3;
            readRequestInputs[readRequestIndex] = _setReadRequestInput(
                layerZeroChainId,
                _getAddressInfoForChain(chainId, DATASTORE),
                abi.encodeWithSelector(
                    DataStore.getUint.selector,
                    Keys.withdrawableBuybackTokenAmountKey(gmxTargetChain)
                )
            );
            readRequestIndex++;

            readRequestInputs[readRequestIndex] = _setReadRequestInput(
                layerZeroChainId,
                gmxTargetChain,
                abi.encodeWithSelector(IERC20.balanceOf.selector, _getAddressInfoForChain(chainId, Keys.FEE_RECEIVER))
            );
            readRequestIndex++;

            readRequestInputs[readRequestIndex] = _setReadRequestInput(
                layerZeroChainId,
                extendedGmxTracker,
                abi.encodeWithSelector(IERC20.totalSupply.selector)
            );
            targetChainIndex++;
        }

        MultichainReaderUtils.ExtraOptionsInputs memory extraOptionsInputs;
        extraOptionsInputs.gasLimit = uint128(_getUint(Keys2.FEE_DISTRIBUTOR_GAS_LIMIT));
        extraOptionsInputs.returnDataSize = ((uint32(chainIdsLength) - 1) * 96) + 8;

        _setDistributionState(uint256(DistributionState.Initiated));

        // calculate native token fee required and execute multichainReader.sendReadRequests LZRead request
        MessagingFee memory messagingFee = multichainReader.quoteReadFee(readRequestInputs, extraOptionsInputs);
        multichainReader.sendReadRequests{ value: messagingFee.nativeFee }(readRequestInputs, extraOptionsInputs);

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(2);
        _setUintItem(eventData, 0, "numberOfChainsReadRequests", chainIdsLength - 1);
        _setUintItem(eventData, 1, "messagingFee.nativeFee", messagingFee.nativeFee);
        _emitFeeDistributionEvent(eventData, "FeeDistributionInitiated");
    }

    // @dev receive and process the LZRead request received data and bridge GMX to other chains if necessary
    // @param guid unused parameter that represents the unique idenfifier for the LZRead request
    // @param receivedData MultichainReaderUtils.ReceivedData the LZRead request received data
    function processLzReceive(
        bytes32 /*guid*/,
        MultichainReaderUtils.ReceivedData calldata receivedData
    ) external onlyMultichainReader {
        // validate the distribution state and that the LZRead response is within the acceptable time limit
        _validateDistributionState(DistributionState.Initiated);
        _validateReadResponseTimestamp(receivedData.timestamp);

        // withdraw any GMX fees remaining in the feeHandler
        feeHandler.withdrawFees(gmx);

        // set the current chain and LZRead response fee amounts, staked GMX amounts, timestamp and current chain WNT price
        uint256[] memory chainIds = FeeDistributorUtils.retrieveChainIds(dataStore);
        uint256[] memory feeAmountsGmx = _createUintArray(chainIds.length);
        uint256[] memory stakedAmountsGmx = _createUintArray(chainIds.length);
        uint256 feeAmountGmxCurrentChain = _getUint(Keys2.feeDistributorFeeAmountGmxKey(mockChainId));
        uint256 stakedGmxCurrentChain = _getUint(Keys2.feeDistributorStakedGmxKey(mockChainId));
        uint256 totalFeeAmountGmx;
        uint256 totalStakedGmx;
        uint256 currentChainIndex;
        uint256 targetChainIndex;
        for (uint256 i; i < chainIds.length; i++) {
            uint256 chainId = chainIds[i];

            if (chainId == mockChainId) {
                feeAmountsGmx[i] = feeAmountGmxCurrentChain;
                stakedAmountsGmx[i] = stakedGmxCurrentChain;
                totalFeeAmountGmx += feeAmountGmxCurrentChain;
                totalStakedGmx += stakedGmxCurrentChain;
                currentChainIndex = i;
                continue;
            }
            (uint256 feeAmountGmx, uint256 stakedGmx) = _decodeReadData(receivedData.readData, targetChainIndex);
            feeAmountsGmx[i] = feeAmountGmx;
            stakedAmountsGmx[i] = stakedGmx;
            totalFeeAmountGmx += feeAmountGmx;
            totalStakedGmx += stakedGmx;
            _setUint(Keys2.feeDistributorFeeAmountGmxKey(chainId), feeAmountGmx);
            _setUint(Keys2.feeDistributorStakedGmxKey(chainId), stakedGmx);
            targetChainIndex++;
        }
        _setUint(Keys2.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX, totalFeeAmountGmx);
        _setUint(Keys2.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX, totalStakedGmx);
        _setUint(Keys2.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP, receivedData.timestamp);
        _setTokenPrices();

        uint256 requiredGmxAmount = Precision.mulDiv(totalFeeAmountGmx, stakedGmxCurrentChain, totalStakedGmx);
        uint256 totalGmxBridgedOut;
        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(3);
        // validate that the this chain has sufficient GMX to distribute fees
        if (feeAmountGmxCurrentChain >= requiredGmxAmount) {
            // only attempt to bridge to other chains if this chain has a surplus of GMX
            if (feeAmountGmxCurrentChain > requiredGmxAmount) {
                // Call the internal bridging function
                totalGmxBridgedOut = _calculateAndBridgeGmx(
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
                _setUint(Keys2.feeDistributorFeeAmountGmxKey(mockChainId), newFeeAmountGmxCurrentChain);
            }
            uint256 distributionState = uint256(DistributionState.BridgingCompleted);
            _setDistributionState(distributionState);
            _setUintItem(eventData, 0, "distributionState", distributionState);
        } else {
            uint256 distributionState = uint256(DistributionState.ReadDataReceived);
            _setDistributionState(distributionState);
            _setUintItem(eventData, 0, "distributionState", distributionState);
        }

        _setUintItem(eventData, 1, "feeAmountGmxCurrentChain", feeAmountGmxCurrentChain);
        _setUintItem(eventData, 2, "totalGmxBridgedOut", totalGmxBridgedOut);
        eventData.bytesItems.initItems(1);
        eventData.bytesItems.setItem(0, "receivedData", abi.encode(receivedData));
        _emitFeeDistributionEvent(eventData, "FeeDistributionDataReceived");
    }

    // @dev function executed via an automated Gelato transaction when bridged GMX is received on this chain
    function bridgedGmxReceived() external nonReentrant onlyFeeDistributionKeeper {
        _validateDistributionState(DistributionState.ReadDataReceived);
        _validateReadResponseTimestamp(_getUint(Keys2.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP));
        _validateDistributionNotCompleted();

        uint256 totalFeeAmountGmx = _getUint(Keys2.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);
        uint256 stakedGmxCurrentChain = _getUint(Keys2.feeDistributorStakedGmxKey(mockChainId));
        uint256 totalStakedGmx = _getUint(Keys2.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);
        uint256 requiredGmxAmount = Precision.mulDiv(totalFeeAmountGmx, stakedGmxCurrentChain, totalStakedGmx);
        uint256 origFeeAmountGmxCurrentChain = _getUint(Keys2.feeDistributorFeeAmountGmxKey(mockChainId));

        // the gross amount of GMX that should be received, before taking into account slippage
        uint256 grossGmxReceived = requiredGmxAmount - origFeeAmountGmxCurrentChain;
        // the slippage factor used when bridging to account for bridging fees and potential slippage
        uint256 slippageFactor = _getUint(Keys2.feeDistributorBridgeSlippageFactorKey(mockChainId));
        // calculate the minimum acceptable amount of bridged GMX received, taking into account allowed slippage
        uint256 minGmxReceived = Precision.applyFactor(grossGmxReceived, slippageFactor);
        // the minimum allowed GMX amount after bridging, taking into account slippage
        uint256 minRequiredGmxAmount = origFeeAmountGmxCurrentChain + minGmxReceived;
        // retrieve the current GMX available to distribute now that bridging has been completed
        uint256 feeAmountGmxCurrentChain = _getFeeDistributorVaultBalance(gmx);

        // if the calculated amount doesn't meet the min bridging requirement, revert
        if (feeAmountGmxCurrentChain < minRequiredGmxAmount) {
            revert Errors.BridgedAmountNotSufficient(minRequiredGmxAmount, feeAmountGmxCurrentChain);
        }

        // now that the GMX available to distribute has been validated, update in dataStore and update DistributionState
        _setUint(Keys2.feeDistributorFeeAmountGmxKey(mockChainId), feeAmountGmxCurrentChain);
        _setDistributionState(uint256(DistributionState.BridgingCompleted));

        // infer the bridged GMX received - note that it is technically possible for this value to not match the actual
        // bridged GMX received if for example, GMX is sent to the FeeDistributorVault from another source or GMX fees
        // are withdrawn from the FeeHandler after processLzReceive() is executed but before this function is executed
        uint256 gmxReceived = feeAmountGmxCurrentChain - origFeeAmountGmxCurrentChain;

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(2);
        _setUintItem(eventData, 0, "gmxReceived", gmxReceived);
        _setUintItem(eventData, 1, "feeAmountGmxCurrentChain", feeAmountGmxCurrentChain);
        _emitFeeDistributionEvent(eventData, "FeeDistributionBridgedGmxReceived");
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
        // validate that the TREASURY address stored in dataStore is not a zero address
        address treasuryAddress = _getAddressInfo(TREASURY);
        if (treasuryAddress == address(0)) {
            revert Errors.ZeroTreasuryAddress();
        }

        // validate the distribution states, LZRead response timestamp and distribution has not yet been completed
        _validateDistributionState(DistributionState.BridgingCompleted);
        _validateReadResponseTimestamp(_getUint(Keys2.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP));
        _validateDistributionNotCompleted();

        // withdraw any WNT fees remaining in the feeHandler
        feeHandler.withdrawFees(wnt);

        // calculate WNT costs and transfer to appropriate addresses
        (
            uint256 wntForKeepers,
            uint256 wntForChainlink,
            uint256 wntForTreasury,
            uint256 wntForReferralRewards
        ) = _calculateAndTransferWntCosts(wntReferralRewardsInUsd, feesV1Usd, feesV2Usd);

        // set the total fees in USD and referral reward amounts
        _setUint(Keys2.feeDistributorFeeAmountUsdKey(1), feesV1Usd);
        _setUint(Keys2.feeDistributorFeeAmountUsdKey(2), feesV2Usd);
        _setUint(Keys2.feeDistributorReferralRewardsAmountKey(wnt), wntForReferralRewards);
        _setUint(Keys2.feeDistributorReferralRewardsAmountKey(esGmx), esGmxForReferralRewards);
        _setUint(Keys2.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, block.timestamp);
        _setDistributionState(uint256(DistributionState.None));

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(7);
        _setUintItem(eventData, 0, "feesV1Usd", feesV1Usd);
        _setUintItem(eventData, 1, "feesV2Usd", feesV2Usd);
        _setUintItem(eventData, 2, "wntForKeepers", wntForKeepers);
        _setUintItem(eventData, 3, "wntForChainlink", wntForChainlink);
        _setUintItem(eventData, 4, "wntForTreasury", wntForTreasury);
        _setUintItem(eventData, 5, "wntForReferralRewards", wntForReferralRewards);
        _setUintItem(eventData, 6, "esGmxForReferralRewards", esGmxForReferralRewards);
        _emitFeeDistributionEvent(eventData, "FeeDistributionCompleted");
    }

    // @dev deposit the calculated referral rewards into the ClaimVault for the specified accounts
    // @param token the token in which the referral rewards will be deposited
    // @param distributionId the distribution id
    // @param params array of referral rewards deposit parameters
    function depositReferralRewards(
        address token,
        uint256 distributionId,
        ClaimUtils.DepositParam[] calldata params
    ) external nonReentrant onlyFeeDistributionKeeper {
        // validate the distribution state
        _validateDistributionState(DistributionState.None);

        uint256 tokensForReferralRewards = _getUint(Keys2.feeDistributorReferralRewardsAmountKey(token));
        uint256 cumulativeDepositAmount = _getUint(Keys2.feeDistributorReferralRewardsDepositedKey(token));
        if (token == esGmx) {
            // validate the esGMX amount is valid and that there are sufficient esGMX in the feeDistributorVault
            uint256 maxEsGmxReferralRewards = _getUint(Keys2.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_ESGMX_AMOUNT);
            if (tokensForReferralRewards > maxEsGmxReferralRewards) {
                revert Errors.MaxEsGmxReferralRewardsAmountExceeded(tokensForReferralRewards, maxEsGmxReferralRewards);
            }

            uint256 vaultEsGmxBalance = _getFeeDistributorVaultBalance(token);
            uint256 esGmxToBeDeposited = tokensForReferralRewards - cumulativeDepositAmount;
            if (esGmxToBeDeposited > vaultEsGmxBalance) {
                IMintable(token).mint(address(feeDistributorVault), esGmxToBeDeposited - vaultEsGmxBalance);
            }

            // update esGMX bonus reward amounts for each account in the vester contract
            for (uint256 i; i < params.length; i++) {
                ClaimUtils.DepositParam memory param = params[i];

                address vester = _getAddressInfo(ESGMX_VESTER);
                uint256 totalEsGmxRewards = IVester(vester).bonusRewards(param.account) + param.amount;
                IVester(vester).setBonusRewards(param.account, totalEsGmxRewards);

                EventUtils.EventLogData memory eventData;
                eventData.uintItems.initItems(2);
                _setUintItem(eventData, 0, "amount", param.amount);
                _setUintItem(eventData, 1, "totalEsGmxRewards", totalEsGmxRewards);

                eventEmitter.emitEventLog1("TotalEsGmxRewardsIncreased", Cast.toBytes32(param.account), eventData);
            }
        } else if (token != wnt) {
            revert Errors.InvalidReferralRewardToken(token);
        }

        uint256 totalTransferAmount = ClaimUtils.incrementClaims(
            dataStore,
            eventEmitter,
            token,
            distributionId,
            params
        );
        _transferOut(token, claimVault, totalTransferAmount);
        dataStore.incrementUint(Keys.totalClaimableFundsAmountKey(token), totalTransferAmount);

        ClaimUtils._validateTotalClaimableFundsAmount(dataStore, token, claimVault);

        // validate that the cumulative referral rewards deposited is not greater than the total calculated amount
        cumulativeDepositAmount += totalTransferAmount;
        if (cumulativeDepositAmount > tokensForReferralRewards) {
            revert Errors.MaxReferralRewardsExceeded(token, cumulativeDepositAmount, tokensForReferralRewards);
        }

        _setUint(Keys2.feeDistributorReferralRewardsDepositedKey(token), cumulativeDepositAmount);
    }

    function _calculateAndBridgeGmx(
        uint256[] memory chainIds,
        uint256 totalFeeAmountGmx,
        uint256[] memory stakedAmountsGmx,
        uint256 totalStakedGmx,
        uint256[] memory feeAmountsGmx,
        uint256 currentChainIndex
    ) internal returns (uint256) {
        uint256 chainIdsLength = chainIds.length;
        uint256[] memory target = new uint256[](chainIdsLength);
        for (uint256 i; i < chainIdsLength; i++) {
            target[i] = Precision.mulDiv(totalFeeAmountGmx, stakedAmountsGmx[i], totalStakedGmx);
        }

        Transfer[] memory transfer = FeeDistributorUtils.computeTransfers(feeAmountsGmx, target);

        uint256[] memory bridgingAmounts = _createUintArray(chainIdsLength);

        for (uint256 j; j < transfer.length; j++) {
            if (transfer[j].from == currentChainIndex) {
                bridgingAmounts[transfer[j].to] = transfer[j].amount;
            }
        }

        return _bridgeGmx(chainIds, bridgingAmounts);
    }

    function _bridgeGmx(uint256[] memory chainIds, uint256[] memory bridgingAmounts) internal returns (uint256) {
        // Execute bridging transactions from current chain
        OFTCore layerzeroOft = OFTCore(_getAddressInfo(LAYERZERO_OFT));
        uint256 decimalConversionRate = layerzeroOft.decimalConversionRate();
        uint256 totalGmxBridgedOut;
        for (uint256 i; i < chainIds.length; i++) {
            uint256 bridgingAmount = bridgingAmounts[i];
            if (bridgingAmount == 0) continue;

            uint256 sendAmount = _removeDust(bridgingAmount, decimalConversionRate);

            // Move GMX needed for bridging to this contract from FeeDistributorVault
            _transferOut(gmx, address(this), sendAmount);

            // If the Layerzero OFT contract on this chain requires GMX approval, approve the sendAmount
            if (layerzeroOft.approvalRequired()) {
                IERC20(gmx).approve(address(layerzeroOft), sendAmount);
            }

            // Prepare remaining params needed for the bridging transaction
            uint256 chainId = chainIds[i];
            uint32 layerzeroChainId = uint32(_getUint(Keys2.feeDistributorLayerZeroChainIdKey(chainId)));
            bytes32 to = Cast.toBytes32(_getAddressInfoForChain(chainId, Keys.FEE_RECEIVER));
            uint256 minAmountOut = _removeDust(
                Precision.applyFactor(sendAmount, _getUint(Keys2.feeDistributorBridgeSlippageFactorKey(chainId))),
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
            MessagingFee memory messagingFee = layerzeroOft.quoteSend(sendParam, false);

            // Make the bridge call to the OFT contract
            layerzeroOft.send{ value: messagingFee.nativeFee }(sendParam, messagingFee, address(feeDistributorVault));

            // Add to the total bridged out
            totalGmxBridgedOut += sendAmount;
        }

        return totalGmxBridgedOut;
    }

    function _calculateAndTransferWntCosts(
        uint256 wntReferralRewardsInUsd,
        uint256 feesV1Usd,
        uint256 feesV2Usd
    ) internal returns (uint256, uint256, uint256, uint256) {
        // the WNT fee amount related calculations
        uint256 totalWntBalance = _getFeeDistributorVaultBalance(wnt);

        // calculate the WNT that needs to be sent to each keeper
        (uint256 keeperCostsV1, uint256 keeperCostsV2) = FeeDistributorUtils.calculateKeeperCosts(dataStore);
        uint256 wntForKeepers = keeperCostsV1 + keeperCostsV2;

        // calculate the WNT for chainlink costs and amount of WNT to be sent to the treasury
        (uint256 wntForChainlink, uint256 wntForTreasury) = _calculateChainlinkAndTreasuryAmounts(
            totalWntBalance,
            feesV1Usd,
            feesV2Usd,
            keeperCostsV2
        );

        // validate wntReferralRewardsInUsd and calculate the referral rewards in WNT to be sent
        uint256 wntForReferralRewards = _calculateWntForReferralRewards(wntReferralRewardsInUsd, feesV1Usd);

        wntForTreasury = _finalizeWntForTreasury(
            totalWntBalance,
            keeperCostsV1,
            keeperCostsV2,
            wntForChainlink,
            wntForTreasury,
            wntForReferralRewards
        );

        _transferWntCosts(wntForKeepers, wntForChainlink, wntForTreasury);

        return (wntForKeepers, wntForChainlink, wntForTreasury, wntForReferralRewards);
    }

    function _finalizeWntForTreasury(
        uint256 totalWntBalance,
        uint256 keeperCostsV1,
        uint256 keeperCostsV2,
        uint256 wntForChainlink,
        uint256 wntForTreasury,
        uint256 wntForReferralRewards
    ) internal returns (uint256) {
        // calculate the remaining WNT for Treasury, validate the calculated amount and adjust if necessary
        uint256 wntBeforeV1KeeperCostsAndReferralRewards = totalWntBalance -
            keeperCostsV2 -
            wntForChainlink -
            wntForTreasury;

        uint256 keeperAndReferralCostsV1 = keeperCostsV1 + wntForReferralRewards;
        if (keeperAndReferralCostsV1 > wntBeforeV1KeeperCostsAndReferralRewards) {
            uint256 additionalWntForV1Costs = keeperAndReferralCostsV1 - wntBeforeV1KeeperCostsAndReferralRewards;
            if (additionalWntForV1Costs > wntForTreasury) {
                uint256 maxWntFromTreasury = _getUint(Keys2.FEE_DISTRIBUTOR_MAX_WNT_AMOUNT_FROM_TREASURY);
                uint256 additionalWntFromTreasury = additionalWntForV1Costs - wntForTreasury;
                if (additionalWntFromTreasury > maxWntFromTreasury) {
                    revert Errors.MaxWntFromTreasuryExceeded(maxWntFromTreasury, additionalWntFromTreasury);
                }
                IERC20(wnt).transferFrom(
                    _getAddressInfo(TREASURY),
                    address(feeDistributorVault),
                    additionalWntFromTreasury
                );
                wntForTreasury = 0;
            } else {
                wntForTreasury -= additionalWntForV1Costs;
            }
        } else {
            uint256 remainingWntForTreasury = wntBeforeV1KeeperCostsAndReferralRewards - keeperAndReferralCostsV1;
            wntForTreasury += remainingWntForTreasury;
        }
        return wntForTreasury;
    }

    function _transferWntCosts(uint256 wntForKeepers, uint256 wntForChainlink, uint256 wntForTreasury) internal {
        // transfer the WNT that needs to be sent to each keeper
        address[] memory keepers = dataStore.getAddressArray(Keys2.FEE_DISTRIBUTOR_KEEPER_COSTS);
        uint256[] memory keepersTargetBalance = dataStore.getUintArray(Keys2.FEE_DISTRIBUTOR_KEEPER_COSTS);
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

        // transfer the WNT for chainlink costs and WNT for the treasury
        _transferOut(wnt, _getAddressInfo(CHAINLINK), wntForChainlink);
        _transferOut(wnt, _getAddressInfo(TREASURY), wntForTreasury);

        // transfer gmx fees for the week and update the last distribution time and tokens per interval
        address extendedGmxTracker = _getAddressInfoForChain(mockChainId, EXTENDED_GMX_TRACKER);
        uint256 feeAmountGmx = _getUint(Keys2.feeDistributorFeeAmountGmxKey(mockChainId));
        address distributor = IRewardTracker(extendedGmxTracker).distributor();
        _transferOut(gmx, extendedGmxTracker, feeAmountGmx);
        IRewardDistributor(distributor).updateLastDistributionTime();
        IRewardDistributor(distributor).setTokensPerInterval(feeAmountGmx / 1 weeks);
    }

    function _setUint(bytes32 fullKey, uint256 value) internal {
        dataStore.setUint(fullKey, value);
    }

    function _setDistributionState(uint256 value) internal {
        _setUint(Keys2.FEE_DISTRIBUTOR_STATE, value);
    }

    function _transferOut(address token, address receiver, uint256 amount) internal {
        feeDistributorVault.transferOut(token, receiver, amount);
    }

    function _emitFeeDistributionEvent(
        EventUtils.EventLogData memory eventData,
        string memory eventDescription
    ) internal {
        eventData.stringItems.initItems(1);
        eventData.stringItems.setItem(0, "eventDescription", eventDescription);
        eventEmitter.emitEventLog("FeeDistributionEvent", eventData);
    }

    function _setTokenPrices() internal {
        _setUint(Keys2.FEE_DISTRIBUTOR_GMX_PRICE, _getOraclePrice(gmxForOracle));
        _setUint(Keys2.FEE_DISTRIBUTOR_WNT_PRICE, _getOraclePrice(wnt));
    }

    function _calculateChainlinkAndTreasuryAmounts(
        uint256 totalWntBalance,
        uint256 feesV1Usd,
        uint256 feesV2Usd,
        uint256 keeperCostsV2
    ) internal view returns (uint256, uint256) {
        uint256 feesV1UsdInWnt = Precision.applyFactor(feesV1Usd, _getUint(Keys2.FEE_DISTRIBUTOR_V1_FEES_WNT_FACTOR));
        uint256 feesV2UsdInWnt = Precision.applyFactor(feesV2Usd, _getUint(Keys2.FEE_DISTRIBUTOR_V2_FEES_WNT_FACTOR));
        uint256 chainlinkTreasuryWntAmount = Precision.mulDiv(
            totalWntBalance,
            feesV2UsdInWnt,
            feesV1UsdInWnt + feesV2UsdInWnt
        );
        uint256 wntForChainlink = Precision.applyFactor(
            chainlinkTreasuryWntAmount,
            _getUint(Keys2.FEE_DISTRIBUTOR_CHAINLINK_FACTOR)
        );
        uint256 wntForTreasury = chainlinkTreasuryWntAmount - wntForChainlink - keeperCostsV2;

        return (wntForChainlink, wntForTreasury);
    }

    function _calculateWntForReferralRewards(
        uint256 wntReferralRewardsInUsd,
        uint256 feesV1Usd
    ) internal view returns (uint256) {
        uint256 maxWntReferralRewardsInUsdAmount = _getUint(Keys2.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_AMOUNT);
        if (wntReferralRewardsInUsd > maxWntReferralRewardsInUsdAmount) {
            revert Errors.MaxWntReferralRewardsInUsdAmountExceeded(
                wntReferralRewardsInUsd,
                maxWntReferralRewardsInUsdAmount
            );
        }

        uint256 maxWntReferralRewardsInUsdFactor = _getUint(Keys2.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_FACTOR);
        uint256 maxWntReferralRewardsInUsd = Precision.applyFactor(feesV1Usd, maxWntReferralRewardsInUsdFactor);
        if (wntReferralRewardsInUsd > maxWntReferralRewardsInUsd) {
            revert Errors.MaxWntReferralRewardsInUsdExceeded(wntReferralRewardsInUsd, maxWntReferralRewardsInUsd);
        }

        uint256 scaledWntPrice = _getUint(Keys2.FEE_DISTRIBUTOR_WNT_PRICE) * Precision.FLOAT_PRECISION;
        uint256 wntForReferralRewards = Precision.toFactor(wntReferralRewardsInUsd, scaledWntPrice);

        return wntForReferralRewards;
    }

    function _getUint(bytes32 fullKey) internal view returns (uint256) {
        return dataStore.getUint(fullKey);
    }

    function _getAddress(bytes32 fullKey) internal view returns (address) {
        return dataStore.getAddress(fullKey);
    }

    function _getAddressInfo(bytes32 addressKey) internal view returns (address) {
        return _getAddress(Keys2.feeDistributorAddressInfoKey(addressKey));
    }

    function _getAddressInfoForChain(uint256 chainId, bytes32 addressKey) internal view returns (address) {
        return _getAddress(Keys2.feeDistributorAddressInfoForChainKey(chainId, addressKey));
    }

    function _getFeeDistributorVaultBalance(address token) internal view returns (uint256) {
        return IERC20(token).balanceOf(address(feeDistributorVault));
    }

    function _getOraclePrice(address token) internal view returns (uint256) {
        // ChainlinkPriceFeedProvider.getOraclePrice() is not used since the prices are for non-stablecoin tokens
        (bool hasPriceFeed, uint256 price) = ChainlinkPriceFeedUtils.getPriceFeedPrice(dataStoreForOracle, token);

        if (!hasPriceFeed) {
            revert Errors.EmptyChainlinkPriceFeed(token);
        }

        return price;
    }

    function _validateReadResponseTimestamp(uint256 readResponseTimestamp) internal view {
        if (block.timestamp - readResponseTimestamp > _getUint(Keys2.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY)) {
            revert Errors.OutdatedReadResponse(readResponseTimestamp);
        }
    }

    function _validateDistributionState(DistributionState allowedDistributionState) internal view {
        uint256 distributionStateUint = _getUint(Keys2.FEE_DISTRIBUTOR_STATE);
        if (allowedDistributionState != DistributionState(distributionStateUint)) {
            revert Errors.InvalidDistributionState(distributionStateUint);
        }
    }

    function _validateDistributionNotCompleted() internal view {
        uint256 dayOfWeek = ((block.timestamp / 1 days) + 4) % 7;
        uint256 daysSinceDistributionDay = (dayOfWeek + 7 - _getUint(Keys2.FEE_DISTRIBUTOR_DISTRIBUTION_DAY)) % 7;
        uint256 midnightToday = block.timestamp - (block.timestamp % 1 days);
        uint256 startOfDistributionWeek = midnightToday - (daysSinceDistributionDay * 1 days);
        uint256 lastDistributionTime = _getUint(Keys2.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP);
        if (lastDistributionTime > startOfDistributionWeek) {
            revert Errors.FeeDistributionAlreadyCompleted(lastDistributionTime, startOfDistributionWeek);
        }
    }

    function _setReadRequestInput(
        uint32 chainId,
        address target,
        bytes memory callData
    ) internal pure returns (MultichainReaderUtils.ReadRequestInputs memory) {
        return MultichainReaderUtils.ReadRequestInputs(chainId, target, callData);
    }

    function _createUintArray(uint256 arrayLength) internal pure returns (uint256[] memory) {
        return new uint256[](arrayLength);
    }

    function _createAddressArray(uint256 arrayLength) internal pure returns (address[] memory) {
        return new address[](arrayLength);
    }

    function _decodeReadData(
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

    function _removeDust(uint256 amount, uint256 decimalConversionRate) internal pure returns (uint256) {
        return (amount / decimalConversionRate) * decimalConversionRate;
    }

    function _setUintItem(
        EventUtils.EventLogData memory eventData,
        uint256 itemNumber,
        string memory itemName,
        uint256 uintItem
    ) internal pure {
        eventData.uintItems.setItem(itemNumber, itemName, uintItem);
    }
}
