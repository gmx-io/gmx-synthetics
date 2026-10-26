// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../chain/Chain.sol";
import "../data/DataStore.sol";
import "../data/Keys.sol";
import "../error/Errors.sol";
import "../event/EventEmitter.sol";
import "../market/Market.sol";
import "../market/MarketPoolValueInfo.sol";
import "../market/MarketStoreUtils.sol";
import "../market/MarketToken.sol";
import "../market/MarketUtils.sol";
import "../oracle/IOracle.sol";
import "../oracle/OracleModule.sol";
import "../oracle/OracleUtils.sol";
import "../role/RoleModule.sol";
import "../utils/Cast.sol";
import "../utils/GlobalReentrancyGuard.sol";
import "../utils/Precision.sol";

// @title MarketPoolDonationHandler
// @dev Allows an authorized keeper to donate the single pool token to a configured market
// without minting additional market tokens.
contract MarketPoolDonationHandler is RoleModule, GlobalReentrancyGuard, OracleModule {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;

    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.BoolItems;

    error InvalidMarketPoolDonationMarket(address market, address longToken, address shortToken);
    error MarketPoolDonationDisabled(address market);
    error MarketPoolDonationVirtualInventoryNotSupported(address market, bytes32 virtualMarketId);
    error EmptyMarketPoolDonationFundingAccount(address market);
    error EmptyCirculatingMarketTokenSupply();
    error InvalidMaxMarketPoolDonationFactor(address market, uint256 factor);
    error InvalidMarketPoolDonationPoolValue(address market, int256 poolValue);
    error EmptyMarketPoolDonationPeriodDuration(address market);
    error EmptyMaxMarketPoolDonationAmountPerPeriod(address market);
    error MaxMarketPoolDonationFactorExceeded(address market, uint256 amount, uint256 maxAmount);
    error MaxMarketPoolDonationAmountPerPeriodExceeded(
        address market,
        uint256 periodId,
        uint256 nextAmount,
        uint256 maxAmount
    );
    error UnexpectedMarketPoolDonationReceivedAmount(
        address market,
        address token,
        uint256 expectedAmount,
        uint256 receivedAmount
    );

    bytes32 public constant DONATION_KEEPER = keccak256(abi.encode("DONATION_KEEPER"));

    struct MarketPoolDonationConfig {
        address fundingAccount;
        bool isEnabled;
        uint256 maxDonationFactor;
        uint256 donationPeriodDuration;
        uint256 maxDonationAmountPerPeriod;
    }

    struct MarketPoolDonationState {
        uint256 periodId;
        uint256 donatedAmount;
    }

    struct DonationExecutionData {
        address token;
        uint256 marketTokenSupply;
        uint256 maxDonationAmount;
        uint256 periodId;
        uint256 nextDonatedAmount;
        uint256 nextPoolAmount;
    }

    EventEmitter public immutable eventEmitter;

    mapping(address market => MarketPoolDonationConfig config) private marketPoolDonationConfigs;
    mapping(address market => MarketPoolDonationState state) private marketPoolDonationStates;

    constructor(
        RoleStore _roleStore,
        DataStore _dataStore,
        EventEmitter _eventEmitter,
        IOracle _oracle
    ) RoleModule(_roleStore) GlobalReentrancyGuard(_dataStore) OracleModule(_oracle) {
        eventEmitter = _eventEmitter;
    }

    modifier onlyDonationKeeper() {
        _validateRole(DONATION_KEEPER, "DONATION_KEEPER");
        _;
    }

    // @dev Configures donations for a single-token market.
    // The funding account must separately approve this contract to spend the pool token.
    // maxDonationFactor is a 30-decimal factor applied to the pre-donation net pool value
    // using minimized withdrawal valuation. The donation is valued at the pool token's maximum price.
    // maxDonationAmountPerPeriod is an absolute token amount and period boundaries are aligned to Unix time.
    function setMarketPoolDonationConfig(
        address marketAddress,
        address fundingAccount,
        uint256 maxDonationFactor,
        uint256 donationPeriodDuration,
        uint256 maxDonationAmountPerPeriod,
        bool isEnabled
    ) external globalNonReentrant onlyConfigKeeper {
        Market.Props memory market = MarketStoreUtils.get(dataStore, marketAddress);
        if (market.marketToken == address(0)) {
            revert Errors.MarketNotFound(marketAddress);
        }

        if (isEnabled) {
            MarketUtils.validateEnabledMarket(dataStore, market);
            _validateSingleTokenMarket(market);
            _validateNoVirtualInventory(marketAddress);

            if (fundingAccount == address(0)) {
                revert EmptyMarketPoolDonationFundingAccount(marketAddress);
            }

            if (maxDonationFactor == 0 || maxDonationFactor > Precision.FLOAT_PRECISION) {
                revert InvalidMaxMarketPoolDonationFactor(marketAddress, maxDonationFactor);
            }

            if (donationPeriodDuration == 0) {
                revert EmptyMarketPoolDonationPeriodDuration(marketAddress);
            }

            if (maxDonationAmountPerPeriod == 0) {
                revert EmptyMaxMarketPoolDonationAmountPerPeriod(marketAddress);
            }
        }

        // A period ID is derived from donationPeriodDuration. Reset the current
        // donation state when the duration changes so quota reuse does not depend
        // on whether the old and new durations happen to produce the same ID.
        if (marketPoolDonationConfigs[marketAddress].donationPeriodDuration != donationPeriodDuration) {
            delete marketPoolDonationStates[marketAddress];
        }

        marketPoolDonationConfigs[marketAddress] = MarketPoolDonationConfig({
            fundingAccount: fundingAccount,
            isEnabled: isEnabled,
            maxDonationFactor: maxDonationFactor,
            donationPeriodDuration: donationPeriodDuration,
            maxDonationAmountPerPeriod: maxDonationAmountPerPeriod
        });

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "market", marketAddress);
        eventData.addressItems.setItem(1, "fundingAccount", fundingAccount);
        eventData.addressItems.setItem(2, "token", market.longToken);
        eventData.uintItems.initItems(3);
        eventData.uintItems.setItem(0, "maxDonationFactor", maxDonationFactor);
        eventData.uintItems.setItem(1, "donationPeriodDuration", donationPeriodDuration);
        eventData.uintItems.setItem(2, "maxDonationAmountPerPeriod", maxDonationAmountPerPeriod);
        eventData.boolItems.initItems(1);
        eventData.boolItems.setItem(0, "isEnabled", isEnabled);
        eventEmitter.emitEventLog1(
            "SetMarketPoolDonationConfig",
            Cast.toBytes32(marketAddress),
            eventData
        );
    }

    // @dev Pulls the configured market's underlying pool token from the funding account and accounts it as pool liquidity.
    // No market tokens are minted, so the donation increases the value of all existing market tokens.
    // Oracle prices are required to checkpoint borrowing and enforce the net pool-value donation cap.
    function donate(
        address marketAddress,
        uint256 amount,
        OracleUtils.SetPricesParams calldata oracleParams
    ) external globalNonReentrant onlyDonationKeeper withOraclePrices(oracleParams) {
        _donate(marketAddress, amount);
    }

    function _donate(address marketAddress, uint256 amount) private {
        if (amount == 0) {
            revert Errors.EmptyAmount();
        }

        Market.Props memory market = MarketUtils.getEnabledMarket(dataStore, marketAddress);
        _validateSingleTokenMarket(market);
        _validateNoVirtualInventory(marketAddress);

        MarketPoolDonationConfig memory config = marketPoolDonationConfigs[marketAddress];
        if (!config.isEnabled) {
            revert MarketPoolDonationDisabled(marketAddress);
        }

        DonationExecutionData memory execution;
        execution.marketTokenSupply = MarketUtils.getMarketTokenSupply(MarketToken(payable(marketAddress)));
        // Bootstrap GM is locked at address(1). Require supply outside that address
        // so donations cannot accrue entirely to inaccessible bootstrap shares.
        uint256 deadSupply = MarketToken(payable(marketAddress)).balanceOf(address(1));
        if (execution.marketTokenSupply <= deadSupply) {
            revert EmptyCirculatingMarketTokenSupply();
        }

        execution.token = market.longToken;
        // Checkpoint both borrowing sides before valuing the pool or changing its liquidity.
        // This preserves fees accrued at the pre-donation utilization rate.
        _checkpointBorrowing(market);
        execution.maxDonationAmount = _getMaxDonationAmount(market, config.maxDonationFactor);
        if (amount > execution.maxDonationAmount) {
            revert MaxMarketPoolDonationFactorExceeded(marketAddress, amount, execution.maxDonationAmount);
        }

        execution.periodId = Chain.currentTimestamp() / config.donationPeriodDuration;
        MarketPoolDonationState storage state = marketPoolDonationStates[marketAddress];
        uint256 donatedAmount = state.periodId == execution.periodId ? state.donatedAmount : 0;
        execution.nextDonatedAmount = donatedAmount + amount;
        if (execution.nextDonatedAmount > config.maxDonationAmountPerPeriod) {
            revert MaxMarketPoolDonationAmountPerPeriodExceeded(
                marketAddress,
                execution.periodId,
                execution.nextDonatedAmount,
                config.maxDonationAmountPerPeriod
            );
        }

        state.periodId = execution.periodId;
        state.donatedAmount = execution.nextDonatedAmount;

        uint256 balanceBefore = IERC20(execution.token).balanceOf(marketAddress);
        IERC20(execution.token).safeTransferFrom(config.fundingAccount, marketAddress, amount);
        uint256 balanceAfter = IERC20(execution.token).balanceOf(marketAddress);
        uint256 receivedAmount = balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0;

        if (receivedAmount != amount) {
            revert UnexpectedMarketPoolDonationReceivedAmount(
                marketAddress,
                execution.token,
                amount,
                receivedAmount
            );
        }

        execution.nextPoolAmount = MarketUtils.applyDeltaToPoolAmount(
            dataStore,
            eventEmitter,
            market,
            execution.token,
            amount.toInt256()
        );
        MarketUtils.validatePoolAmount(dataStore, market, execution.token);

        EventUtils.EventLogData memory eventData;
        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "market", marketAddress);
        eventData.addressItems.setItem(1, "fundingAccount", config.fundingAccount);
        eventData.addressItems.setItem(2, "token", execution.token);
        eventData.uintItems.initItems(6);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.uintItems.setItem(1, "nextPoolAmount", execution.nextPoolAmount);
        eventData.uintItems.setItem(2, "marketTokenSupply", execution.marketTokenSupply);
        eventData.uintItems.setItem(3, "maxDonationAmount", execution.maxDonationAmount);
        eventData.uintItems.setItem(4, "periodId", execution.periodId);
        eventData.uintItems.setItem(5, "donatedAmountInPeriod", execution.nextDonatedAmount);
        eventEmitter.emitEventLog2(
            "MarketPoolDonation",
            Cast.toBytes32(marketAddress),
            Cast.toBytes32(config.fundingAccount),
            eventData
        );
    }

    function _getMaxDonationAmount(
        Market.Props memory market,
        uint256 maxDonationFactor
    ) private view returns (uint256) {
        MarketPoolValueInfo.Props memory poolValueInfo = MarketUtils.getPoolValueInfo(
            dataStore,
            market,
            oracle.getPrimaryPrice(market.indexToken),
            oracle.getPrimaryPrice(market.longToken),
            oracle.getPrimaryPrice(market.shortToken),
            Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
            false, // maximize
            true // allowZeroPoolBorrowingFactor
        );
        if (poolValueInfo.poolValue <= 0) {
            revert InvalidMarketPoolDonationPoolValue(market.marketToken, poolValueInfo.poolValue);
        }

        // Gross liquidity can greatly exceed GM equity after PnL and impact-pool liabilities.
        // Cap the donation's maximum USD value against minimum pre-donation net equity so
        // the gross-liquidity ratio cannot amplify its price effect. Both divisions round down.
        uint256 maxDonationUsd = Precision.applyFactor(poolValueInfo.poolValue.toUint256(), maxDonationFactor);
        return maxDonationUsd / oracle.getPrimaryPrice(market.longToken).max;
    }

    function _checkpointBorrowing(Market.Props memory market) private {
        MarketUtils.MarketPrices memory prices = MarketUtils.getMarketPrices(oracle, market);
        MarketUtils.updateCumulativeBorrowingFactor(
            dataStore,
            eventEmitter,
            market,
            prices,
            true, // isLong
            true // allowZeroPoolBorrowingFactor
        );
        MarketUtils.updateCumulativeBorrowingFactor(
            dataStore,
            eventEmitter,
            market,
            prices,
            false, // isLong
            true // allowZeroPoolBorrowingFactor
        );
    }

    function getMarketPoolDonationConfig(
        address marketAddress
    ) external view returns (MarketPoolDonationConfig memory) {
        return marketPoolDonationConfigs[marketAddress];
    }

    function getMarketPoolDonationState(
        address marketAddress
    ) external view returns (MarketPoolDonationState memory) {
        MarketPoolDonationState memory state = marketPoolDonationStates[marketAddress];
        uint256 donationPeriodDuration = marketPoolDonationConfigs[marketAddress].donationPeriodDuration;
        if (donationPeriodDuration == 0) {
            return state;
        }

        uint256 currentPeriodId = Chain.currentTimestamp() / donationPeriodDuration;
        if (state.periodId != currentPeriodId) {
            return MarketPoolDonationState({periodId: currentPeriodId, donatedAmount: 0});
        }

        return state;
    }

    function _validateSingleTokenMarket(Market.Props memory market) private pure {
        if (market.longToken != market.shortToken) {
            revert InvalidMarketPoolDonationMarket(
                market.marketToken,
                market.longToken,
                market.shortToken
            );
        }
    }

    // @dev Single-token markets cannot be used for swaps and should not participate in
    // virtual swap inventory. applyDeltaToPoolAmount updates virtual inventory when a
    // virtualMarketId is configured, but when longToken == shortToken it classifies the
    // donated token as the long token and updates only the virtual long side. This would
    // create an artificial imbalance and could affect every market sharing the ID.
    function _validateNoVirtualInventory(address marketAddress) private view {
        bytes32 virtualMarketId = dataStore.getBytes32(Keys.virtualMarketIdKey(marketAddress));
        if (virtualMarketId != bytes32(0)) {
            revert MarketPoolDonationVirtualInventoryNotSupported(marketAddress, virtualMarketId);
        }
    }
}
