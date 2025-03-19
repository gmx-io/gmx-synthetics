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
import { Oracle } from "../oracle/Oracle.sol";

// @title MarketUtils
// @dev Library for market functions
library MarketPositionImpactPoolUtils {
    using SignedMath for int256;
    using SafeCast for int256;
    using SafeCast for uint256;

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
        address market,
        address receiver,
        uint256 amount,
        Oracle oracle
    ) external {
        require(amount > 0, "Amount must be greater than 0");

        Market.Props memory marketProps = MarketStoreUtils.get(dataStore, market);
        MarketUtils.MarketPrices memory prices = MarketUtils.getMarketPrices(oracle, marketProps);

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

        if (poolValueInfo.impactPoolAmount <= amount) {
            revert Errors.InvalidImpactPoolValueForWithdrawal(poolValueInfo.impactPoolAmount);
        }

        MarketUtils.applyDeltaToPositionImpactPool(
            dataStore,
            eventEmitter,
            market,
            - amount.toInt256()
        );

        // Calculate amount of tokens to withdraw:
        // We want to withdraw 50/50 long and short tokens from the pool
        // at prices expressed in index token
        uint256 longTokenWithdrawalAmount = Precision.mulDiv(
            amount / 2, prices.indexTokenPrice.max, prices.longTokenPrice.max
        );
        uint256 shortTokenWithdrawalAmount = Precision.mulDiv(
            amount / 2, prices.indexTokenPrice.max, prices.shortTokenPrice.max
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

        MarketUtils.validateMarketTokenBalance(dataStore, market);

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

        MarketEventUtils.emitPositionImpactPoolWithdrawal(
            eventEmitter,
            market,
            receiver,
            amount
        );
    }
}
