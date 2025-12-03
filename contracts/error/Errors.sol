// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

library Errors {
    // AdlHandler errors
    error AdlNotRequired(int256 pnlToPoolFactor, uint256 maxPnlFactorForAdl);
    error InvalidAdl(int256 nextPnlToPoolFactor, int256 pnlToPoolFactor);
    error PnlOvercorrected(int256 nextPnlToPoolFactor, uint256 minPnlFactorForAdl);

    // AdlUtils errors
    error InvalidSizeDeltaForAdl(uint256 sizeDeltaUsd, uint256 positionSizeInUsd);
    error AdlNotEnabled();

    // AutoCancelUtils errors
    error MaxAutoCancelOrdersExceeded(uint256 count, uint256 maxAutoCancelOrders);

    // Bank errors
    error SelfTransferNotSupported(address receiver);
    error InvalidNativeTokenSender(address msgSender);

    // BaseHandler errors
    error RequestNotYetCancellable(uint256 requestAge, uint256 requestExpirationAge, string requestType);

    // CallbackUtils errors
    error MaxCallbackGasLimitExceeded(uint256 callbackGasLimit, uint256 maxCallbackGasLimit);
    error InsufficientGasLeftForCallback(uint256 gasToBeForwarded, uint256 callbackGasLimit);

    // Config errors
    error InvalidBaseKey(bytes32 baseKey);
    error ConfigValueExceedsAllowedRange(bytes32 baseKey, uint256 value);
    error InvalidClaimableFactor(uint256 value);
    error InvalidClaimableReductionFactor(uint256 value);
    error OracleProviderAlreadyExistsForToken(address oracle, address token);
    error OracleProviderMinChangeDelayNotYetPassed(address token, address provider);
    error PriceFeedAlreadyExistsForToken(address token);
    error DataStreamIdAlreadyExistsForToken(address token);
    error EdgeDataStreamIdAlreadyExistsForToken(address token);
    error MaxFundingFactorPerSecondLimitExceeded(uint256 maxFundingFactorPerSecond, uint256 limit);
    error InvalidPositionImpactPoolDistributionRate(uint256 distributionAmount, uint256 positionImpactPoolAmount);
    error MaxDataListLengthExceeded(uint256 dataLength, uint256 maxDataLength);
    error EmptyToken();

    // ContributorHandler errors
    error InvalidSetContributorPaymentInput(uint256 tokensLength, uint256 amountsLength);
    error InvalidContributorToken(address token);
    error MaxTotalContributorTokenAmountExceeded(address token, uint256 totalAmount, uint256 maxTotalAmount);
    error MinContributorPaymentIntervalNotYetPassed(uint256 minPaymentInterval);
    error MinContributorPaymentIntervalBelowAllowedRange(uint256 interval);
    error InvalidSetMaxTotalContributorTokenAmountInput(uint256 tokensLength, uint256 amountsLength);

    // Timelock errors
    error ActionAlreadySignalled();
    error ActionNotSignalled();
    error SignalTimeNotYetPassed(uint256 signalTime);
    error InvalidTimelockDelay(uint256 timelockDelay);
    error MaxTimelockDelayExceeded(uint256 timelockDelay);
    error InvalidFeeReceiver(address receiver);
    error InvalidOracleSigner(address signer);
    error InvalidHoldingAddress(address account);
    error EmptyPositionImpactWithdrawalAmount();
    error OraclePriceOutdated();
    error EmptyTarget();
    error EmptyFundingAccount();
    error EmptyReduceLentAmount();
    error ReductionExceedsLentAmount(uint256 lentAmount, uint256 totalReductionAmount);

    // GlvDepositStoreUtils errors
    error GlvDepositNotFound(bytes32 key);
    // GlvShiftStoreUtils errors
    error GlvShiftNotFound(bytes32 key);
    // GlvWithdrawalStoreUtils errors
    error GlvWithdrawalNotFound(bytes32 key);
    // GlvDepositUtils errors
    error EmptyGlvDepositAmounts();
    error EmptyGlvMarketAmount();
    error EmptyGlvDeposit();
    error InvalidMinGlvTokensForFirstGlvDeposit(uint256 minGlvTokens, uint256 expectedMinGlvTokens);
    error InvalidReceiverForFirstGlvDeposit(address receiver, address expectedReceiver);
    // GlvWithdrawalUtils errors
    error EmptyGlvWithdrawal();
    error EmptyGlvWithdrawalAmount();
    // GlvUtils errors
    error EmptyGlv(address glv);
    error EmptyGlvTokenSupply();
    error GlvNegativeMarketPoolValue(address glv, address market);
    error GlvUnsupportedMarket(address glv, address market);
    error GlvDisabledMarket(address glv, address market);
    error GlvEnabledMarket(address glv, address market);
    error GlvNonZeroMarketBalance(address glv, address market);
    error GlvMaxMarketCountExceeded(address glv, uint256 glvMaxMarketCount);
    error GlvMaxMarketTokenBalanceUsdExceeded(address glv, address market, uint256 maxMarketTokenBalanceUsd, uint256 marketTokenBalanceUsd);
    error GlvMaxMarketTokenBalanceAmountExceeded(address glv, address market, uint256 maxMarketTokenBalanceAmount, uint256 marketTokenBalanceAmount);
    error GlvInsufficientMarketTokenBalance(address glv, address market, uint256 marketTokenBalance, uint256 marketTokenAmount);
    error GlvMarketAlreadyExists(address glv, address market);
    error GlvInvalidLongToken(address glv, address provided, address expected);
    error GlvInvalidShortToken(address glv, address provided, address expected);
    // GlvShiftUtils
    error GlvShiftMaxLossExceeded(uint256 effectivePriceImpactFactor, uint256 glvMaxShiftPriceImpactFactor);
    error GlvShiftIntervalNotYetPassed(uint256 currentTimestamp, uint256 lastGlvShiftExecutedAt, uint256 glvShiftMinInterval);
    // GlvFactory
    error GlvAlreadyExists(bytes32 salt, address glv);
    error GlvSymbolTooLong();
    error GlvNameTooLong();
    // GlvStoreUtils
    error GlvNotFound(address key);
    // Jit
    error JitInvalidToMarket(address market, address expectedMarket);
    error JitEmptyShiftParams();
    error JitUnsupportedOrderType(uint256 orderType);

    // DepositStoreUtils errors
    error DepositNotFound(bytes32 key);

    // DepositUtils errors
    error EmptyDeposit();
    error EmptyDepositAmounts();

    // ExecuteDepositUtils errors
    error MinMarketTokens(uint256 received, uint256 expected);
    error EmptyDepositAmountsAfterSwap();
    error InvalidPoolValueForDeposit(int256 poolValue);
    error InvalidSwapOutputToken(address outputToken, address expectedOutputToken);
    error InvalidReceiverForFirstDeposit(address receiver, address expectedReceiver);
    error InvalidMinMarketTokensForFirstDeposit(uint256 minMarketTokens, uint256 expectedMinMarketTokens);

    // ExternalHandler errors
    error ExternalCallFailed(bytes data);
    error InvalidExternalCallInput(uint256 targetsLength, uint256 dataListLength);
    error InvalidExternalReceiversInput(uint256 refundTokensLength, uint256 refundReceiversLength);
    error InvalidExternalCallTarget(address target);

    // FeeBatchStoreUtils errors
    error FeeBatchNotFound(bytes32 key);

    // FeeDistributor errors
    error InvalidFeeBatchTokenIndex(uint256 tokenIndex, uint256 feeBatchTokensLength);
    error InvalidAmountInForFeeBatch(uint256 amountIn, uint256 remainingAmount);
    error InvalidSwapPathForV1(address[] path, address bridgingToken);

    // GlpMigrator errors
    error InvalidGlpAmount(uint256 totalGlpAmountToRedeem, uint256 totalGlpAmount);
    error InvalidExecutionFeeForMigration(uint256 totalExecutionFee, uint256 msgValue);

    // GlvHandler errors
    error InvalidGlvDepositInitialLongToken(address initialLongToken);
    error InvalidGlvDepositInitialShortToken(address initialShortToken);
    error InvalidGlvDepositSwapPath(uint256 longTokenSwapPathLength, uint256 shortTokenSwapPathLength);
    error MinGlvTokens(uint256 received, uint256 expected);

    // OrderHandler errors
    error OrderNotUpdatable(uint256 orderType);
    error InvalidKeeperForFrozenOrder(address keeper);

    // FeatureUtils errors
    error DisabledFeature(bytes32 key);

    // FeeHandler errors
    error InvalidBuybackToken(address buybackToken);
    error InvalidVersion(uint256 version);
    error InsufficientBuybackOutputAmount(address feeToken, address buybackToken, uint256 outputAmount, uint256 minOutputAmount);
    error BuybackAndFeeTokenAreEqual(address feeToken, address buybackToken);
    error AvailableFeeAmountIsZero(address feeToken, address buybackToken, uint256 availableFeeAmount);
    error MaxBuybackPriceAgeExceeded(uint256 priceTimestamp, uint256 buybackMaxPriceAge, uint256 currentTimestamp);
    error EmptyClaimFeesMarket();

    // GasUtils errors
    error InsufficientExecutionFee(uint256 minExecutionFee, uint256 executionFee);
    error InsufficientWntAmountForExecutionFee(uint256 wntAmount, uint256 executionFee);
    error InsufficientNativeTokenAmount(uint256 msgValue, uint256 expectedNativeValue);
    error InsufficientExecutionGasForErrorHandling(uint256 startingGas, uint256 minHandleErrorGas);
    error InsufficientExecutionGas(uint256 startingGas, uint256 estimatedGasLimit, uint256 minAdditionalGasForExecution);
    error InsufficientHandleExecutionErrorGas(uint256 gas, uint256 minHandleExecutionErrorGas);
    error InsufficientGasForCancellation(uint256 gas, uint256 minHandleExecutionErrorGas);
    error InsufficientGasForAutoCancellation(uint256 gas, uint256 minHandleExecutionErrorGas);
    error InsufficientGasLeft(uint256 gas, uint256 estimatedGasLimit);
    error InvalidExecutionFee(uint256 executionFee, uint256 minExecutionFee, uint256 maxExecutionFee);
    error EmptyRelayFeeAddress();

    // MarketFactory errors
    error MarketAlreadyExists(bytes32 salt, address existingMarketAddress);

    // MarketStoreUtils errors
    error MarketNotFound(address key);

    // MarketUtils errors
    error EmptyMarket();
    error DisabledMarket(address market);
    error MaxSwapPathLengthExceeded(uint256 swapPathLengh, uint256 maxSwapPathLength);
    error InsufficientPoolAmount(uint256 poolAmount, uint256 amount);
    error InsufficientReserve(uint256 reservedUsd, uint256 maxReservedUsd);
    error InsufficientReserveForOpenInterest(uint256 reservedUsd, uint256 maxReservedUsd);
    error UnableToGetOppositeToken(address inputToken, address market);
    error UnexpectedTokenForVirtualInventory(address token, address market);
    error EmptyMarketTokenSupply();
    error InvalidSwapMarket(address market);
    error UnableToGetCachedTokenPrice(address token, address market);
    error CollateralAlreadyClaimed(uint256 adjustedClaimableAmount, uint256 claimedAmount);
    error OpenInterestCannotBeUpdatedForSwapOnlyMarket(address market);
    error MaxOpenInterestExceeded(uint256 openInterest, uint256 maxOpenInterest);
    error MaxPoolAmountExceeded(uint256 poolAmount, uint256 maxPoolAmount);
    error MaxCollateralSumExceeded(uint256 collateralSum, uint256 maxCollateralSum);
    error MaxPoolUsdForDepositExceeded(uint256 poolUsd, uint256 maxPoolUsdForDeposit);
    error UnexpectedBorrowingFactor(uint256 positionBorrowingFactor, uint256 cumulativeBorrowingFactor);
    error UnableToGetBorrowingFactorEmptyPoolUsd();
    error UnableToGetFundingFactorEmptyOpenInterest();
    error InvalidPositionMarket(address market);
    error InvalidCollateralTokenForMarket(address market, address token);
    error PnlFactorExceededForLongs(int256 pnlToPoolFactor, uint256 maxPnlFactor);
    error PnlFactorExceededForShorts(int256 pnlToPoolFactor, uint256 maxPnlFactor);
    error InvalidUiFeeFactor(uint256 uiFeeFactor, uint256 maxUiFeeFactor);
    error EmptyAddressInMarketTokenBalanceValidation(address market, address token);
    error InvalidMarketTokenBalance(address market, address token, uint256 balance, uint256 expectedMinBalance);
    error InvalidMarketTokenBalanceForCollateralAmount(address market, address token, uint256 balance, uint256 collateralAmount);
    error InvalidMarketTokenBalanceForClaimableFunding(address market, address token, uint256 balance, uint256 claimableFundingFeeAmount);
    error UnexpectedPoolValue(int256 poolValue);

    // MarketPositionImpactUtils errors
    error InsufficientImpactPoolValueForWithdrawal(uint256 withdrawalAmount, uint256 poolValue, int256 totalPendingImpactAmount);

    // Oracle errors
    error SequencerDown();
    error SequencerGraceDurationNotYetPassed(uint256 timeSinceUp, uint256 sequencerGraceDuration);
    error EmptyValidatedPrices(); // not used, kept for compatibility
    error InvalidOracleProvider(address provider);
    error InvalidOracleProviderForToken(address provider, address expectedProvider);
    error GmEmptySigner(uint256 signerIndex);
    error InvalidOracleSetPricesProvidersParam(uint256 tokensLength, uint256 providersLength);
    error InvalidOracleSetPricesDataParam(uint256 tokensLength, uint256 dataLength);
    error GmInvalidBlockNumber(uint256 minOracleBlockNumber, uint256 currentBlockNumber);
    error GmInvalidMinMaxBlockNumber(uint256 minOracleBlockNumber, uint256 maxOracleBlockNumber);
    error EmptyDataStreamFeedId(address token);
    error InvalidDataStreamFeedId(address token, bytes32 feedId, bytes32 expectedFeedId);
    error InvalidDataStreamBidAsk(address token, int192 bid, int192 ask);
    error InvalidDataStreamPrices(address token, int192 bid, int192 ask);
    error MaxPriceAgeExceeded(uint256 oracleTimestamp, uint256 currentTimestamp);
    error MaxOracleTimestampRangeExceeded(uint256 range, uint256 maxRange);
    error GmMinOracleSigners(uint256 oracleSigners, uint256 minOracleSigners);
    error GmMaxOracleSigners(uint256 oracleSigners, uint256 maxOracleSigners);
    error BlockNumbersNotSorted(uint256 minOracleBlockNumber, uint256 prevMinOracleBlockNumber);
    error GmMinPricesNotSorted(address token, uint256 price, uint256 prevPrice);
    error GmMaxPricesNotSorted(address token, uint256 price, uint256 prevPrice);
    error EmptyChainlinkPriceFeedMultiplier(address token);
    error EmptyDataStreamMultiplier(address token);
    error InvalidDataStreamSpreadReductionFactor(address token, uint256 spreadReductionFactor);
    error InvalidFeedPrice(address token, int256 price);
    error ChainlinkPriceFeedNotUpdated(address token, uint256 timestamp, uint256 heartbeatDuration);
    error GmMaxSignerIndex(uint256 signerIndex, uint256 maxSignerIndex);
    error InvalidGmOraclePrice(address token);
    error InvalidGmSignerMinMaxPrice(uint256 minPrice, uint256 maxPrice);
    error InvalidGmMedianMinMaxPrice(uint256 minPrice, uint256 maxPrice);
    error NonEmptyTokensWithPrices(uint256 tokensWithPricesLength);
    error InvalidMinMaxForPrice(address token, uint256 min, uint256 max);
    error EmptyChainlinkPriceFeed(address token);
    error PriceAlreadySet(address token, uint256 minPrice, uint256 maxPrice);
    error MaxRefPriceDeviationExceeded(
        address token,
        uint256 price,
        uint256 refPrice,
        uint256 maxRefPriceDeviationFactor
    );
    error InvalidBlockRangeSet(uint256 largestMinBlockNumber, uint256 smallestMaxBlockNumber);
    error NonAtomicOracleProvider(address provider);

    // OracleModule errors
    error InvalidPrimaryPricesForSimulation(uint256 primaryTokensLength, uint256 primaryPricesLength);
    error EndOfOracleSimulation();

    // OracleUtils errors
    error InvalidGmSignature(address recoveredSigner, address expectedSigner);

    error EmptyPrimaryPrice(address token);

    error OracleTimestampsAreSmallerThanRequired(uint256 minOracleTimestamp, uint256 expectedTimestamp);
    error OracleTimestampsAreLargerThanRequestExpirationTime(uint256 maxOracleTimestamp, uint256 requestTimestamp, uint256 requestExpirationTime);

    // BaseOrderUtils errors
    error EmptyOrder();
    error UnsupportedOrderType(uint256 orderType);
    error UnsupportedOrderTypeForAutoCancellation(uint256 orderType);
    error InvalidOrderPrices(
        uint256 primaryPriceMin,
        uint256 primaryPriceMax,
        uint256 triggerPrice,
        uint256 orderType
    );
    error EmptySizeDeltaInTokens();
    error PriceImpactLargerThanOrderSize(int256 priceImpactUsd, uint256 sizeDeltaUsd);
    error NegativeExecutionPrice(int256 executionPrice, uint256 price, uint256 positionSizeInUsd, int256 priceImpactUsd, uint256 sizeDeltaUsd);
    error OrderNotFulfillableAtAcceptablePrice(uint256 price, uint256 acceptablePrice);
    error OrderValidFromTimeNotReached(uint256 validFromTime, uint256 currentTimestamp);

    // IncreaseOrderUtils errors
    error UnexpectedPositionState();

    // OrderUtils errors
    error OrderTypeCannotBeCreated(uint256 orderType);
    error OrderAlreadyFrozen();
    error MaxTotalCallbackGasLimitForAutoCancelOrdersExceeded(uint256 totalCallbackGasLimit, uint256 maxTotalCallbackGasLimit);
    error InvalidReceiver(address receiver);
    error UnexpectedValidFromTime(uint256 orderType);
    error InvalidTwapCount(uint256 twapCount);
    error InvalidInterval(uint256 interval);

    // OrderStoreUtils errors
    error OrderNotFound(bytes32 key);

    // SwapOrderUtils errors
    error UnexpectedMarket();

    // DecreasePositionCollateralUtils errors
    error InsufficientFundsToPayForCosts(uint256 remainingCostUsd, string step);
    error InvalidOutputToken(address tokenOut, address expectedTokenOut);

    // DecreasePositionUtils errors
    error InvalidDecreaseOrderSize(uint256 sizeDeltaUsd, uint256 positionSizeInUsd);
    error UnableToWithdrawCollateral(int256 estimatedRemainingCollateralUsd);
    error InvalidDecreasePositionSwapType(uint256 decreasePositionSwapType);
    error PositionShouldNotBeLiquidated(
        string reason,
        int256 remainingCollateralUsd,
        int256 minCollateralUsd,
        int256 minCollateralUsdForLeverage
    );

    // IncreasePositionUtils errors
    error InsufficientCollateralAmount(uint256 collateralAmount, int256 collateralDeltaAmount);
    error InsufficientCollateralUsd(int256 remainingCollateralUsd);

    // PositionStoreUtils errors
    error PositionNotFound(bytes32 key);

    // PositionUtils errors
    error LiquidatablePosition(
        string reason,
        int256 remainingCollateralUsd,
        int256 minCollateralUsd,
        int256 minCollateralUsdForLeverage
    );

    error EmptyPosition();
    error InvalidPositionSizeValues(uint256 sizeInUsd, uint256 sizeInTokens);
    error MinPositionSize(uint256 positionSizeInUsd, uint256 minPositionSizeUsd);

    // PositionPricingUtils errors
    error UsdDeltaExceedsLongOpenInterest(int256 usdDelta, uint256 longOpenInterest);
    error UsdDeltaExceedsShortOpenInterest(int256 usdDelta, uint256 shortOpenInterest);

    // ShiftStoreUtils errors
    error ShiftNotFound(bytes32 key);

    // ShiftUtils errors
    error EmptyShift();
    error EmptyShiftAmount();
    error ShiftFromAndToMarketAreEqual(address market);
    error LongTokensAreNotEqual(address fromMarketLongToken, address toMarketLongToken);
    error ShortTokensAreNotEqual(address fromMarketLongToken, address toMarketLongToken);
    error BridgeOutNotSupportedDuringShift();

    // SwapPricingUtils errors
    error UsdDeltaExceedsPoolValue(int256 usdDelta, uint256 poolUsd);

    // RoleModule errors
    error Unauthorized(address msgSender, string role);

    // RoleStore errors
    error ThereMustBeAtLeastOneRoleAdmin();
    error ThereMustBeAtLeastOneTimelockMultiSig();

    // ExchangeRouter errors
    error InvalidClaimFundingFeesInput(uint256 marketsLength, uint256 tokensLength);
    error InvalidClaimCollateralInput(uint256 marketsLength, uint256 tokensLength, uint256 timeKeysLength);
    error InvalidClaimAffiliateRewardsInput(uint256 marketsLength, uint256 tokensLength);
    error InvalidClaimUiFeesInput(uint256 marketsLength, uint256 tokensLength);

    // SwapUtils errors
    error InvalidTokenIn(address tokenIn, address market);
    error InsufficientOutputAmount(uint256 outputAmount, uint256 minOutputAmount);
    error InsufficientSwapOutputAmount(uint256 outputAmount, uint256 minOutputAmount);
    error DuplicatedMarketInSwapPath(address market);
    error SwapPriceImpactExceedsAmountIn(uint256 amountAfterFees, int256 negativeImpactAmount);

    // SubaccountRouter errors
    error InvalidReceiverForSubaccountOrder(address receiver, address expectedReceiver);
    error InvalidCancellationReceiverForSubaccountOrder(address cancellationReceiver, address expectedCancellationReceiver);

    // SubaccountUtils errors
    error SubaccountNotAuthorized(address account, address subaccount);
    error MaxSubaccountActionCountExceeded(address account, address subaccount, uint256 count, uint256 maxCount);
    error SubaccountApprovalExpired(address account, address subaccount, uint256 deadline, uint256 currentTimestamp);
    error SubaccountIntegrationIdDisabled(bytes32 integrationId);

    // TokenUtils errors
    error TokenTransferError(address token, address receiver, uint256 amount);
    error EmptyHoldingAddress();
    // Note that Transfer is misspelled as Tranfer in the EmptyTokenTranferGasLimit error
    // some contracts with this error cannot be re-deployed so it has been left as is
    error EmptyTokenTranferGasLimit(address token);

    // AccountUtils errors
    error EmptyAccount();
    error EmptyReceiver();
    error DataListLengthExceeded();

    // ClaimHandler errors
    error EmptyAmount();
    error EmptyClaimableAmount(address token);
    error InvalidToken(address token);
    error InvalidParams(string reason);
    error InsufficientFunds(address token);
    error InvalidClaimTermsSignature(address recoveredSigner, address expectedSigner);
    error InvalidClaimTermsSignatureForContract(address expectedSigner);
    error DuplicateClaimTerms(uint256 existingDistributionId);

    // Array errors
    error CompactedArrayOutOfBounds(
        uint256[] compactedValues,
        uint256 index,
        uint256 slotIndex,
        string label
    );

    error ArrayOutOfBoundsUint256(
        uint256[] values,
        uint256 index,
        string label
    );

    error ArrayOutOfBoundsBytes(
        bytes[] values,
        uint256 index,
        string label
    );

    // WithdrawalHandler errors
    error SwapsNotAllowedForAtomicWithdrawal(uint256 longTokenSwapPathLength, uint256 shortTokenSwapPathLength);

    // WithdrawalStoreUtils errors
    error WithdrawalNotFound(bytes32 key);

    // WithdrawalUtils errors
    error EmptyWithdrawal();
    error EmptyWithdrawalAmount();
    error MinLongTokens(uint256 received, uint256 expected);
    error MinShortTokens(uint256 received, uint256 expected);
    error InsufficientMarketTokens(uint256 balance, uint256 expected);
    error InvalidPoolValueForWithdrawal(int256 poolValue);
    error MaxLendableFactorForWithdrawalsExceeded(uint256 poolUsd, uint256 maxLendableUsd, uint256 lentUsd);

    // Uint256Mask errors
    error MaskIndexOutOfBounds(uint256 index, string label);
    error DuplicatedIndex(uint256 index, string label);

    // Cast errors
    error Uint256AsBytesLengthExceeds32Bytes(uint256 length);

    // ConfigSyncer errors
    error SyncConfigInvalidInputLengths(uint256 marketsLength, uint256 parametersLength);
    error SyncConfigUpdatesDisabledForMarket(address market);
    error SyncConfigUpdatesDisabledForParameter(string parameter);
    error SyncConfigUpdatesDisabledForMarketParameter(address market, string parameter);
    error SyncConfigInvalidMarketFromData(address market, address marketFromData);

    // Reader errors
    error EmptyMarketPrice(address market);

    // Multichain errors
    error InvalidTransferRequestsLength();
    error EmptyMultichainTransferInAmount(address account, address token);
    error EmptyMultichainTransferOutAmount(address account, address token);
    error InsufficientMultichainBalance(address account, address token, uint256 balance, uint256 amount);
    error InvalidSrcChainId(uint256 srcChainId);
    error InvalidEid(uint256 eid);
    error InvalidDestinationChainId(uint256 desChainId);
    error TokenPermitsNotAllowedForMultichain();
    error InvalidInitializer();
    error InvalidMultichainProvider(address provider);
    error InvalidMultichainEndpoint(address endpoint);
    error ReferralCodeAlreadyExists(bytes32 code);
    error UnableToPayOrderFee();
    error UnableToPayOrderFeeFromCollateral();
    error InvalidBridgeOutToken(address token);
    error InsufficientFee(uint256 feeProvided, uint256 feeRequired);

    enum SignatureType {
        Call,
        SubaccountApproval
    }

    // Gelato relay errors
    error InvalidSignature(string signatureType);
    error InvalidRecoveredSigner(string signatureType, address recovered, address recoveredFromMinified, address expectedSigner);
    // User sent incorrect fee token or incorrect swap path
    error UnexpectedRelayFeeTokenAfterSwap(address feeToken, address expectedFeeToken);
    error UnexpectedRelayFeeToken(address feeToken, address expectedFeeToken);
    // Contract received unsupported fee token from Gelato relay
    error UnsupportedRelayFeeToken(address feeToken, address expectedFeeToken);
    error InvalidPermitSpender(address spender, address expectedSpender);
    error InvalidUserDigest(bytes32 digest);
    error SubaccountApprovalDeadlinePassed(uint256 currentTimestamp, uint256 deadline);
    error InvalidSubaccountApprovalNonce(uint256 storedNonce, uint256 nonce);
    error InvalidSubaccountApprovalDesChainId(uint256 desChainId);
    error DeadlinePassed(uint256 currentTimestamp, uint256 deadline);
    error InsufficientRelayFee(uint256 requiredRelayFee, uint256 availableFeeAmount);
    error InvalidSubaccountApprovalSubaccount();
    error NonEmptyExternalCallsForSubaccountOrder();

    // EventUtils error
    error EventItemNotFound(string key);

    // EdgeOracle verifier errors
    error InvalidTrustedSignerAddress();
    error InvalidEdgeSigner();
    error InvalidEdgeSignature(uint256 recoverError);
    error InvalidEdgeDataStreamBidAsk(address token, uint256 bid, uint256 ask);
    error InvalidEdgeDataStreamPrices(address token, uint256 bid, uint256 ask);
    error InvalidEdgeDataStreamExpo(int256 expo);
    error RelayEmptyBatch();
    error RelayCalldataTooLong(uint256 calldataLength);
    error InvalidExternalCalls(uint256 sendTokensLength, uint256 sendAmountsLength);
    error MaxRelayFeeSwapForSubaccountExceeded(uint256 feeUsd, uint256 maxFeeUsd);

    error RemovalShouldNotBeSkipped(bytes32 listKey, bytes32 entityKey);

    // MultichainReader errors
    error InsufficientMultichainNativeFee(uint256 msgValue);
    error EmptyPeer(uint32 eid);

    // FeeDistributor errors
    error FeeDistributionAlreadyCompleted(uint256 lastDistributionTime, uint256 startOfCurrentWeek);
    error OutdatedReadResponse(uint256 timestamp);
    error InvalidDistributionState(uint256 distributionStateUint);
    error BridgedAmountNotSufficient(uint256 minRequiredFeeAmount, uint256 currentChainFeeAmount);
    error BridgingTransactionFailed(bytes result);
    error MaxWntReferralRewardsInUsdAmountExceeded(uint256 wntReferralRewardsInUsd, uint256 maxWntReferralRewardsInUsdAmount);
    error MaxWntReferralRewardsInUsdExceeded(uint256 wntReferralRewardsInUsd, uint256 maxWntReferralRewardsInUsd);
    error MaxEsGmxReferralRewardsAmountExceeded(uint256 tokensForReferralRewards, uint256 maxEsGmxReferralRewards);
    error MaxReferralRewardsExceeded(address token, uint256 cumulativeTransferAmount, uint256 tokensForReferralRewards);
    error MaxWntFromTreasuryExceeded(uint256 maxWntFromTreasury, uint256 additionalWntFromTreasury);
    error KeeperArrayLengthMismatch(uint256 keepersLength, uint256 keeperTargetBalancesLength, uint256 keeperVersionsLength);
    error SendEthToKeeperFailed(address keeper, uint256 sendAmount, bytes result);
    error KeeperAmountMismatch(uint256 wntForKeepers, uint256 wntToKeepers);
    error AttemptedBridgeAmountTooHigh(uint256 minRequiredFeeAmount, uint256 feeAmountCurrentChain, uint256 amountToBridgeOut);
    error InvalidReferralRewardToken(address token);
    error BridgingBalanceArrayMismatch(uint256 balancesLength, uint256 targetBalancesLength);
    error ZeroTreasuryAddress();
}

