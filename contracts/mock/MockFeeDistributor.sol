// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@layerzerolabs/oft-evm/contracts/OFTCore.sol";

import "../data/Keys2.sol";
import "../fee/FeeDistributorUtils.sol";
import "../fee/FeeDistributorVault.sol";
import "../fee/IFeeWithdrawer.sol";
import "../multichain/MultichainReader.sol";
import "../utils/Precision.sol";
import "../utils/Cast.sol";
import "../v1/IRewardTrackerV1.sol";
import "../v1/IRewardDistributorV1.sol";

contract MockFeeDistributor is ReentrancyGuard, RoleModule {
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;

    // constant and immutable variables are internal to reduce the contract size
    bytes internal constant EMPTY_BYTES = "";

    bytes32 internal constant REWARD_TRACKER = keccak256(abi.encode("REWARD_TRACKER"));
    bytes32 internal constant DATASTORE = keccak256(abi.encode("DATASTORE"));
    bytes32 internal constant TREASURY = keccak256(abi.encode("TREASURY"));
    bytes32 internal constant LAYERZERO_OFT = keccak256(abi.encode("LAYERZERO_OFT"));
    bytes32 internal constant CHAINLINK = keccak256(abi.encode("CHAINLINK"));
    bytes32 internal constant FEE_DISTRIBUTOR_VAULT = keccak256(abi.encode("FEE_DISTRIBUTOR_VAULT"));

    uint256 internal constant mockChainId = 40000;

    FeeDistributorVault internal immutable feeDistributorVault;
    IFeeWithdrawer internal immutable feeWithdrawer;
    DataStore internal immutable dataStore;
    DataStore internal immutable dataStoreForOracle;
    EventEmitter internal immutable eventEmitter;
    MultichainReader internal immutable multichainReader;

    address internal immutable gmx;
    address internal immutable gmxForOracle;
    address internal immutable secondaryFeeToken;

    struct MockVariables {
        DataStore dataStoreForOracle;
        address gmxForOracle;
    }

    receive() external payable {}

    constructor(
        RoleStore _roleStore,
        FeeDistributorVault _feeDistributorVault,
        IFeeWithdrawer _feeWithdrawer,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        MultichainReader _multichainReader,
        address _gmx,
        address _secondaryFeeToken,
        MockVariables memory _mockVariables
    ) RoleModule(_roleStore) {
        feeDistributorVault = _feeDistributorVault;
        feeWithdrawer = _feeWithdrawer;
        dataStore = _dataStore;
        eventEmitter = _eventEmitter;
        multichainReader = _multichainReader;
        gmx = _gmx;
        secondaryFeeToken = _secondaryFeeToken;

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

    // @dev commit the local fee amount and staked GMX snapshot for the current distribution epoch
    //
    // the committed values, rather than live balances, are what the other chains' FeeDistributors
    // read via LZRead, so every chain calculates the distribution from the same figures; commits
    // across chains do not need to be simultaneous, only made for the same epoch
    function commitSnapshot() external nonReentrant onlyFeeDistributionKeeper {
        uint256 distributionStateUint = _getUint(Keys2.FEE_DISTRIBUTOR_STATE);
        DistributionState distributionState = DistributionState(distributionStateUint);
        if (distributionState != DistributionState.None && distributionState != DistributionState.Committed) {
            revert Errors.InvalidDistributionState(distributionStateUint);
        }
        _validateDistributionNotCompleted();

        uint256 epochId = _getEpochId();
        // a snapshot can only be re-committed for a new epoch, as remote chains may have already
        // read the current one
        if (
            distributionState == DistributionState.Committed &&
            _getUint(Keys2.feeDistributorSnapshotEpochKey(mockChainId)) == epochId
        ) {
            revert Errors.SnapshotAlreadyCommitted(epochId);
        }

        address rewardTracker = _getAddressInfoForChain(mockChainId, REWARD_TRACKER);
        uint256 feeAmountGmx = feeWithdrawer.withdrawableAmount(gmx) + _getFeeDistributorVaultBalance(gmx);
        uint256 stakedGmx = IERC20(rewardTracker).totalSupply();

        // the snapshot keys are read by remote chains and are not mutated during processing; the
        // non-snapshot keys are this chain's working values, updated as GMX is bridged
        _setUint(Keys2.feeDistributorSnapshotFeeAmountGmxKey(mockChainId), feeAmountGmx);
        _setUint(Keys2.feeDistributorSnapshotStakedGmxKey(mockChainId), stakedGmx);
        _setUint(Keys2.feeDistributorSnapshotEpochKey(mockChainId), epochId);
        _setUint(Keys2.feeDistributorFeeAmountGmxKey(mockChainId), feeAmountGmx);
        _setUint(Keys2.feeDistributorStakedGmxKey(mockChainId), stakedGmx);

        _setDistributionState(uint256(DistributionState.Committed));

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(3);
        _setUintItem(eventData, 0, "epochId", epochId);
        _setUintItem(eventData, 1, "feeAmountGmx", feeAmountGmx);
        _setUintItem(eventData, 2, "stakedGmx", stakedGmx);
        _emitFeeDistributionEvent("FeeDistributionSnapshotCommitted", eventData);
    }

    // @dev initiate the weekly fee distribution process
    //
    // The fee distribution process relies on the premise that commitSnapshot is executed on all
    // chains for the same epoch before this function is executed; if a chain's snapshot is missing
    // or from a different epoch the received data is discarded and the read can be retried
    //
    // In cases in which a chain encounters downtime or a keeper experiences issues, the
    // distribution can be abandoned for the week via resetDistribution once the read response
    // window has passed
    function initiateDistribute() external nonReentrant onlyFeeDistributionKeeper {
        // validate that the feeWithdrawer's withdrawTarget is the feeDistributorVault
        address target = feeWithdrawer.withdrawTarget();
        if (target != address(feeDistributorVault)) {
            revert Errors.InvalidWithdrawTarget(target, address(feeDistributorVault));
        }

        // validate distribution state and that distribution is not yet completed for the current week
        _validateDistributionState(DistributionState.Committed);
        _validateDistributionNotCompleted();

        // validate that the committed snapshot is recent enough to distribute against; a snapshot
        // may complete shortly after its week but not arbitrarily late
        {
            uint256 committedEpoch = _getUint(Keys2.feeDistributorSnapshotEpochKey(mockChainId));
            if (block.timestamp > committedEpoch + 1 weeks + _getUint(Keys2.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY)) {
                revert Errors.StaleSnapshotEpoch(committedEpoch);
            }
        }

        // populate readRequestInputs and extraOptionsInputs param used for cross chain LZRead request
        // the reads target the committed snapshot values in each chain's DataStore rather than
        // live balances, see commitSnapshot
        uint256[] memory chainIds = FeeDistributorUtils.retrieveChainIds(dataStore);
        uint256 chainIdsLength = chainIds.length;
        MultichainReaderUtils.ReadRequestInputs[]
            memory readRequestInputs = new MultichainReaderUtils.ReadRequestInputs[]((chainIdsLength - 1) * 3);
        uint256 targetChainIndex;
        for (uint256 i; i < chainIdsLength; i++) {
            uint256 chainId = chainIds[i];
            if (chainId == mockChainId) {
                continue;
            }

            address dataStoreTargetChain = _getAddressInfoForChain(chainId, DATASTORE);
            if (dataStoreTargetChain == address(0)) {
                revert Errors.EmptyDataStoreForChain(chainId);
            }
            uint32 layerZeroChainId = uint32(_getUint(Keys2.feeDistributorLayerZeroChainIdKey(chainId)));
            uint256 readRequestIndex = targetChainIndex * 3;

            readRequestInputs[readRequestIndex] = _setReadRequestInput(
                layerZeroChainId,
                dataStoreTargetChain,
                abi.encodeWithSelector(DataStore.getUint.selector, Keys2.feeDistributorSnapshotEpochKey(chainId))
            );
            readRequestIndex++;

            readRequestInputs[readRequestIndex] = _setReadRequestInput(
                layerZeroChainId,
                dataStoreTargetChain,
                abi.encodeWithSelector(DataStore.getUint.selector, Keys2.feeDistributorSnapshotFeeAmountGmxKey(chainId))
            );
            readRequestIndex++;

            readRequestInputs[readRequestIndex] = _setReadRequestInput(
                layerZeroChainId,
                dataStoreTargetChain,
                abi.encodeWithSelector(DataStore.getUint.selector, Keys2.feeDistributorSnapshotStakedGmxKey(chainId))
            );
            targetChainIndex++;
        }

        MultichainReaderUtils.ExtraOptionsInputs memory extraOptionsInputs;
        extraOptionsInputs.gasLimit = uint128(_getUint(Keys2.FEE_DISTRIBUTOR_GAS_LIMIT));
        extraOptionsInputs.returnDataSize = ((uint32(chainIdsLength) - 1) * 96) + 8;

        _setDistributionState(uint256(DistributionState.Initiated));

        uint256 nativeFee;
        {
            // record the guid of the read request and the hash of the chain id list so that only
            // the matching response can be processed; these are set before sending as the response
            // can be delivered within the sending transaction
            bytes32 expectedGuid = multichainReader.nextReadGuid();
            dataStore.setBytes32(Keys2.FEE_DISTRIBUTOR_EXPECTED_READ_GUID, expectedGuid);
            dataStore.setBytes32(Keys2.FEE_DISTRIBUTOR_EXPECTED_CHAIN_IDS_HASH, keccak256(abi.encode(chainIds)));

            // calculate native token fee required and execute multichainReader.sendReadRequests LZRead request
            MessagingFee memory messagingFee = multichainReader.quoteReadFee(readRequestInputs, extraOptionsInputs);
            nativeFee = messagingFee.nativeFee;
            MessagingReceipt memory receipt = multichainReader.sendReadRequests{ value: nativeFee }(
                readRequestInputs,
                extraOptionsInputs
            );
            // validate that the recorded guid matches the guid the request was actually assigned
            if (receipt.guid != expectedGuid) {
                revert Errors.UnexpectedReadResponseGuid(receipt.guid, expectedGuid);
            }
        }

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(2);
        _setUintItem(eventData, 0, "numberOfChainsReadRequests", chainIdsLength - 1);
        _setUintItem(eventData, 1, "messagingFee.nativeFee", nativeFee);
        _emitFeeDistributionEvent("FeeDistributionInitiated", eventData);
    }

    // @dev receive and process the LZRead request received data and bridge GMX to other chains if necessary
    // @param guid the unique identifier for the LZRead request
    // @param receivedData MultichainReaderUtils.ReceivedData the LZRead request received data
    function processLzReceive(
        bytes32 guid,
        MultichainReaderUtils.ReceivedData calldata receivedData
    ) external onlyMultichainReader {
        // validate the distribution state and that the LZRead response is within the acceptable time limit
        _validateDistributionState(DistributionState.Initiated);
        _validateReadResponseTimestamp(receivedData.timestamp);

        // validate that the response corresponds to the read request sent for this distribution
        _validateReadResponseGuid(guid);

        uint256[] memory chainIds = FeeDistributorUtils.retrieveChainIds(dataStore);

        // discard the received data if the chain id list changed while the read was in flight,
        // stepping back to the Committed state so the read can be retried with the new list
        if (!_validateChainIdsHash(chainIds)) {
            return;
        }

        // validate that the response has the expected size for the chain id list, otherwise the
        // per chain values could be decoded misaligned
        if (receivedData.readData.length != (chainIds.length - 1) * 96) {
            revert Errors.InvalidReadDataLength(receivedData.readData.length, (chainIds.length - 1) * 96);
        }

        // discard the received data if any chain's snapshot is missing or from a different epoch,
        // stepping back to the Committed state so the read can be retried
        if (!_validateSnapshotEpochs(chainIds, receivedData.readData)) {
            return;
        }

        // withdraw any remaining GMX fees via the feeWithdrawer
        feeWithdrawer.withdrawFees(gmx);

        // set the current chain and LZRead response fee amounts, staked GMX amounts and timestamp
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
            (, uint256 feeAmountGmx, uint256 stakedGmx) = _decodeReadData(receivedData.readData, targetChainIndex);
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

        uint256 requiredGmxAmount = Precision.mulDiv(totalFeeAmountGmx, stakedGmxCurrentChain, totalStakedGmx);
        uint256 totalGmxBridgedOut;
        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(3);
        // validate that the this chain has sufficient GMX to distribute fees or if fees aren't being distributed
        if (
            feeAmountGmxCurrentChain >= requiredGmxAmount || !dataStore.getBool(Keys2.FEE_DISTRIBUTOR_DISTRIBUTE_FEES)
        ) {
            // only attempt to bridge to other chains if this chain has a surplus of GMX and fees are being distributed
            if (
                feeAmountGmxCurrentChain > requiredGmxAmount && dataStore.getBool(Keys2.FEE_DISTRIBUTOR_DISTRIBUTE_FEES)
            ) {
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
        _emitFeeDistributionEvent("FeeDistributionDataReceived", eventData);
    }

    // @dev function executed via an automated transaction when bridged GMX is received on this chain
    function bridgedGmxReceived() external nonReentrant onlyFeeDistributionKeeper {
        _validateDistributionState(DistributionState.ReadDataReceived);
        uint256 readResponseTimestamp = _getUint(Keys2.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);
        _validateReadResponseTimestamp(readResponseTimestamp);
        _validateDistributionNotCompleted();

        (uint256 origFeeAmountGmx, uint256 minRequiredGmxAmount, uint256 feeAmountGmx) = getGmxAmounts();

        // if the calculated amount doesn't meet the minimum bridging requirement, revert, unless
        // the configured grace period has elapsed and the amount received is above the configured
        // floor, in which case the distribution proceeds with the amount actually received
        if (feeAmountGmx < minRequiredGmxAmount) {
            _validateBridgeShortfallTolerated(minRequiredGmxAmount, feeAmountGmx, readResponseTimestamp);
        }

        // infer the bridged GMX received - note that it is technically possible for this value to not match the actual
        // bridged GMX received if for example, GMX is sent to the FeeDistributorVault from another source or GMX fees
        // are withdrawn via the feeWithdrawer after processLzReceive() is executed but before this function is executed
        uint256 gmxReceived = feeAmountGmx > origFeeAmountGmx ? feeAmountGmx - origFeeAmountGmx : 0;

        // now that the GMX available to distribute has been validated, update in dataStore and update DistributionState
        _setUint(Keys2.feeDistributorFeeAmountGmxKey(mockChainId), feeAmountGmx);
        _setDistributionState(uint256(DistributionState.BridgingCompleted));

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(2);
        _setUintItem(eventData, 0, "gmxReceived", gmxReceived);
        _setUintItem(eventData, 1, "feeAmountGmx", feeAmountGmx);
        _emitFeeDistributionEvent("FeeDistributionBridgedGmxReceived", eventData);
    }

    // @dev complete the fee distribution calculations, token transfers and if necessary bridge GMX cross-chain
    function distribute() external nonReentrant onlyFeeDistributionKeeper {
        // validate that the TREASURY address stored in dataStore is not a zero address
        address treasuryAddress = _getAddressInfo(TREASURY);
        if (treasuryAddress == address(0)) {
            revert Errors.ZeroTreasuryAddress();
        }

        // validate the distribution states, LZRead response timestamp and distribution has not yet been completed
        _validateDistributionState(DistributionState.BridgingCompleted);
        _validateReadResponseTimestamp(_getUint(Keys2.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP));
        _validateDistributionNotCompleted();

        // withdraw any remaining secondaryFeeToken fees via the feeWithdrawer
        feeWithdrawer.withdrawFees(secondaryFeeToken);

        // calculate the amount of secondaryFeeToken that needs to be sent to the keepers, chainlink and treasury
        (uint256 feesForKeepers, uint256 feesForChainlink, uint256 feesForTreasury) = _calculateFeeAmounts();

        // retrieve the amount of GMX to be paid out to GMX token stakers
        uint256 feeAmountGmx = _getUint(Keys2.feeDistributorFeeAmountGmxKey(mockChainId));

        _distributeFees(feesForKeepers, feesForChainlink, feesForTreasury, feeAmountGmx, treasuryAddress);

        _setUint(Keys2.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, block.timestamp);
        _setDistributionState(uint256(DistributionState.None));

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(4);
        _setUintItem(eventData, 0, "feesForKeepers", feesForKeepers);
        _setUintItem(eventData, 1, "feesForChainlink", feesForChainlink);
        _setUintItem(eventData, 2, "feesForTreasury", feesForTreasury);
        _setUintItem(eventData, 3, "feeAmountGmx", feeAmountGmx);
        _emitFeeDistributionEvent("FeeDistributionCompleted", eventData);
    }

    // @dev abandon a distribution that cannot be completed, e.g. an LZRead response or bridged
    // GMX that never arrives; only allowed once the read response window has passed, and the
    // distribution timestamp is set so a new distribution cannot be initiated until the next week,
    // ensuring anything in flight for the abandoned epoch cannot be mistaken for a new one;
    // undistributed GMX remains in the feeDistributorVault and is included in the next snapshot
    function resetDistribution() external nonReentrant onlyTimelockAdmin {
        uint256 distributionStateUint = _getUint(Keys2.FEE_DISTRIBUTOR_STATE);
        if (DistributionState(distributionStateUint) == DistributionState.None) {
            revert Errors.InvalidDistributionState(distributionStateUint);
        }

        uint256 stateUpdatedAt = _getUint(Keys2.FEE_DISTRIBUTOR_STATE_UPDATED_AT);
        if (block.timestamp - stateUpdatedAt <= _getUint(Keys2.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY)) {
            revert Errors.DistributionResetNotAllowed(distributionStateUint, stateUpdatedAt);
        }

        // clear the local snapshot so remote chains that read it after the reset step back and
        // retry rather than distributing against a chain that cannot distribute this week
        _setUint(Keys2.feeDistributorSnapshotEpochKey(mockChainId), 0);
        dataStore.setBytes32(Keys2.FEE_DISTRIBUTOR_EXPECTED_READ_GUID, bytes32(0));
        _setUint(Keys2.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, block.timestamp);
        _setDistributionState(uint256(DistributionState.None));

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(2);
        _setUintItem(eventData, 0, "distributionState", distributionStateUint);
        _setUintItem(eventData, 1, "stateUpdatedAt", stateUpdatedAt);
        _emitFeeDistributionEvent("FeeDistributionReset", eventData);
    }

    function getGmxAmounts() public view returns (uint256, uint256, uint256) {
        uint256 totalFeeAmountGmx = _getUint(Keys2.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);
        uint256 stakedGmxCurrentChain = _getUint(Keys2.feeDistributorStakedGmxKey(mockChainId));
        uint256 totalStakedGmx = _getUint(Keys2.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);
        uint256 requiredGmxAmount = Precision.mulDiv(totalFeeAmountGmx, stakedGmxCurrentChain, totalStakedGmx);
        uint256 origFeeAmountGmx = _getUint(Keys2.feeDistributorFeeAmountGmxKey(mockChainId));

        // the gross amount of GMX that should be received, before taking into account slippage
        uint256 grossGmxReceived = requiredGmxAmount - origFeeAmountGmx;
        // the slippage factor used when bridging to account for bridging fees and potential slippage
        uint256 slippageFactor = _getUint(Keys2.feeDistributorBridgeSlippageFactorKey(mockChainId));
        // calculate the minimum acceptable amount of bridged GMX received, taking into account allowed slippage
        uint256 minGmxReceived = Precision.applyFactor(grossGmxReceived, slippageFactor);
        // the minimum allowed GMX amount after bridging, taking into account slippage
        uint256 minRequiredGmxAmount = origFeeAmountGmx + minGmxReceived;
        // retrieve the current GMX available to distribute now that bridging has been completed
        uint256 feeAmountGmx = _getFeeDistributorVaultBalance(gmx);

        return (origFeeAmountGmx, minRequiredGmxAmount, feeAmountGmx);
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
            bytes32 to = Cast.toBytes32(_getAddressInfoForChain(chainId, FEE_DISTRIBUTOR_VAULT));
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
            layerzeroOft.send{ value: messagingFee.nativeFee }(sendParam, messagingFee, address(this));

            // Add to the total bridged out
            totalGmxBridgedOut += sendAmount;
        }

        return totalGmxBridgedOut;
    }

    function _calculateFeeAmounts() internal returns (uint256, uint256, uint256) {
        // calculate the amount of secondaryFeeToken that needs to be sent to each keeper
        address[] memory keepers = dataStore.getAddressArray(Keys2.FEE_DISTRIBUTOR_KEEPER_COSTS);
        uint256[] memory keepersTargetBalance = dataStore.getUintArray(Keys2.FEE_DISTRIBUTOR_KEEPER_COSTS);
        if (keepers.length != keepersTargetBalance.length) {
            revert Errors.KeeperArrayLengthMismatch(keepers.length, keepersTargetBalance.length);
        }

        uint256 feesForKeepers;
        for (uint256 i; i < keepers.length; i++) {
            uint256 keeperTargetBalance = keepersTargetBalance[i];
            uint256 keeperBalance = keepers[i].balance;
            if (keeperTargetBalance > keeperBalance) {
                feesForKeepers += (keeperTargetBalance - keeperBalance);
            }
        }

        // calculate secondaryFeeToken fee amounts and transfer to appropriate addresses
        uint256 totalSecondaryFeeTokenBalance = _getFeeDistributorVaultBalance(secondaryFeeToken);

        // calculate the amount of secondaryFeeToken for chainlink costs and to be sent to the treasury
        uint256 feesForChainlink = Precision.applyFactor(
            totalSecondaryFeeTokenBalance,
            _getUint(Keys2.FEE_DISTRIBUTOR_CHAINLINK_FACTOR)
        );
        uint256 feesForTreasury = totalSecondaryFeeTokenBalance - feesForChainlink;

        if (feesForKeepers > feesForTreasury) {
            uint256 maxFeesFromTreasury = _getUint(Keys2.FEE_DISTRIBUTOR_MAX_FEE_AMOUNT_FROM_TREASURY);
            uint256 additionalFeesFromTreasury = feesForKeepers - feesForTreasury;
            if (additionalFeesFromTreasury > maxFeesFromTreasury) {
                revert Errors.MaxFeesFromTreasuryExceeded(maxFeesFromTreasury, additionalFeesFromTreasury);
            }
            IERC20(secondaryFeeToken).transferFrom(
                _getAddressInfo(TREASURY),
                address(feeDistributorVault),
                additionalFeesFromTreasury
            );
            feesForTreasury = 0;
        } else {
            feesForTreasury -= feesForKeepers;
        }
        return (feesForKeepers, feesForChainlink, feesForTreasury);
    }

    function _distributeFees(
        uint256 feesForKeepers,
        uint256 feesForChainlink,
        uint256 feesForTreasury,
        uint256 feeAmountGmx,
        address treasuryAddress
    ) internal {
        // transfer the amount of secondaryFeeToken that needs to be sent to each keeper
        address[] memory keepers = dataStore.getAddressArray(Keys2.FEE_DISTRIBUTOR_KEEPER_COSTS);
        uint256[] memory keepersTargetBalance = dataStore.getUintArray(Keys2.FEE_DISTRIBUTOR_KEEPER_COSTS);
        uint256 feesToKeepers;
        for (uint256 i; i < keepers.length; i++) {
            address keeper = keepers[i];
            uint256 keeperBalance = keeper.balance;
            uint256 keeperTargetBalance = keepersTargetBalance[i];
            if (keeperBalance < keeperTargetBalance) {
                uint256 feesToKeeper = keeperTargetBalance - keeperBalance;
                if (secondaryFeeToken == _getAddress(Keys.WNT)) {
                    feeDistributorVault.transferOutNativeToken(keeper, feesToKeeper);
                } else {
                    _transferOut(secondaryFeeToken, keeper, feesToKeeper);
                }
                feesToKeepers += feesToKeeper;
            }
        }
        if (feesForKeepers != feesToKeepers) {
            revert Errors.KeeperAmountMismatch(feesForKeepers, feesToKeepers);
        }

        // transfer the secondaryFeeToken allocated for chainlink costs and for the treasury
        _transferOut(secondaryFeeToken, _getAddressInfo(CHAINLINK), feesForChainlink);
        _transferOut(secondaryFeeToken, treasuryAddress, feesForTreasury);

        address rewardTracker = _getAddressInfoForChain(mockChainId, REWARD_TRACKER);
        address distributor = IRewardTracker(rewardTracker).distributor();
        if (dataStore.getBool(Keys2.FEE_DISTRIBUTOR_DISTRIBUTE_FEES)) {
            address rewardToken = IRewardDistributor(distributor).rewardToken();
            if (rewardToken != gmx) {
                revert Errors.InvalidDistributorRewardToken(rewardToken, gmx);
            }
            if (
                IRewardDistributor(distributor).lastDistributionTime() == 0 ||
                IRewardDistributor(distributor).tokensPerInterval() == 0
            ) {
                // no rewards are currently streaming; re-base the last distribution time so the new
                // rate does not accrue retroactively over the idle period
                IRewardDistributor(distributor).updateLastDistributionTime();
            } else {
                // flush rewards accrued at the previous rate, capped at the previous funding, before
                // the new tranche is transferred
                IRewardTracker(rewardTracker).updateRewards();
            }
            // transfer gmx fees for the week to the distributor and base the new tokens per interval on
            // the distributor balance so any funded but unaccrued remainder from the previous schedule
            // is carried into the new week instead of being stranded
            _transferOut(gmx, distributor, feeAmountGmx);
            IRewardDistributor(distributor).setTokensPerInterval(IERC20(gmx).balanceOf(distributor) / 1 weeks);
        } else {
            // if gmx fees are not being distributed, transfer gmx fees and ensure tokens per interval = 0
            _transferOut(gmx, treasuryAddress, feeAmountGmx);
            if (IRewardDistributor(distributor).tokensPerInterval() > 0) {
                IRewardDistributor(distributor).setTokensPerInterval(0);
            }
        }
    }

    function _setUint(bytes32 fullKey, uint256 value) internal {
        dataStore.setUint(fullKey, value);
    }

    function _setDistributionState(uint256 value) internal {
        _setUint(Keys2.FEE_DISTRIBUTOR_STATE, value);
        _setUint(Keys2.FEE_DISTRIBUTOR_STATE_UPDATED_AT, block.timestamp);
    }

    function _transferOut(address token, address receiver, uint256 amount) internal {
        feeDistributorVault.transferOut(token, receiver, amount);
    }

    function _emitFeeDistributionEvent(string memory eventDesc, EventUtils.EventLogData memory eventData) internal {
        eventEmitter.emitEventLog1("FeeDistributorEvent", keccak256(bytes(eventDesc)), eventData);
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

    function _validateReadResponseGuid(bytes32 guid) internal view {
        bytes32 expectedGuid = dataStore.getBytes32(Keys2.FEE_DISTRIBUTOR_EXPECTED_READ_GUID);
        if (guid != expectedGuid) {
            revert Errors.UnexpectedReadResponseGuid(guid, expectedGuid);
        }
    }

    function _validateChainIdsHash(uint256[] memory chainIds) internal returns (bool) {
        bytes32 chainIdsHash = keccak256(abi.encode(chainIds));
        bytes32 expectedChainIdsHash = dataStore.getBytes32(Keys2.FEE_DISTRIBUTOR_EXPECTED_CHAIN_IDS_HASH);
        if (chainIdsHash != expectedChainIdsHash) {
            _setDistributionState(uint256(DistributionState.Committed));
            dataStore.setBytes32(Keys2.FEE_DISTRIBUTOR_EXPECTED_READ_GUID, bytes32(0));

            EventUtils.EventLogData memory eventData;
            eventData.bytes32Items.initItems(2);
            eventData.bytes32Items.setItem(0, "chainIdsHash", chainIdsHash);
            eventData.bytes32Items.setItem(1, "expectedChainIdsHash", expectedChainIdsHash);
            _emitFeeDistributionEvent("FeeDistributionChainIdsChanged", eventData);
            return false;
        }
        return true;
    }

    function _getEpochId() internal view returns (uint256) {
        uint256 dayOfWeek = ((block.timestamp / 1 days) + 4) % 7;
        uint256 daysSinceDistributionDay = (dayOfWeek + 7 - _getUint(Keys2.FEE_DISTRIBUTOR_DISTRIBUTION_DAY)) % 7;
        uint256 midnightToday = block.timestamp - (block.timestamp % 1 days);
        return midnightToday - (daysSinceDistributionDay * 1 days);
    }

    function _validateSnapshotEpochs(uint256[] memory chainIds, bytes calldata readData) internal returns (bool) {
        // the stored committed epoch is used rather than one derived at receive time so a response
        // delivered just after the week boundary remains valid
        uint256 committedEpoch = _getUint(Keys2.feeDistributorSnapshotEpochKey(mockChainId));
        uint256 targetChainIndex;
        for (uint256 i; i < chainIds.length; i++) {
            if (chainIds[i] == mockChainId) {
                continue;
            }
            (uint256 remoteEpoch, , ) = _decodeReadData(readData, targetChainIndex);
            if (remoteEpoch != committedEpoch) {
                // step back so the read can be retried once the mismatched chain has committed
                _setDistributionState(uint256(DistributionState.Committed));
                dataStore.setBytes32(Keys2.FEE_DISTRIBUTOR_EXPECTED_READ_GUID, bytes32(0));

                EventUtils.EventLogData memory eventData;
                eventData.uintItems.initItems(3);
                _setUintItem(eventData, 0, "chainId", chainIds[i]);
                _setUintItem(eventData, 1, "remoteEpoch", remoteEpoch);
                _setUintItem(eventData, 2, "committedEpoch", committedEpoch);
                _emitFeeDistributionEvent("FeeDistributionEpochMismatch", eventData);
                return false;
            }
            targetChainIndex++;
        }
        return true;
    }

    function _validateBridgeShortfallTolerated(
        uint256 minRequiredGmxAmount,
        uint256 feeAmountGmx,
        uint256 readResponseTimestamp
    ) internal {
        uint256 gracePeriod = _getUint(Keys2.FEE_DISTRIBUTOR_BRIDGE_GRACE_PERIOD);
        uint256 minBridgedFactor = _getUint(Keys2.FEE_DISTRIBUTOR_MIN_BRIDGED_FACTOR);
        bool toleranceConfigured = gracePeriod != 0 && minBridgedFactor != 0;
        bool graceElapsed = block.timestamp - readResponseTimestamp > gracePeriod;
        uint256 floorGmxAmount = Precision.applyFactor(minRequiredGmxAmount, minBridgedFactor);
        if (!toleranceConfigured || !graceElapsed || feeAmountGmx < floorGmxAmount) {
            revert Errors.BridgedAmountNotSufficient(minRequiredGmxAmount, feeAmountGmx);
        }

        EventUtils.EventLogData memory eventData;
        eventData.uintItems.initItems(2);
        _setUintItem(eventData, 0, "minRequiredGmxAmount", minRequiredGmxAmount);
        _setUintItem(eventData, 1, "feeAmountGmx", feeAmountGmx);
        _emitFeeDistributionEvent("FeeDistributionBridgeShortfallTolerated", eventData);
    }

    function _validateDistributionNotCompleted() internal view {
        uint256 startOfDistributionWeek = _getEpochId();
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
    ) internal pure returns (uint256, uint256, uint256) {
        uint256 offset = targetChainIndex * 96;
        (uint256 epochId, uint256 feeAmountGmx, uint256 stakedGmx) = abi.decode(
            readData[offset:(offset + 96)],
            (uint256, uint256, uint256)
        );
        return (epochId, feeAmountGmx, stakedGmx);
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
