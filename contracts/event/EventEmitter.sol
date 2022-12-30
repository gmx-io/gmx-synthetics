// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../role/RoleModule.sol";
import "../order/Order.sol";
import "../deposit/Deposit.sol";
import "../pricing/SwapPricingUtils.sol";
import "../pricing/PositionPricingUtils.sol";
import "./EventUtils.sol";

// @title EventEmitter
// @dev Contract to emit events
// This allows main events to be emitted from a single contract
// Logic contracts can be updated while re-using the same eventEmitter contract
// Peripheral services like monitoring or analytics would be able to continue
// to work without an update and without segregating historical data
contract EventEmitter is RoleModule {
    // @param key the position's key
    // @param account the position's account
    // @param market the position's market
    // @param collateralToken the position's collateralToken
    // @param isLong whether the position is long or short
    // @param executionPrice the price the position increase was executed at
    // @param sizeDeltaUsd the amount of size the position was increased by
    // @param sizeDeltaInTokens the amount of size the position was increased by in tokens
    // @param collateralDeltaAmount the amount of collateral that was deposited into the position
    // @param remainingCollateralAmount the amount of collateral remaining
    // @param orderType the order type for the position increase
    event PositionIncrease(
        bytes32 key,
        address indexed account,
        address indexed market,
        address collateralToken,
        bool isLong,
        uint256 executionPrice,
        uint256 sizeDeltaInUsd,
        uint256 sizeDeltaInTokens,
        int256 collateralDeltaAmount,
        int256 remainingCollateralAmount,
        Order.OrderType orderType
    );

    // @param key the position's key
    // @param account the position's account
    // @param market the position's market
    // @param collateralToken the position's collateralToken
    // @param isLong whether the position is long or short
    // @param executionPrice the price the position decrease was executed at
    // @param sizeDeltaUsd the amount of size the position was decreased by
    // @param sizeDeltaInTokens the amount of size the position was decreased by in tokens
    // @param collateralDeltaAmount the amount of collateral that was withdrawn from the position
    // @param positionPnlUsd the pnl realized
    // @param remainingCollateralAmount the amount of collateral remaining
    // @param outputAmount the amount sent to the user
    // @param orderType the order type for the position decrease
    event PositionDecrease(
        bytes32 key,
        address indexed account,
        address indexed market,
        address collateralToken,
        bool isLong,
        uint256 executionPrice,
        uint256 sizeDeltaInUsd,
        uint256 sizeDeltaInTokens,
        int256 collateralDeltaAmount,
        int256 pnlAmountForPool,
        int256 remainingCollateralAmount,
        uint256 outputAmount,
        Order.OrderType orderType
    );

    // @param key the key of the deposit
    // @param deposit the created deposit
    event DepositCreated(bytes32 key, Deposit.Props deposit);
    // @param key the key of the deposit
    event DepositExecuted(bytes32 key);
    // @param key the key of the deposit
    event DepositCancelled(bytes32 key, bytes reason);

    // @param key the key of the withdrawal
    // @param withdrawal the created withdrawal
    event WithdrawalCreated(bytes32 key, Withdrawal.Props withdrawal);
    // @param key the key of the withdrawal
    event WithdrawalExecuted(bytes32 key);
    // @param key the key of the withdrawal
    event WithdrawalCancelled(bytes32 key, bytes reason);

    // @param key the key of the order
    // @param order the order created
    event OrderCreated(bytes32 key, Order.Props order);
    // @param key the key of the order
    // @param sizeDeltaUsd the updated sizeDeltaUsd
    // @param triggerPrice the updated triggerPrice
    // @param acceptablePrice the updated acceptablePrice
    event OrderUpdated(
        bytes32 key,
        uint256 sizeDeltaUsd,
        uint256 triggerPrice,
        uint256 acceptablePrice
    );
    // @param key the key of the order
    // @param reason the reason the order was cancelled
    event OrderCancelled(bytes32 key, bytes reason);
    // @param key the key of the order
    event OrderExecuted(bytes32 key);
    // @param key the key of the order
    // @param reason the reason the order was frozen
    event OrderFrozen(bytes32 key, bytes reason);

    // @param action the type of swap
    // @param fees SwapPricingUtils.SwapFees
    event SwapFeesCollected(bytes32 action, SwapPricingUtils.SwapFees fees);
    // @param isIncrease whether it is position increase or decrease
    // @param fees PositionPricingUtils.PositionFees
    event PositionFeesCollected(bool isIncrease, PositionPricingUtils.PositionFees fees);

    // @param market the market of the pool
    // @param token the token of the pool
    // @param delta the update amount
    // @param nextValue the new pool amount
    event PoolAmountUpdated(address market, address token, int256 delta, uint256 nextValue);
    // @param market the market of the swap impact pool
    // @param token the token of the swap impact pool
    // @param delta the update amount
    // @param nextValue the new swap impact pool amount
    event SwapImpactPoolAmountUpdated(address market, address token, int256 delta, uint256 nextValue);
    // @param market the market of the position impact pool
    // @param token the token of the position impact pool
    // @param delta the update amount
    // @param nextValue the new position impact pool amount
    event PositionImpactPoolAmountUpdated(address market, int256 delta, uint256 nextValue);
    // @param market the market for the open interest
    // @param collateralToken the collateralToken for the open interest
    // @param isLong whether the open interest is for long or short
    // @param delta the update amount
    // @param nextValue the new open interest amount
    event OpenInterestUpdated(address market, address collateralToken, bool isLong, int256 delta, uint256 nextValue);
    // @param market the market for the open interest in tokens
    // @param collateralToken the collateralToken for the open interest in tokens
    // @param isLong whether the open interest is for long or short
    // @param delta the update amount
    // @param nextValue the new open interest amount in tokens
    event OpenInterestInTokensUpdated(address market, address collateralToken, bool isLong, int256 delta, uint256 nextValue);
    // @param market the market for the claimable funding
    // @param token the token for the claimable funding
    // @param account the account for the claimable funding
    // @param delta the update amount
    // @param nextvalue the new claimable funding
    event ClaimableFundingUpdated(address market, address token, address account, uint256 delta, uint256 nextValue);
    // @param market the market for the claimed funding fees
    // @param token the token claimed
    // @param account the account that claimed
    // @param receiver the address that received the claimed amount
    // @param amount the amount claimed
    event FundingFeesClaimed(address market, address token, address account, address receiver, uint256 amount);
    // @param market the market for the claimable collateral
    // @param token the token for the claimable collateral
    // @param account the account for the claimable collateral
    // @param timeKey the time key for the claimable collateral
    // @param delta the update amount
    // @param nextvalue the new claimable collateral
    event ClaimableCollateralUpdated(address market, address token, uint256 timeKey, address account, uint256 delta, uint256 nextValue);
    event CollateralClaimed(address market, address token, uint256 timeKey, address account, address receiver, uint256 amount);
    // @param pnlToPoolFactor the pnl to pool factor
    // @param maxPnlFactor the max pnl factor
    // @param shouldEnableAdl whether ADL should be enabled
    event AdlStateUpdated(int256 pnlToPoolFactor, uint256 maxPnlFactor, bool shouldEnableAdl);
    // @param market the trading market
    // @param token the token the discount was in
    // @param trader the trader who received the discount
    // @param amount the discount amount
    event TraderReferralDiscountApplied(address market, address token, address trader, uint256 amount);
    // @param market the trading market
    // @param token the token reward is in
    // @param affiliate the affiliate who received the reward
    // @param trader the trader who made the trade
    // @param amount the reward amount
    event AffiliateRewardEarned(address market, address token, address affiliate, address trader, uint256 amount);
    // @param market the trading market
    // @param token the token reward is in
    // @param account the account that claimed the reward
    // @param receiver the address that received the claimed amount
    // @param amount the reward amount
    event AffiliateRewardClaimed(address market, address token, address account, address receiver, uint256 amount);

    // @param fundingFeeAmount the funding fee amount to be paid
    // @param collateralAmount the amount of collateral in the position
    event InsufficientFundingFeePayment(uint256 fundingFeeAmount, uint256 collateralAmount);

    // @param market the trading market
    // @param collateralToken the collateral token
    // @param isLong whether it is for the long or short side
    // @param delta the update amount
    // @param nextvalue the new collateral sum
    event CollateralSumUpdated(
        address market,
        address collateralToken,
        bool isLong,
        int256 delta,
        uint256 nextValue
    );

    // @param token the token for the price
    // @param minPrice the min price of the token
    // @param maxPrice the max price of the token
    // @param isPrimary whether it is the primary price
    // @param isPriceFeed whether the price is from a price feed
    event OraclePriceUpdated(address token, uint256 minPrice, uint256 maxPrice, bool isPrimary, bool isPriceFeed);

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    // @param market the market of the pool
    // @param token the token of the pool
    // @param delta the update amount
    // @param nextValue the new pool amount
    function emitPoolAmountUpdated(address market, address token, int256 delta, uint256 nextValue) external onlyController {
        emit PoolAmountUpdated(market, token, delta, nextValue);
    }

    // @param market the market of the swap impact pool
    // @param token the token of the swap impact pool
    // @param delta the update amount
    // @param nextValue the new swap impact pool amount
    function emitSwapImpactPoolAmountUpdated(address market, address token, int256 delta, uint256 nextValue) external onlyController {
        emit SwapImpactPoolAmountUpdated(market, token, delta, nextValue);
    }

    // @param market the market of the position impact pool
    // @param token the token of the position impact pool
    // @param delta the update amount
    // @param nextValue the new position impact pool amount
    function emitPositionImpactPoolAmountUpdated(address market, int256 delta, uint256 nextValue) external onlyController {
        emit PositionImpactPoolAmountUpdated(market, delta, nextValue);
    }

    // @param market the market for the open interest
    // @param collateralToken the collateralToken for the open interest
    // @param isLong whether the open interest is for long or short
    // @param delta the update amount
    // @param nextValue the new open interest amount
    function emitOpenInterestUpdated(address market, address collateralToken, bool isLong, int256 delta, uint256 nextValue) external onlyController {
        emit OpenInterestUpdated(market, collateralToken, isLong, delta, nextValue);
    }

    // @param market the market for the open interest in tokens
    // @param collateralToken the collateralToken for the open interest in tokens
    // @param isLong whether the open interest is for long or short
    // @param delta the update amount
    // @param nextValue the new open interest amount in tokens
    function emitOpenInterestInTokensUpdated(address market, address collateralToken, bool isLong, int256 delta, uint256 nextValue) external onlyController {
        emit OpenInterestInTokensUpdated(market, collateralToken, isLong, delta, nextValue);
    }

    // @param market the market for the claimable funding
    // @param token the token for the claimable funding
    // @param account the account for the claimable funding
    // @param delta the update amount
    // @param nextvalue the new claimable funding
    function emitClaimableFundingUpdated(address market, address token, address account, uint256 delta, uint256 nextValue) external onlyController {
        emit ClaimableFundingUpdated(market, token, account, delta, nextValue);
    }

    // @param market the market for the claimed funding fees
    // @param token the token claimed
    // @param account the account that claimed
    // @param receiver the address that received the claimed amount
    // @param amount the amount claimed
    function emitFundingFeesClaimed(address market, address token, address account, address receiver, uint256 amount) external onlyController {
        emit FundingFeesClaimed(market, token, account, receiver, amount);
    }

    // @param market the market for the claimable collateral
    // @param token the token for the claimable collateral
    // @param account the account for the claimable collateral
    // @param delta the update amount
    // @param nextvalue the new claimable collateral
    function emitClaimableCollateralUpdated(address market, address token, uint256 timeKey, address account, uint256 delta, uint256 nextValue) external onlyController {
        emit ClaimableCollateralUpdated(market, token, timeKey, account, delta, nextValue);
    }

    function emitCollateralClaimed(address market, address token, uint256 timeKey, address account, address receiver, uint256 amount) external onlyController {
        emit CollateralClaimed(market, token, timeKey, account, receiver, amount);
    }

    // @param pnlToPoolFactor the pnl to pool factor
    // @param maxPnlFactor the max pnl factor
    // @param shouldEnableAdl whether ADL should be enabled
    function emitAdlStateUpdated(int256 pnlToPoolFactor, uint256 maxPnlFactor, bool shouldEnableAdl) external onlyController {
        emit AdlStateUpdated(pnlToPoolFactor, maxPnlFactor, shouldEnableAdl);
    }

    // @param market the trading market
    // @param token the token the discount was in
    // @param trader the trader who received the discount
    // @param amount the discount amount
    function emitTraderReferralDiscountApplied(address market, address token, address trader, uint256 amount) external onlyController {
        emit TraderReferralDiscountApplied(market, token, trader, amount);
    }

    // @param market the trading market
    // @param token the token reward is in
    // @param affiliate the affiliate who received the reward
    // @param trader the trader who made the trade
    // @param amount the reward amount
    function emitAffiliateRewardEarned(address market, address token, address affiliate, address trader, uint256 amount) external onlyController {
        emit AffiliateRewardEarned(market, token, affiliate, trader, amount);
    }

    // @param market the trading market
    // @param token the token reward is in
    // @param account the account that claimed the reward
    // @param receiver the address that received the claimed amount
    // @param amount the reward amount
    function emitAffiliateRewardClaimed(address market, address token, address account, address receiver, uint256 amount) external onlyController {
        emit AffiliateRewardClaimed(market, token, account, receiver, amount);
    }

    // @param market the trading market
    // @param collateralToken the collateral token
    // @param isLong whether it is for the long or short side
    // @param delta the update amount
    // @param nextvalue the new collateral sum
    function emitCollateralSumUpdated(
        address market,
        address collateralToken,
        bool isLong,
        int256 delta,
        uint256 nextValue
    ) external onlyController {
        emit CollateralSumUpdated(market, collateralToken, isLong, delta, nextValue);
    }

    // @param key the key of the order
    // @param order the order created
    function emitOrderCreated(bytes32 key, Order.Props memory order) external onlyController {
        emit OrderCreated(key, order);
    }

    // @param key the key of the order
    function emitOrderExecuted(bytes32 key) external onlyController {
        emit OrderExecuted(key);
    }

    // @param key the key of the order
    // @param sizeDeltaUsd the updated sizeDeltaUsd
    // @param triggerPrice the updated triggerPrice
    // @param acceptablePrice the updated acceptablePrice
    function emitOrderUpdated(
        bytes32 key,
        uint256 sizeDeltaUsd,
        uint256 triggerPrice,
        uint256 acceptablePrice
    ) external onlyController {
        emit OrderUpdated(key, sizeDeltaUsd, triggerPrice, acceptablePrice);
    }

    // @param key the key of the order
    // @param reason the reason the order was cancelled
    function emitOrderCancelled(bytes32 key, bytes memory reason) external onlyController {
        emit OrderCancelled(key, reason);
    }

    // @param key the key of the order
    // @param reason the reason the order was frozen
    function emitOrderFrozen(bytes32 key, bytes memory reason) external onlyController {
        emit OrderFrozen(key, reason);
    }

    // @param key the key of the deposit
    // @param deposit the created deposit
    function emitDepositCreated(bytes32 key, Deposit.Props memory deposit) external onlyController {
        emit DepositCreated(key, deposit);
    }

    // @param key the key of the deposit
    function emitDepositExecuted(bytes32 key) external onlyController {
        emit DepositExecuted(key);
    }

    // @param key the key of the deposit
    function emitDepositCancelled(bytes32 key, bytes memory reason) external onlyController {
        emit DepositCancelled(key, reason);
    }

    // @param key the key of the withdrawal
    // @param withdrawal the created withdrawal
    function emitWithdrawalCreated(bytes32 key, Withdrawal.Props memory withdrawal) external onlyController {
        emit WithdrawalCreated(key, withdrawal);
    }

    // @param key the key of the withdrawal
    function emitWithdrawalExecuted(bytes32 key) external onlyController {
        emit WithdrawalExecuted(key);
    }

    // @param key the key of the withdrawal
    function emitWithdrawalCancelled(bytes32 key, bytes memory reason) external onlyController {
        emit WithdrawalCancelled(key, reason);
    }

    // @param action the type of swap
    // @param fees SwapPricingUtils.SwapFees
    function emitSwapFeesCollected(bytes32 action, SwapPricingUtils.SwapFees calldata fees) external onlyController {
        emit SwapFeesCollected(action, fees);
    }

    // @param isIncrease whether it is position increase or decrease
    // @param fees PositionPricingUtils.PositionFees
    function emitPositionFeesCollected(bool isIncrease, PositionPricingUtils.PositionFees calldata fees) external onlyController {
        emit PositionFeesCollected(isIncrease, fees);
    }

    // @param token the token for the price
    // @param minPrice the min price of the token
    // @param maxPrice the max price of the token
    // @param isPrimary whether it is the primary price
    // @param isPriceFeed whether the price is from a price feed
    function emitOraclePriceUpdated(address token, uint256 minPrice, uint256 maxPrice, bool isPrimary, bool isPriceFeed) external onlyController {
        emit OraclePriceUpdated(token, minPrice, maxPrice, isPrimary, isPriceFeed);
    }

    // @param key the position's key
    // @param account the position's account
    // @param market the position's market
    // @param collateralToken the position's collateralToken
    // @param isLong whether the position is long or short
    // @param executionPrice the price the position increase was executed at
    // @param sizeDeltaUsd the amount of size the position was increased by
    // @param collateralDeltaAmount the amount of collateral that was deposited into the position
    function emitPositionIncrease(
        bytes32 key,
        address account,
        address market,
        address collateralToken,
        bool isLong,
        uint256 executionPrice,
        uint256 sizeDeltaUsd,
        uint256 sizeDeltaInTokens,
        int256 collateralDeltaAmount,
        int256 remainingCollateralAmount,
        Order.OrderType orderType
    ) external onlyController {
        emit PositionIncrease(
            key,
            account,
            market,
            collateralToken,
            isLong,
            executionPrice,
            sizeDeltaUsd,
            sizeDeltaInTokens,
            collateralDeltaAmount,
            remainingCollateralAmount,
            orderType
        );
    }

    // @param key the position's key
    // @param account the position's account
    // @param market the position's market
    // @param collateralToken the position's collateralToken
    // @param isLong whether the position is long or short
    // @param executionPrice the price the position decrease was executed at
    // @param sizeDeltaUsd the amount of size the position was decreased by
    // @param collateralDeltaAmount the amount of collateral that was withdrawn from the position
    // @param positionPnlUsd the pnl realized
    // @param pnlAmountForPool the pnl amount for the pool
    // @param remainingCollateralAmount the amount of collateral remaining
    // @param outputAmount the amount sent to the user
    function emitPositionDecrease(
        EventUtils.EmitPositionDecreaseParams memory params,
        uint256 executionPrice,
        uint256 sizeDeltaUsd,
        uint256 sizeDeltaInTokens,
        int256 collateralDeltaAmount,
        int256 pnlAmountForPool,
        int256 remainingCollateralAmount,
        uint256 outputAmount,
        Order.OrderType orderType
    ) external onlyController {
        emit PositionDecrease(
            params.key,
            params.account,
            params.market,
            params.collateralToken,
            params.isLong,
            executionPrice,
            sizeDeltaUsd,
            sizeDeltaInTokens,
            collateralDeltaAmount,
            pnlAmountForPool,
            remainingCollateralAmount,
            outputAmount,
            orderType
        );
    }

    // @param fundingFeeAmount the funding fee amount to be paid
    // @param collateralAmount the amount of collateral in the position
    function emitInsufficientFundingFeePayment(uint256 fundingFeeAmount, uint256 collateralAmount) external onlyController {
        emit InsufficientFundingFeePayment(fundingFeeAmount, collateralAmount);
    }

    // @dev event log for general use
    // @param topic1 event topic 1
    // @param data additional data
    function log1(bytes32 topic1, bytes memory data) external onlyController {
        uint256 len = data.length;
        assembly {
            log1(add(data, 32), len, topic1)
        }
    }

    // @dev event log for general use
    // @param topic1 event topic 1
    // @param topic2 event topic 2
    // @param data additional data
    function log2(bytes32 topic1, bytes32 topic2, bytes memory data) external onlyController {
        uint256 len = data.length;
        assembly {
            log2(add(data, 32), len, topic1, topic2)
        }
    }

    // @dev event log for general use
    // @param topic1 event topic 1
    // @param topic2 event topic 2
    // @param topic3 event topic 3
    // @param data additional data
    function log3(bytes32 topic1, bytes32 topic2, bytes32 topic3, bytes memory data) external onlyController {
        uint256 len = data.length;
        assembly {
            log3(add(data, 32), len, topic1, topic2, topic3)
        }
    }

    // @dev event log for general use
    // @param topic1 event topic 1
    // @param topic2 event topic 2
    // @param topic3 event topic 3
    // @param topic4 event topic 4
    // @param data additional data
    function log4(bytes32 topic1, bytes32 topic2, bytes32 topic3, bytes32 topic4, bytes memory data) external onlyController {
        uint256 len = data.length;
        assembly {
            log4(add(data, 32), len, topic1, topic2, topic3, topic4)
        }
    }
}