//0xd06ed8be AdlNotRequired(int256 pnlToPoolFactor, uint256 maxPnlFactorForAdl)
//0x1d4fc3c0 InvalidAdl(int256 nextPnlToPoolFactor, int256 pnlToPoolFactor)
//0x9f0bc7de PnlOvercorrected(int256 nextPnlToPoolFactor, uint256 minPnlFactorForAdl)
//0x720bb461 InvalidSizeDeltaForAdl(uint256 sizeDeltaUsd, uint256 positionSizeInUsd)
//0x3285dc57 AdlNotEnabled()
//0xf0794a60 MaxAutoCancelOrdersExceeded(uint256 count, uint256 maxAutoCancelOrders)
//0xe70f9152 SelfTransferNotSupported(address receiver)
//0xe71a51be InvalidNativeTokenSender(address msgSender)
//0xe8266438 RequestNotYetCancellable(uint256 requestAge, uint256 requestExpirationAge, string requestType)
//0x10aeb692 MaxCallbackGasLimitExceeded(uint256 callbackGasLimit, uint256 maxCallbackGasLimit)
//0x79a2abad InsufficientGasLeftForCallback(uint256 gasToBeForwarded, uint256 callbackGasLimit)
//0xeb19d3f5 InvalidBaseKey(bytes32 baseKey)
//0x5ebb87c9 ConfigValueExceedsAllowedRange(bytes32 baseKey, uint256 value)
//0x6c2738d3 InvalidClaimableFactor(uint256 value)
//0x7cf9eb07 InvalidClaimableReductionFactor(uint256 value)
//0xa6013d30 OracleProviderAlreadyExistsForToken(address oracle, address token)
//0x73f9981d OracleProviderMinChangeDelayNotYetPassed(address token, address provider)
//0xd4141298 PriceFeedAlreadyExistsForToken(address token)
//0x413f9a54 DataStreamIdAlreadyExistsForToken(address token)
//0x3f677c2e EdgeDataStreamIdAlreadyExistsForToken(address token)
//0x4f82a998 MaxFundingFactorPerSecondLimitExceeded(uint256 maxFundingFactorPerSecond, uint256 limit)
//0x15a1e249 InvalidPositionImpactPoolDistributionRate(uint256 distributionAmount, uint256 positionImpactPoolAmount)
//0xa0629236 MaxDataListLengthExceeded(uint256 dataLength, uint256 maxDataLength)
//0x066f53b1 EmptyToken()
//0x530b2590 InvalidSetContributorPaymentInput(uint256 tokensLength, uint256 amountsLength)
//0x4a591309 InvalidContributorToken(address token)
//0x043038f0 MaxTotalContributorTokenAmountExceeded(address token, uint256 totalAmount, uint256 maxTotalAmount)
//0xb9dc7b9d MinContributorPaymentIntervalNotYetPassed(uint256 minPaymentInterval)
//0x961b4025 MinContributorPaymentIntervalBelowAllowedRange(uint256 interval)
//0x29a93dc4 InvalidSetMaxTotalContributorTokenAmountInput(uint256 tokensLength, uint256 amountsLength)
//0xb244a107 ActionAlreadySignalled()
//0x94fdaea2 ActionNotSignalled()
//0x20b23584 SignalTimeNotYetPassed(uint256 signalTime)
//0xe6b0ddb6 InvalidTimelockDelay(uint256 timelockDelay)
//0xfaf66f0c MaxTimelockDelayExceeded(uint256 timelockDelay)
//0xcb9339d5 InvalidFeeReceiver(address receiver)
//0xc1b14c91 InvalidOracleSigner(address signer)
//0x7bb9d8f8 InvalidHoldingAddress(address account)
//0x0d1bbc95 EmptyPositionImpactWithdrawalAmount()
//0x48afc38e OraclePriceOutdated()
//0x9cdc6daa EmptyTarget()
//0x9ab5d127 EmptyFundingAccount()
//0xb3d35539 EmptyReduceLentAmount()
//0xeef4e171 ReductionExceedsLentAmount(uint256 lentAmount, uint256 totalReductionAmount)
//0x057058b6 GlvDepositNotFound(bytes32 key)
//0xde45e162 GlvShiftNotFound(bytes32 key)
//0x20dcb068 GlvWithdrawalNotFound(bytes32 key)
//0x03251ce6 EmptyGlvDepositAmounts()
//0x94409f52 EmptyGlvMarketAmount()
//0xbd192971 EmptyGlvDeposit()
//0xc08bb8a0 InvalidMinGlvTokensForFirstGlvDeposit(uint256 minGlvTokens, uint256 expectedMinGlvTokens)
//0x6eedac2f InvalidReceiverForFirstGlvDeposit(address receiver, address expectedReceiver)
//0x0e5be78f EmptyGlvWithdrawal()
//0x402a866f EmptyGlvWithdrawalAmount()
//0xa14e1b3d EmptyGlv(address glv)
//0x93856b1a EmptyGlvTokenSupply()
//0x2e3780e5 GlvNegativeMarketPoolValue(address glv, address market)
//0x07e9c4d5 GlvUnsupportedMarket(address glv, address market)
//0x30b8a225 GlvDisabledMarket(address glv, address market)
//0x8da31161 GlvEnabledMarket(address glv, address market)
//0x3afc5e65 GlvNonZeroMarketBalance(address glv, address market)
//0xaf7d3787 GlvMaxMarketCountExceeded(address glv, uint256 glvMaxMarketCount)
//0x66560e7d GlvMaxMarketTokenBalanceUsdExceeded(address glv, address market, uint256 maxMarketTokenBalanceUsd, uint256 marketTokenBalanceUsd)
//0xd859f947 GlvMaxMarketTokenBalanceAmountExceeded(address glv, address market, uint256 maxMarketTokenBalanceAmount, uint256 marketTokenBalanceAmount)
//0xc8b70b2c GlvInsufficientMarketTokenBalance(address glv, address market, uint256 marketTokenBalance, uint256 marketTokenAmount)
//0x3aa9fc91 GlvMarketAlreadyExists(address glv, address market)
//0x80ad6831 GlvInvalidLongToken(address glv, address provided, address expected)
//0x9673a10b GlvInvalidShortToken(address glv, address provided, address expected)
//0xf4dfe85d GlvShiftMaxLossExceeded(uint256 effectivePriceImpactFactor, uint256 glvMaxShiftPriceImpactFactor)
//0x232d7165 GlvShiftIntervalNotYetPassed(uint256 currentTimestamp, uint256 lastGlvShiftExecutedAt, uint256 glvShiftMinInterval)
//0xe44992d0 GlvAlreadyExists(bytes32 salt, address glv)
//0x9cb4f5c5 GlvSymbolTooLong()
//0x155712e1 GlvNameTooLong()
//0x6c00ed8a GlvNotFound(address key)
//0xf5489e5e JitInvalidToMarket(address market, address expectedMarket)
//0x32aedc9f JitEmptyShiftParams()
//0x262be6a6 JitUnsupportedOrderType(uint256 orderType)
//0x43e30ca8 DepositNotFound(bytes32 key)
//0x95b66fe9 EmptyDeposit()
//0x01af8c24 EmptyDepositAmounts()
//0x6ce23460 MinMarketTokens(uint256 received, uint256 expected)
//0xd1c3d5bd EmptyDepositAmountsAfterSwap()
//0xadaa688d InvalidPoolValueForDeposit(int256 poolValue)
//0x6ba3dd8b InvalidSwapOutputToken(address outputToken, address expectedOutputToken)
//0x77e8e698 InvalidReceiverForFirstDeposit(address receiver, address expectedReceiver)
//0x3f9c06ab InvalidMinMarketTokensForFirstDeposit(uint256 minMarketTokens, uint256 expectedMinMarketTokens)
//0x59afd6c6 ExternalCallFailed(bytes data)
//0x831e9f11 InvalidExternalCallInput(uint256 targetsLength, uint256 dataListLength)
//0xe15f2701 InvalidExternalReceiversInput(uint256 refundTokensLength, uint256 refundReceiversLength)
//0xbe55c895 InvalidExternalCallTarget(address target)
//0x2df6dc23 FeeBatchNotFound(bytes32 key)
//0xfa804399 InvalidFeeBatchTokenIndex(uint256 tokenIndex, uint256 feeBatchTokensLength)
//0x8ac146e6 InvalidAmountInForFeeBatch(uint256 amountIn, uint256 remainingAmount)
//0x672e4fba InvalidSwapPathForV1(address[] path, address bridgingToken)
//0xfc90fcc3 InvalidGlpAmount(uint256 totalGlpAmountToRedeem, uint256 totalGlpAmount)
//0x99e26b44 InvalidExecutionFeeForMigration(uint256 totalExecutionFee, uint256 msgValue)
//0xbf16cb0a InvalidGlvDepositInitialLongToken(address initialLongToken)
//0xdf0f9a23 InvalidGlvDepositInitialShortToken(address initialShortToken)
//0x055ab8b9 InvalidGlvDepositSwapPath(uint256 longTokenSwapPathLength, uint256 shortTokenSwapPathLength)
//0x966fea10 MinGlvTokens(uint256 received, uint256 expected)
//0x9aba92cb OrderNotUpdatable(uint256 orderType)
//0xe5feddc0 InvalidKeeperForFrozenOrder(address keeper)
//0xdd70e0c9 DisabledFeature(bytes32 key)
//0x752fdb63 InvalidBuybackToken(address buybackToken)
//0x1de2bca4 InvalidVersion(uint256 version)
//0xa581f648 InsufficientBuybackOutputAmount(address feeToken, address buybackToken, uint256 outputAmount, uint256 minOutputAmount)
//0xec775484 BuybackAndFeeTokenAreEqual(address feeToken, address buybackToken)
//0x60c5e472 AvailableFeeAmountIsZero(address feeToken, address buybackToken, uint256 availableFeeAmount)
//0x4e3f62a8 MaxBuybackPriceAgeExceeded(uint256 priceTimestamp, uint256 buybackMaxPriceAge, uint256 currentTimestamp)
//0x616daf1f EmptyClaimFeesMarket()
//0x5dac504d InsufficientExecutionFee(uint256 minExecutionFee, uint256 executionFee)
//0x3a78cd7e InsufficientWntAmountForExecutionFee(uint256 wntAmount, uint256 executionFee)
//0xb5749baf InsufficientNativeTokenAmount(uint256 msgValue, uint256 expectedNativeValue)
//0x79293964 InsufficientExecutionGasForErrorHandling(uint256 startingGas, uint256 minHandleErrorGas)
//0xbb416f93 InsufficientExecutionGas(uint256 startingGas, uint256 estimatedGasLimit, uint256 minAdditionalGasForExecution)
//0x3083b9e5 InsufficientHandleExecutionErrorGas(uint256 gas, uint256 minHandleExecutionErrorGas)
//0xd3dacaac InsufficientGasForCancellation(uint256 gas, uint256 minHandleExecutionErrorGas)
//0xe73a05d5 InsufficientGasForAutoCancellation(uint256 gas, uint256 minHandleExecutionErrorGas)
//0xf50ce733 InsufficientGasLeft(uint256 gas, uint256 estimatedGasLimit)
//0x9b867f31 InvalidExecutionFee(uint256 executionFee, uint256 minExecutionFee, uint256 maxExecutionFee)
//0x64174bbc EmptyRelayFeeAddress()
//0x25e34fa1 MarketAlreadyExists(bytes32 salt, address existingMarketAddress)
//0x6918f9bf MarketNotFound(address key)
//0x05fbc1ae EmptyMarket()
//0x09f8c937 DisabledMarket(address market)
//0x9da36043 MaxSwapPathLengthExceeded(uint256 swapPathLengh, uint256 maxSwapPathLength)
//0x23090a31 InsufficientPoolAmount(uint256 poolAmount, uint256 amount)
//0x315276c9 InsufficientReserve(uint256 reservedUsd, uint256 maxReservedUsd)
//0xb98c6179 InsufficientReserveForOpenInterest(uint256 reservedUsd, uint256 maxReservedUsd)
//0x7a0ca681 UnableToGetOppositeToken(address inputToken, address market)
//0x785ee469 UnexpectedTokenForVirtualInventory(address token, address market)
//0x2ee3d69c EmptyMarketTokenSupply()
//0xcb9bd134 InvalidSwapMarket(address market)
//0xbe4729a2 UnableToGetCachedTokenPrice(address token, address market)
//0xec6d89c8 CollateralAlreadyClaimed(uint256 adjustedClaimableAmount, uint256 claimedAmount)
//0x730293fd OpenInterestCannotBeUpdatedForSwapOnlyMarket(address market)
//0x2bf127cf MaxOpenInterestExceeded(uint256 openInterest, uint256 maxOpenInterest)
//0x6429ff3f MaxPoolAmountExceeded(uint256 poolAmount, uint256 maxPoolAmount)
//0xd1a942ab MaxCollateralSumExceeded(uint256 collateralSum, uint256 maxCollateralSum)
//0x46169f04 MaxPoolUsdForDepositExceeded(uint256 poolUsd, uint256 maxPoolUsdForDeposit)
//0x99b2d582 UnexpectedBorrowingFactor(uint256 positionBorrowingFactor, uint256 cumulativeBorrowingFactor)
//0x6afad778 UnableToGetBorrowingFactorEmptyPoolUsd()
//0x11423d95 UnableToGetFundingFactorEmptyOpenInterest()
//0x182e30e3 InvalidPositionMarket(address market)
//0x839c693e InvalidCollateralTokenForMarket(address market, address token)
//0xb92fb250 PnlFactorExceededForLongs(int256 pnlToPoolFactor, uint256 maxPnlFactor)
//0xb0010694 PnlFactorExceededForShorts(int256 pnlToPoolFactor, uint256 maxPnlFactor)
//0x81468139 InvalidUiFeeFactor(uint256 uiFeeFactor, uint256 maxUiFeeFactor)
//0xe474a425 EmptyAddressInMarketTokenBalanceValidation(address market, address token)
//0x33a1ea6b InvalidMarketTokenBalance(address market, address token, uint256 balance, uint256 expectedMinBalance)
//0x808c464f InvalidMarketTokenBalanceForCollateralAmount(address market, address token, uint256 balance, uint256 collateralAmount)
//0x9dd026db InvalidMarketTokenBalanceForClaimableFunding(address market, address token, uint256 balance, uint256 claimableFundingFeeAmount)
//0x3b42e952 UnexpectedPoolValue(int256 poolValue)
//0x8643d20a InsufficientImpactPoolValueForWithdrawal(uint256 withdrawalAmount, uint256 poolValue, int256 totalPendingImpactAmount)
//0x032b3d00 SequencerDown()
//0x113cfc03 SequencerGraceDurationNotYetPassed(uint256 timeSinceUp, uint256 sequencerGraceDuration)
//0x9231be69 EmptyValidatedPrices()
//0x05d102a2 InvalidOracleProvider(address provider)
//0x68b49e6c InvalidOracleProviderForToken(address provider, address expectedProvider)
//0xd90abe06 GmEmptySigner(uint256 signerIndex)
//0xdd51dc73 InvalidOracleSetPricesProvidersParam(uint256 tokensLength, uint256 providersLength)
//0xf9996e9f InvalidOracleSetPricesDataParam(uint256 tokensLength, uint256 dataLength)
//0xee6e8ecf GmInvalidBlockNumber(uint256 minOracleBlockNumber, uint256 currentBlockNumber)
//0xb8aaa455 GmInvalidMinMaxBlockNumber(uint256 minOracleBlockNumber, uint256 maxOracleBlockNumber)
//0x62e402cc EmptyDataStreamFeedId(address token)
//0xa4949e25 InvalidDataStreamFeedId(address token, bytes32 feedId, bytes32 expectedFeedId)
//0x8d56bea1 InvalidDataStreamBidAsk(address token, int192 bid, int192 ask)
//0x2a74194d InvalidDataStreamPrices(address token, int192 bid, int192 ask)
//0x2b6e7c3f MaxPriceAgeExceeded(uint256 oracleTimestamp, uint256 currentTimestamp)
//0xdd9c6b9a MaxOracleTimestampRangeExceeded(uint256 range, uint256 maxRange)
//0xdc2a99e7 GmMinOracleSigners(uint256 oracleSigners, uint256 minOracleSigners)
//0xc7b44b28 GmMaxOracleSigners(uint256 oracleSigners, uint256 maxOracleSigners)
//0x11aeaf6b BlockNumbersNotSorted(uint256 minOracleBlockNumber, uint256 prevMinOracleBlockNumber)
//0xcc7bbd5b GmMinPricesNotSorted(address token, uint256 price, uint256 prevPrice)
//0x0f885e52 GmMaxPricesNotSorted(address token, uint256 price, uint256 prevPrice)
//0xb86fffef EmptyChainlinkPriceFeedMultiplier(address token)
//0x088405c6 EmptyDataStreamMultiplier(address token)
//0x6e0c29ed InvalidDataStreamSpreadReductionFactor(address token, uint256 spreadReductionFactor)
//0xbe6514b6 InvalidFeedPrice(address token, int256 price)
//0xd6b52b60 ChainlinkPriceFeedNotUpdated(address token, uint256 timestamp, uint256 heartbeatDuration)
//0x5b1250e7 GmMaxSignerIndex(uint256 signerIndex, uint256 maxSignerIndex)
//0xa54d4339 InvalidGmOraclePrice(address token)
//0xb21c863e InvalidGmSignerMinMaxPrice(uint256 minPrice, uint256 maxPrice)
//0x993417d5 InvalidGmMedianMinMaxPrice(uint256 minPrice, uint256 maxPrice)
//0xef2df9b5 NonEmptyTokensWithPrices(uint256 tokensWithPricesLength)
//0x1608d41a InvalidMinMaxForPrice(address token, uint256 min, uint256 max)
//0x8db88ccf EmptyChainlinkPriceFeed(address token)
//0xded099de PriceAlreadySet(address token, uint256 minPrice, uint256 maxPrice)
//0x25e5dc07 InvalidBlockRangeSet(uint256 largestMinBlockNumber, uint256 smallestMaxBlockNumber)
//0x53410c43 NonAtomicOracleProvider(address provider)
//0x994fccf3 OracleAddressNotSet()
//0x663de023 InvalidPrimaryPricesForSimulation(uint256 primaryTokensLength, uint256 primaryPricesLength)
//0x4e48dcda EndOfOracleSimulation()
//0x8d648a7f InvalidGmSignature(address recoveredSigner, address expectedSigner)
//0xcd64a025 EmptyPrimaryPrice(address token)
//0x7d677abf OracleTimestampsAreSmallerThanRequired(uint256 minOracleTimestamp, uint256 expectedTimestamp)
//0xd84b8ee8 OracleTimestampsAreLargerThanRequestExpirationTime(uint256 maxOracleTimestamp, uint256 requestTimestamp, uint256 requestExpirationTime)
//0x16307797 EmptyOrder()
//0x3784f834 UnsupportedOrderType(uint256 orderType)
//0x31f47690 UnsupportedOrderTypeForAutoCancellation(uint256 orderType)
//0x3df42531 EmptySizeDeltaInTokens()
//0xf0641c92 PriceImpactLargerThanOrderSize(int256 priceImpactUsd, uint256 sizeDeltaUsd)
//0xcc32db99 NegativeExecutionPrice(int256 executionPrice, uint256 price, uint256 positionSizeInUsd, int256 priceImpactUsd, uint256 sizeDeltaUsd)
//0xe09ad0e9 OrderNotFulfillableAtAcceptablePrice(uint256 price, uint256 acceptablePrice)
//0xcf9319d6 OrderValidFromTimeNotReached(uint256 validFromTime, uint256 currentTimestamp)
//0x814991c3 UnexpectedPositionState()
//0x8a4bd513 OrderTypeCannotBeCreated(uint256 orderType)
//0x730d44b1 OrderAlreadyFrozen()
//0xc10ceac7 MaxTotalCallbackGasLimitForAutoCancelOrdersExceeded(uint256 totalCallbackGasLimit, uint256 maxTotalCallbackGasLimit)
//0x9cfea583 InvalidReceiver(address receiver)
//0x3af14617 UnexpectedValidFromTime(uint256 orderType)
//0x59485ed9 OrderNotFound(bytes32 key)
//0xcc3459ff UnexpectedMarket()
//0x19d50093 InsufficientFundsToPayForCosts(uint256 remainingCostUsd, string step)
//0x253c8c02 InvalidOutputToken(address tokenOut, address expectedTokenOut)
//0x9fbe2cbc InvalidDecreaseOrderSize(uint256 sizeDeltaUsd, uint256 positionSizeInUsd)
//0x3a61a4a9 UnableToWithdrawCollateral(int256 estimatedRemainingCollateralUsd)
//0x751951f9 InvalidDecreasePositionSwapType(uint256 decreasePositionSwapType)
//0x74cc815b InsufficientCollateralAmount(uint256 collateralAmount, int256 collateralDeltaAmount)
//0x2159b161 InsufficientCollateralUsd(int256 remainingCollateralUsd)
//0x426cfff0 PositionNotFound(bytes32 key)
//0x4dfbbff3 EmptyPosition()
//0xbff65b3f InvalidPositionSizeValues(uint256 sizeInUsd, uint256 sizeInTokens)
//0x85efb31a MinPositionSize(uint256 positionSizeInUsd, uint256 minPositionSizeUsd)
//0xeadaf93a UsdDeltaExceedsLongOpenInterest(int256 usdDelta, uint256 longOpenInterest)
//0x8af0d140 UsdDeltaExceedsShortOpenInterest(int256 usdDelta, uint256 shortOpenInterest)
//0xb611f297 ShiftNotFound(bytes32 key)
//0x6af5e96f EmptyShift()
//0x60d5e84a EmptyShiftAmount()
//0x950227bb ShiftFromAndToMarketAreEqual(address market)
//0xa38dfb2a LongTokensAreNotEqual(address fromMarketLongToken, address toMarketLongToken)
//0xf54d8776 ShortTokensAreNotEqual(address fromMarketLongToken, address toMarketLongToken)
//0x4708f070 BridgeOutNotSupportedDuringShift()
//0x2e949409 UsdDeltaExceedsPoolValue(int256 usdDelta, uint256 poolUsd)
//0xa35b150b Unauthorized(address msgSender, string role)
//0xb783c88a ThereMustBeAtLeastOneRoleAdmin()
//0x282b5b70 ThereMustBeAtLeastOneTimelockMultiSig()
//0x7363cfa5 InvalidClaimFundingFeesInput(uint256 marketsLength, uint256 tokensLength)
//0x42c0d1f2 InvalidClaimCollateralInput(uint256 marketsLength, uint256 tokensLength, uint256 timeKeysLength)
//0x5b3043dd InvalidClaimAffiliateRewardsInput(uint256 marketsLength, uint256 tokensLength)
//0x74cee48d InvalidClaimUiFeesInput(uint256 marketsLength, uint256 tokensLength)
//0x53f81711 InvalidTokenIn(address tokenIn, address market)
//0xd28d3eb5 InsufficientOutputAmount(uint256 outputAmount, uint256 minOutputAmount)
//0xa7aebadc InsufficientSwapOutputAmount(uint256 outputAmount, uint256 minOutputAmount)
//0x91c78b78 DuplicatedMarketInSwapPath(address market)
//0x75885d69 SwapPriceImpactExceedsAmountIn(uint256 amountAfterFees, int256 negativeImpactAmount)
//0x4baab816 InvalidReceiverForSubaccountOrder(address receiver, address expectedReceiver)
//0x89736584 InvalidCancellationReceiverForSubaccountOrder(address cancellationReceiver, address expectedCancellationReceiver)
//0x9be0a43c SubaccountNotAuthorized(address account, address subaccount)
//0x519ba753 MaxSubaccountActionCountExceeded(address account, address subaccount, uint256 count, uint256 maxCount)
//0x9b539f07 SubaccountApprovalExpired(address account, address subaccount, uint256 deadline, uint256 currentTimestamp)
//0x34e5c9e2 SubaccountIntegrationIdDisabled(bytes32 integrationId)
//0x979dc780 TokenTransferError(address token, address receiver, uint256 amount)
//0xe9b78bd4 EmptyHoldingAddress()
//0x9fc297fa EmptyTokenTranferGasLimit(address token)
//0xdd7016a2 EmptyAccount()
//0xd551823d EmptyReceiver()
//0xc92f6438 DataListLengthExceeded()
//0x0d143458 EmptyAmount()
//0x7c8cdbf9 EmptyClaimableAmount(address token)
//0x961c9a4f InvalidToken(address token)
//0xa8c278dd InvalidParams(string reason)
//0x9fc47b77 InsufficientFunds(address token)
//0x6ac60b4a InvalidClaimTermsSignature(address recoveredSigner, address expectedSigner)
//0x500016f0 InvalidClaimTermsSignatureForContract(address expectedSigner)
//0xfd795fc1 DuplicateClaimTerms(uint256 existingDistributionId)
//0xd2e229e6 SwapsNotAllowedForAtomicWithdrawal(uint256 longTokenSwapPathLength, uint256 shortTokenSwapPathLength)
//0x60737bc0 WithdrawalNotFound(bytes32 key)
//0x6d4bb5e9 EmptyWithdrawal()
//0x01d6f7b1 EmptyWithdrawalAmount()
//0xf442c0bc MinLongTokens(uint256 received, uint256 expected)
//0xb4a196af MinShortTokens(uint256 received, uint256 expected)
//0x82c8828a InsufficientMarketTokens(uint256 balance, uint256 expected)
//0x90a6af3b InvalidPoolValueForWithdrawal(int256 poolValue)
//0xca42750e MaxLendableFactorForWithdrawalsExceeded(uint256 poolUsd, uint256 maxLendableUsd, uint256 lentUsd)
//0x143e2156 MaskIndexOutOfBounds(uint256 index, string label)
//0xd4064737 DuplicatedIndex(uint256 index, string label)
//0x0e92b837 Uint256AsBytesLengthExceeds32Bytes(uint256 length)
//0x7bf8d2b3 SyncConfigInvalidInputLengths(uint256 marketsLength, uint256 parametersLength)
//0x8b3d4655 SyncConfigUpdatesDisabledForMarket(address market)
//0x8ea7eb18 SyncConfigUpdatesDisabledForParameter(string parameter)
//0x0798d283 SyncConfigUpdatesDisabledForMarketParameter(address market, string parameter)
//0x624b5b13 SyncConfigInvalidMarketFromData(address market, address marketFromData)
//0xeb1947dd EmptyMarketPrice(address market)
//0xb0731c3f InvalidTransferRequestsLength()
//0x14c35d93 EmptyMultichainTransferInAmount(address account, address token)
//0x7a29de11 EmptyMultichainTransferOutAmount(address account, address token)
//0x4ac6d095 InsufficientMultichainBalance(address account, address token, uint256 balance, uint256 amount)
//0x2c9bcbdd InvalidSrcChainId(uint256 srcChainId)
//0x3ee39805 InvalidEid(uint256 eid)
//0xc3776a2c InvalidDestinationChainId(uint256 desChainId)
//0x7344d981 TokenPermitsNotAllowedForMultichain()
//0xadc06ae7 InvalidInitializer()
//0x2314a6e3 InvalidMultichainProvider(address provider)
//0x9c9a99db InvalidMultichainEndpoint(address endpoint)
//0x519e91bb ReferralCodeAlreadyExists(bytes32 code)
//0x68fb0fed UnableToPayOrderFee()
//0xde27e626 UnableToPayOrderFeeFromCollateral()
//0x2877599b InvalidBridgeOutToken(address token)
//0xa458261b InsufficientFee(uint256 feeProvided, uint256 feeRequired)
//0x2a34f7fe InvalidSignature(string signatureType)
//0x2416afa9 InvalidRecoveredSigner(string signatureType, address recovered, address recoveredFromMinified, address expectedSigner)
//0xa9721241 UnexpectedRelayFeeTokenAfterSwap(address feeToken, address expectedFeeToken)
//0xe949114e UnexpectedRelayFeeToken(address feeToken, address expectedFeeToken)
//0x0d0fcc0b UnsupportedRelayFeeToken(address feeToken, address expectedFeeToken)
//0x3c0ac199 InvalidPermitSpender(address spender, address expectedSpender)
//0x1041c08a InvalidUserDigest(bytes32 digest)
//0x26025b4e SubaccountApprovalDeadlinePassed(uint256 currentTimestamp, uint256 deadline)
//0x3044992f InvalidSubaccountApprovalNonce(uint256 storedNonce, uint256 nonce)
//0x7db6c745 InvalidSubaccountApprovalDesChainId(uint256 desChainId)
//0x83f2ba20 DeadlinePassed(uint256 currentTimestamp, uint256 deadline)
//0x9cd76295 InsufficientRelayFee(uint256 requiredRelayFee, uint256 availableFeeAmount)
//0x545e8f2b InvalidSubaccountApprovalSubaccount()
//0x28f773e9 NonEmptyExternalCallsForSubaccountOrder()
//0xeeadc89d EventItemNotFound(string key)
//0x9e5d5cf3 InvalidTrustedSignerAddress()
//0x8a1cc36b InvalidEdgeSigner()
//0x545e155f InvalidEdgeSignature(uint256 recoverError)
//0xe75fc463 InvalidEdgeDataStreamBidAsk(address token, uint256 bid, uint256 ask)
//0x4234439c InvalidEdgeDataStreamPrices(address token, uint256 bid, uint256 ask)
//0x8bb5c4bf InvalidEdgeDataStreamExpo(int256 expo)
//0x25eeb47a RelayEmptyBatch()
//0xb09ace9a RelayCalldataTooLong(uint256 calldataLength)
//0xec7fd385 InvalidExternalCalls(uint256 sendTokensLength, uint256 sendAmountsLength)
//0xc0471bf8 MaxRelayFeeSwapForSubaccountExceeded(uint256 feeUsd, uint256 maxFeeUsd)
//0x7290c82f RemovalShouldNotBeSkipped(bytes32 listKey, bytes32 entityKey)
//0x77f8f169 InsufficientMultichainNativeFee(uint256 msgValue)
//0xb2db7048 EmptyPeer(uint32 eid)
//0x53d1caca FeeDistributionAlreadyCompleted(uint256 lastDistributionTime, uint256 startOfCurrentWeek)
//0xef84cb99 OutdatedReadResponse(uint256 timestamp)
//0x8695f464 InvalidDistributionState(uint256 distributionStateUint)
//0xa5123802 BridgedAmountNotSufficient(uint256 minRequiredFeeAmount, uint256 currentChainFeeAmount)
//0x98984b37 BridgingTransactionFailed(bytes result)
//0xe6685115 MaxWntReferralRewardsInUsdAmountExceeded(uint256 wntReferralRewardsInUsd, uint256 maxWntReferralRewardsInUsdAmount)
//0x30ae0954 MaxWntReferralRewardsInUsdExceeded(uint256 wntReferralRewardsInUsd, uint256 maxWntReferralRewardsInUsd)
//0xb96d6372 MaxEsGmxReferralRewardsAmountExceeded(uint256 tokensForReferralRewards, uint256 maxEsGmxReferralRewards)
//0xc1fa6843 MaxReferralRewardsExceeded(address token, uint256 cumulativeTransferAmount, uint256 tokensForReferralRewards)
//0x89a90794 MaxWntFromTreasuryExceeded(uint256 maxWntFromTreasury, uint256 additionalWntFromTreasury)
//0x1f983722 KeeperArrayLengthMismatch(uint256 keepersLength, uint256 keeperTargetBalancesLength, uint256 keeperVersionsLength)
//0xf0b8da75 SendEthToKeeperFailed(address keeper, uint256 sendAmount, bytes result)
//0x088e379a KeeperAmountMismatch(uint256 wntForKeepers, uint256 wntToKeepers)
//0x97a3eeff AttemptedBridgeAmountTooHigh(uint256 minRequiredFeeAmount, uint256 feeAmountCurrentChain, uint256 amountToBridgeOut)
//0xbfb09088 InvalidReferralRewardToken(address token)
//0xbd3b23af BridgingBalanceArrayMismatch(uint256 balancesLength, uint256 targetBalancesLength)
//0xa3b900da ZeroTreasuryAddress()