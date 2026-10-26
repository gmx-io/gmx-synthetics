// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../chain/Chain.sol";
import "../error/Errors.sol";
import "../event/EventUtils.sol";
import "../exchange/BaseHandler.sol";
import "../glv/GlvEventUtils.sol";
import "../glv/GlvToken.sol";
import "../glv/GlvUtils.sol";
import "../market/MarketPoolValueInfo.sol";
import "../market/MarketStoreUtils.sol";
import "../market/MarketToken.sol";
import "../market/MarketUtils.sol";
import "../utils/Cast.sol";
import "../utils/Precision.sol";

// @title GlvDonationHandler
// @dev Allows an authorized keeper to donate GM tokens to a configured GLV and
// synchronize the GLV's recorded GM balance atomically, without minting GLV tokens.
contract GlvDonationHandler is BaseHandler {
    using SafeERC20 for IERC20;
    using SafeCast for int256;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.BoolItems;

    error GlvDonationDisabled(address glv, address market);
    error EmptyGlvDonationFundingAccount(address glv, address market);
    error InvalidMaxGlvDonationFactor(address glv, address market, uint256 factor);
    error EmptyGlvDonationPeriodDuration(address glv, address market);
    error EmptyMaxGlvDonationAmountPerPeriod(address glv, address market);
    error EmptyGlvDonationValue(address glv, address market, uint256 amount);
    error EmptyCirculatingGlvTokenSupply();
    error MaxGlvDonationFactorExceeded(
        address glv,
        address market,
        uint256 donationUsd,
        uint256 maxDonationUsd
    );
    error MaxGlvDonationAmountPerPeriodExceeded(
        address glv,
        address market,
        uint256 periodId,
        uint256 nextAmount,
        uint256 maxAmount
    );
    error UnexpectedGlvDonationTokenBalance(
        address glv,
        address market,
        uint256 recordedBalance,
        uint256 actualBalance
    );
    error UnexpectedGlvDonationReceivedAmount(
        address glv,
        address market,
        uint256 expectedAmount,
        uint256 receivedAmount
    );

    bytes32 public constant DONATION_KEEPER = keccak256(abi.encode("DONATION_KEEPER"));

    struct GlvDonationConfig {
        address fundingAccount;
        bool isEnabled;
        // 30-decimal factor applied to the GLV's minimized pre-donation USD value.
        uint256 maxDonationFactor;
        uint256 donationPeriodDuration;
        // Absolute GM token amount for the configured GLV-market pair.
        uint256 maxDonationAmountPerPeriod;
    }

    struct GlvDonationState {
        uint256 periodId;
        uint256 donatedAmount;
    }

    struct DonationExecutionData {
        uint256 minGlvValue;
        uint256 maxGlvValue;
        uint256 glvSupply;
        uint256 marketPoolValue;
        uint256 marketTokenSupply;
        uint256 donationUsd;
        uint256 maxDonationUsd;
        uint256 periodId;
        uint256 nextDonatedAmount;
        uint256 recordedBalance;
        uint256 nextBalance;
        uint256 balanceIncrease;
        uint256 balanceIncreaseUsd;
        bool glvTokenPriceUsed;
    }

    mapping(address glv => mapping(address market => GlvDonationConfig config)) private glvDonationConfigs;
    mapping(address glv => mapping(address market => GlvDonationState state)) private glvDonationStates;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IOracle _oracle
    ) BaseHandler(_roleStore, _dataStore, _eventEmitter, _oracle) {}

    modifier onlyDonationKeeper() {
        _validateRole(DONATION_KEEPER, "DONATION_KEEPER");
        _;
    }

    // @dev Configures donations of a supported market's GM token to a GLV.
    // The funding account must separately approve this contract to spend the GM token.
    // maxDonationFactor limits each donation relative to the GLV's minimized pre-donation USD value.
    // maxDonationAmountPerPeriod is denominated in GM tokens and period boundaries are
    // aligned to Unix time.
    function setGlvDonationConfig(
        address glvAddress,
        address marketAddress,
        address fundingAccount,
        uint256 maxDonationFactor,
        uint256 donationPeriodDuration,
        uint256 maxDonationAmountPerPeriod,
        bool isEnabled
    ) external globalNonReentrant onlyConfigKeeper {
        GlvUtils.validateGlv(dataStore, glvAddress);

        Market.Props memory market = MarketStoreUtils.get(dataStore, marketAddress);
        if (market.marketToken == address(0)) {
            revert Errors.MarketNotFound(marketAddress);
        }

        if (isEnabled) {
            MarketUtils.validateEnabledMarket(dataStore, market);
            GlvUtils.validateGlvMarket(dataStore, glvAddress, marketAddress, true);

            if (fundingAccount == address(0)) {
                revert EmptyGlvDonationFundingAccount(glvAddress, marketAddress);
            }

            if (maxDonationFactor == 0 || maxDonationFactor > Precision.FLOAT_PRECISION) {
                revert InvalidMaxGlvDonationFactor(glvAddress, marketAddress, maxDonationFactor);
            }

            if (donationPeriodDuration == 0) {
                revert EmptyGlvDonationPeriodDuration(glvAddress, marketAddress);
            }

            if (maxDonationAmountPerPeriod == 0) {
                revert EmptyMaxGlvDonationAmountPerPeriod(glvAddress, marketAddress);
            }
        }

        // A period ID is derived from donationPeriodDuration. Reset the current
        // donation state when the duration changes so quota reuse does not depend
        // on whether the old and new durations happen to produce the same ID.
        if (glvDonationConfigs[glvAddress][marketAddress].donationPeriodDuration != donationPeriodDuration) {
            delete glvDonationStates[glvAddress][marketAddress];
        }

        glvDonationConfigs[glvAddress][marketAddress] = GlvDonationConfig({
            fundingAccount: fundingAccount,
            isEnabled: isEnabled,
            maxDonationFactor: maxDonationFactor,
            donationPeriodDuration: donationPeriodDuration,
            maxDonationAmountPerPeriod: maxDonationAmountPerPeriod
        });

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "glv", glvAddress);
        eventData.addressItems.setItem(1, "market", marketAddress);
        eventData.addressItems.setItem(2, "fundingAccount", fundingAccount);
        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "maxDonationFactor", maxDonationFactor);
        eventData.uintItems.setItem(1, "donationPeriodDuration", donationPeriodDuration);
        eventData.uintItems.setItem(2, "maxDonationAmountPerPeriod", maxDonationAmountPerPeriod);
        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "isEnabled", isEnabled);
        eventEmitter.emitEventLog2(
            "SetGlvDonationConfig",
            Cast.toBytes32(glvAddress),
            Cast.toBytes32(marketAddress),
            eventData
        );
    }

    // @dev Pulls GM tokens from the configured funding account, transfers them directly
    // to the GLV, and synchronizes the GLV's recorded balance in the same transaction.
    // No GLV tokens are minted, so the donation increases the value of existing GLV tokens.
    // Oracle prices are required for the GLV value, the donated GM value and GLV balance caps.
    function donate(
        address glvAddress,
        address marketAddress,
        uint256 amount,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external globalNonReentrant onlyDonationKeeper withOraclePrices(oracleParams) {
        if (amount == 0) {
            revert Errors.EmptyAmount();
        }

        GlvUtils.validateGlv(dataStore, glvAddress);
        Market.Props memory market = MarketUtils.getEnabledMarket(dataStore, marketAddress);
        GlvUtils.validateGlvMarket(dataStore, glvAddress, marketAddress, true);

        GlvDonationConfig memory config = glvDonationConfigs[glvAddress][marketAddress];
        if (!config.isEnabled) {
            revert GlvDonationDisabled(glvAddress, marketAddress);
        }

        DonationExecutionData memory execution;

        execution.glvSupply = GlvToken(payable(glvAddress)).totalSupply();
        if (execution.glvSupply == 0) {
            revert Errors.EmptyGlvTokenSupply();
        }

        // Bootstrap GLV is locked at address(1). Require supply outside that address
        // so donations cannot accrue entirely to inaccessible bootstrap shares.
        uint256 deadSupply = GlvToken(payable(glvAddress)).balanceOf(address(1));
        if (execution.glvSupply <= deadSupply) {
            revert EmptyCirculatingGlvTokenSupply();
        }

        execution.marketTokenSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(marketAddress)));
        if (execution.marketTokenSupply == 0) {
            revert Errors.EmptyMarketTokenSupply();
        }

        // Use the lower GLV value for the limit and the upper donated GM value below,
        // so oracle spreads cannot increase the allowed donation relative to the GLV.
        // A second donation to the same GLV inside one batch misprices GlvUtils.getGlvValue
        // when the calls supply a signed GLV price. That price is not refreshed after the
        // first donation, so the later cap uses the pre-batch value.
        (execution.minGlvValue, execution.glvTokenPriceUsed) = GlvUtils.getGlvValue(
            dataStore,
            oracle,
            glvAddress,
            false, // maximize
            true // allowZeroPoolBorrowingFactor
        );
        // Keep event valuation separate from the conservative limit calculation.
        // The post-donation event adds a maximized GM value to this maximized GLV value.
        (execution.maxGlvValue, ) = GlvUtils.getGlvValue(
            dataStore,
            oracle,
            glvAddress,
            true, // maximize
            true // allowZeroPoolBorrowingFactor
        );

        execution.marketPoolValue = _getMarketPoolValue(glvAddress, market);

        execution.donationUsd = MarketUtils.marketTokenAmountToUsd(
            amount,
            execution.marketPoolValue,
            execution.marketTokenSupply
        );
        if (execution.donationUsd == 0) {
            revert EmptyGlvDonationValue(glvAddress, marketAddress, amount);
        }

        execution.maxDonationUsd = Precision.applyFactor(execution.minGlvValue, config.maxDonationFactor);
        if (execution.donationUsd > execution.maxDonationUsd) {
            revert MaxGlvDonationFactorExceeded(
                glvAddress,
                marketAddress,
                execution.donationUsd,
                execution.maxDonationUsd
            );
        }

        (execution.periodId, execution.nextDonatedAmount) = _validateAndUpdatePeriod(
            glvAddress,
            marketAddress,
            amount,
            config.donationPeriodDuration,
            config.maxDonationAmountPerPeriod
        );

        execution.recordedBalance = GlvToken(payable(glvAddress)).tokenBalances(marketAddress);
        (execution.nextBalance, execution.balanceIncrease) = _transferAndSync(
            glvAddress,
            marketAddress,
            config.fundingAccount,
            amount,
            execution.recordedBalance
        );
        execution.balanceIncreaseUsd = MarketUtils.marketTokenAmountToUsd(
            execution.balanceIncrease,
            execution.marketPoolValue,
            execution.marketTokenSupply
        );

        GlvUtils.validateGlvMarketTokenBalance(
            dataStore,
            glvAddress,
            market,
            execution.marketPoolValue,
            execution.marketTokenSupply
        );

        _emitGlvDonation(glvAddress, marketAddress, config.fundingAccount, amount, execution);
    }

    function getGlvDonationConfig(
        address glvAddress,
        address marketAddress
    ) external view returns (GlvDonationConfig memory) {
        return glvDonationConfigs[glvAddress][marketAddress];
    }

    function getGlvDonationState(
        address glvAddress,
        address marketAddress
    ) external view returns (GlvDonationState memory) {
        GlvDonationState memory state = glvDonationStates[glvAddress][marketAddress];
        uint256 donationPeriodDuration = glvDonationConfigs[glvAddress][marketAddress].donationPeriodDuration;
        if (donationPeriodDuration == 0) {
            return state;
        }

        uint256 currentPeriodId = Chain.currentTimestamp() / donationPeriodDuration;
        if (state.periodId != currentPeriodId) {
            return GlvDonationState({periodId: currentPeriodId, donatedAmount: 0});
        }

        return state;
    }

    function _getMarketPoolValue(
        address glvAddress,
        Market.Props memory market
    ) private view returns (uint256) {
        // Validate the donated market independently: GLV valuation may use a signed
        // price or skip this market when the GLV does not yet hold its GM tokens.
        MarketPoolValueInfo.Props memory marketPoolValueInfo = MarketUtils.getPoolValueInfo(
            dataStore,
            market,
            oracle.getPrimaryPrice(market.indexToken),
            oracle.getPrimaryPrice(market.longToken),
            oracle.getPrimaryPrice(market.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            false, // maximize
            true // allowZeroPoolBorrowingFactor
        );
        if (marketPoolValueInfo.poolValue < 0) {
            revert Errors.GlvNegativeMarketPoolValue(glvAddress, market.marketToken);
        }

        // The upper value conservatively measures both the donation and the GLV's
        // resulting market balance against their respective USD limits.
        marketPoolValueInfo = MarketUtils.getPoolValueInfo(
            dataStore,
            market,
            oracle.getPrimaryPrice(market.indexToken),
            oracle.getPrimaryPrice(market.longToken),
            oracle.getPrimaryPrice(market.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
            true, // maximize
            true // allowZeroPoolBorrowingFactor
        );
        if (marketPoolValueInfo.poolValue < 0) {
            revert Errors.GlvNegativeMarketPoolValue(glvAddress, market.marketToken);
        }

        return marketPoolValueInfo.poolValue.toUint256();
    }

    function _validateAndUpdatePeriod(
        address glvAddress,
        address marketAddress,
        uint256 amount,
        uint256 donationPeriodDuration,
        uint256 maxDonationAmountPerPeriod
    ) private returns (uint256 periodId, uint256 nextDonatedAmount) {
        periodId = Chain.currentTimestamp() / donationPeriodDuration;
        GlvDonationState storage state = glvDonationStates[glvAddress][marketAddress];
        uint256 donatedAmount = state.periodId == periodId ? state.donatedAmount : 0;
        nextDonatedAmount = donatedAmount + amount;
        if (nextDonatedAmount > maxDonationAmountPerPeriod) {
            revert MaxGlvDonationAmountPerPeriodExceeded(
                glvAddress,
                marketAddress,
                periodId,
                nextDonatedAmount,
                maxDonationAmountPerPeriod
            );
        }

        state.periodId = periodId;
        state.donatedAmount = nextDonatedAmount;
    }

    function _transferAndSync(
        address glvAddress,
        address marketAddress,
        address fundingAccount,
        uint256 amount,
        uint256 recordedBalance
    ) private returns (uint256 nextBalance, uint256 balanceIncrease) {
        uint256 actualBalanceBefore = IERC20(marketAddress).balanceOf(glvAddress);
        // A positive difference may be caused by a direct, permissionless GM transfer.
        // It is included in the sync and emitted GLV value so a small surplus cannot
        // permanently block authorized donations. A deficit is unexpected for GM tokens
        // and must be resolved by governance before donation accounting can continue.
        if (actualBalanceBefore < recordedBalance) {
            revert UnexpectedGlvDonationTokenBalance(
                glvAddress,
                marketAddress,
                recordedBalance,
                actualBalanceBefore
            );
        }

        IERC20(marketAddress).safeTransferFrom(fundingAccount, glvAddress, amount);

        uint256 actualBalanceAfter = IERC20(marketAddress).balanceOf(glvAddress);
        uint256 receivedAmount = actualBalanceAfter > actualBalanceBefore ? actualBalanceAfter - actualBalanceBefore : 0;
        if (receivedAmount != amount) {
            revert UnexpectedGlvDonationReceivedAmount(glvAddress, marketAddress, amount, receivedAmount);
        }

        nextBalance = GlvToken(payable(glvAddress)).syncTokenBalance(marketAddress);
        if (nextBalance < recordedBalance) {
            revert UnexpectedGlvDonationTokenBalance(
                glvAddress,
                marketAddress,
                recordedBalance,
                nextBalance
            );
        }

        balanceIncrease = nextBalance - recordedBalance;
    }

    function _emitGlvDonation(
        address glvAddress,
        address marketAddress,
        address fundingAccount,
        uint256 amount,
        DonationExecutionData memory execution
    ) private {
        uint256 nextGlvValue = execution.maxGlvValue + execution.balanceIncreaseUsd;

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "glv", glvAddress);
        eventData.addressItems.setItem(1, "market", marketAddress);
        eventData.addressItems.setItem(2, "fundingAccount", fundingAccount);
        eventData.uintItems.initItems(11);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.uintItems.setItem(1, "donationUsd", execution.donationUsd);
        eventData.uintItems.setItem(2, "nextMarketTokenBalance", execution.nextBalance);
        eventData.uintItems.setItem(3, "glvValue", nextGlvValue);
        eventData.uintItems.setItem(4, "glvSupply", execution.glvSupply);
        eventData.uintItems.setItem(5, "maxDonationUsd", execution.maxDonationUsd);
        eventData.uintItems.setItem(6, "periodId", execution.periodId);
        eventData.uintItems.setItem(7, "donatedAmountInPeriod", execution.nextDonatedAmount);
        eventData.uintItems.setItem(8, "marketTokenSupply", execution.marketTokenSupply);
        eventData.uintItems.setItem(9, "balanceIncrease", execution.balanceIncrease);
        eventData.uintItems.setItem(10, "balanceIncreaseUsd", execution.balanceIncreaseUsd);
        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "glvTokenPriceUsed", execution.glvTokenPriceUsed);
        eventEmitter.emitEventLog2(
            "GlvDonation",
            Cast.toBytes32(glvAddress),
            Cast.toBytes32(marketAddress),
            eventData
        );

        GlvEventUtils.emitGlvValueUpdated(eventEmitter, glvAddress, nextGlvValue, execution.glvSupply);
    }
}
