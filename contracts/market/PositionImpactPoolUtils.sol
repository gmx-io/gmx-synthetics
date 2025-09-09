// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import {DataStore} from "../data/DataStore.sol";
import {Keys} from "../data/Keys.sol";
import {Errors} from "../error/Errors.sol";
import {EventEmitter} from "../event/EventEmitter.sol";
import {Precision} from "../utils/Precision.sol";
import {Market} from "./Market.sol";
import {MarketEventUtils} from "./MarketEventUtils.sol";
import {MarketPoolValueInfo} from "./MarketPoolValueInfo.sol";
import {MarketStoreUtils} from "./MarketStoreUtils.sol";
import {MarketToken} from "./MarketToken.sol";
import {MarketUtils} from "./MarketUtils.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {SignedMath} from "@openzeppelin/contracts/utils/math/SignedMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IOracle } from "../oracle/IOracle.sol";
import "../position/PositionUtils.sol";

library PositionImpactPoolUtils {
    using SignedMath for int256;
    using SafeCast for int256;
    using SafeCast for uint256;
    using SafeERC20 for IERC20;

    using Market for Market.Props;

    // @dev withdraw funds from the position impact pool while maintaining GM token price
    // @param dataStore DataStore
    // @param eventEmitter EventEmitter
    // @param market the trading market
    // @param receiver the address to receive the withdrawn funds
    // @param amount the amount to withdraw
    // @param oracle - oracle to fetch the market prices
    function withdrawFromPositionImpactPool(
        DataStore dataStore,
        EventEmitter eventEmitter,
        IOracle oracle,
        address market,
        address receiver,
        uint256 amount
    ) external {
        require(amount > 0, "Amount must be greater than 0");

        MarketUtils.distributePositionImpactPool(
            dataStore,
            eventEmitter,
            market
        );

        Market.Props memory marketProps = MarketStoreUtils.get(dataStore, market);
        MarketUtils.MarketPrices memory prices = MarketUtils.getMarketPrices(oracle, marketProps);

        PositionUtils.updateFundingAndBorrowingState(
            dataStore,
            eventEmitter,
            marketProps,
            prices
        );

        MarketPoolValueInfo.Props memory poolValueInfo = MarketUtils.getPoolValueInfo(
            dataStore,
            marketProps,
            prices.indexTokenPrice,
            prices.longTokenPrice,
            prices.shortTokenPrice,
            Keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
            false
        );

        if (poolValueInfo.poolValue <= 0) {
            revert Errors.InvalidPoolValueForWithdrawal(poolValueInfo.poolValue);
        }

        uint256 adjustedImpactPoolAmount = poolValueInfo.impactPoolAmount;
        int256 totalPendingImpactAmount = MarketUtils.getTotalPendingImpactAmount(dataStore, market);

        // if there is a positive totalPendingImpactAmount, that means that the
        // excess should be covered by the position impact pool, so subtract this
        // from the impactPoolAmount that can be withdrawn
        // lent amount is not considered here, because if there is a lent amount
        // we assume that the position impact would be zero
        if (totalPendingImpactAmount > 0) {
            if (adjustedImpactPoolAmount < totalPendingImpactAmount.toUint256()) {
                revert Errors.InsufficientImpactPoolValueForWithdrawal(amount, poolValueInfo.impactPoolAmount, totalPendingImpactAmount);
            }

            adjustedImpactPoolAmount -= totalPendingImpactAmount.toUint256();
        }

        if (adjustedImpactPoolAmount < amount) {
            revert Errors.InsufficientImpactPoolValueForWithdrawal(amount, poolValueInfo.impactPoolAmount, totalPendingImpactAmount);
        }

        MarketUtils.applyDeltaToPositionImpactPool(
            dataStore,
            eventEmitter,
            market,
            - amount.toInt256()
        );

        // Calculate amount of tokens to withdraw:
        // We want to withdraw long and short tokens from the pool
        // at the current pool token ratio
        (uint256 longTokenWithdrawalAmount, uint256 shortTokenWithdrawalAmount) = MarketUtils.getProportionalAmounts(
            dataStore,
            marketProps,
            prices,
            amount * prices.indexTokenPrice.min
        );

        MarketUtils.applyDeltaToPoolAmount(
            dataStore,
            eventEmitter,
            marketProps,
            marketProps.longToken,
            - longTokenWithdrawalAmount.toInt256()
        );

        MarketUtils.applyDeltaToPoolAmount(
            dataStore,
            eventEmitter,
            marketProps,
            marketProps.shortToken,
            - shortTokenWithdrawalAmount.toInt256()
        );

        MarketToken(payable(market)).transferOut(
            marketProps.longToken,
            receiver,
            longTokenWithdrawalAmount
        );

        MarketToken(payable(market)).transferOut(
            marketProps.shortToken,
            receiver,
            shortTokenWithdrawalAmount
        );

        MarketUtils.validateMarketTokenBalance(dataStore, market);

        MarketEventUtils.emitPositionImpactPoolWithdrawal(
            eventEmitter,
            market,
            receiver,
            amount
        );
    }

    function reduceLentAmount(
        DataStore dataStore,
        EventEmitter eventEmitter,
        IOracle oracle,
        address market,
        address fundingAccount,
        uint256 reductionAmount
    ) external {
        Market.Props memory marketProps = MarketStoreUtils.get(dataStore, market);
        MarketUtils.MarketPrices memory prices = MarketUtils.getMarketPrices(oracle, marketProps);

        PositionUtils.updateFundingAndBorrowingState(
            dataStore,
            eventEmitter,
            marketProps,
            prices
        );

        uint256 lentAmount = dataStore.getUint(Keys.lentPositionImpactPoolAmountKey(market));

        if (reductionAmount > lentAmount) {
            revert Errors.ReductionExceedsLentAmount(lentAmount, reductionAmount);
        }

        uint256 reductionUsd = reductionAmount * prices.indexTokenPrice.max;
        uint256 longTokenAmount = Calc.roundUpDivision(reductionUsd, 2 * prices.longTokenPrice.min);
        uint256 shortTokenAmount = Calc.roundUpDivision(reductionUsd, 2 * prices.shortTokenPrice.min);

        if (longTokenAmount > 0) {
            IERC20(marketProps.longToken).safeTransferFrom(fundingAccount, market, longTokenAmount);
        }

        if (shortTokenAmount > 0) {
            IERC20(marketProps.shortToken).safeTransferFrom(fundingAccount, market, shortTokenAmount);
        }

        MarketUtils.applyDeltaToPoolAmount(
            dataStore,
            eventEmitter,
            marketProps,
            marketProps.longToken,
            longTokenAmount.toInt256()
        );

        MarketUtils.applyDeltaToPoolAmount(
            dataStore,
            eventEmitter,
            marketProps,
            marketProps.shortToken,
            shortTokenAmount.toInt256()
        );

        uint256 nextValue = dataStore.decrementUint(Keys.lentPositionImpactPoolAmountKey(market), reductionAmount);
        MarketEventUtils.emitLentPositionImpactPoolAmountUpdated(eventEmitter, market, reductionAmount.toInt256(), nextValue);

        MarketUtils.validateMarketTokenBalance(dataStore, market);

        MarketEventUtils.emitLentImpactAmountReduction(
            eventEmitter,
            market,
            fundingAccount,
            longTokenAmount,
            shortTokenAmount,
            reductionAmount
        );
    }
}
