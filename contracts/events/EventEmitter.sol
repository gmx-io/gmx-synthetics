// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../role/RoleModule.sol";
import "../order/Order.sol";
import "../deposit/Deposit.sol";
import "../pricing/SwapPricingUtils.sol";
import "../pricing/PositionPricingUtils.sol";

contract EventEmitter is RoleModule {
    event PositionIncrease(
        bytes32 key,
        address indexed account,
        address indexed market,
        address collateralToken,
        bool isLong,
        uint256 executionPrice,
        uint256 sizeDeltaInUsd,
        int256 collateralDeltaAmount
    );
    event PositionDecrease(
        bytes32 key,
        address indexed account,
        address indexed market,
        address collateralToken,
        bool isLong,
        uint256 executionPrice,
        uint256 sizeDeltaInUsd,
        int256 collateralDeltaAmount,
        int256 remainingCollateralAmount,
        int256 outputAmount,
        int256 realizedPnlAmount
    );
    // PositionLiquidated?

    event DepositCreated(bytes32 key, Deposit.Props deposit);
    event DepositExecuted(bytes32 key);
    event DepositCancelled(bytes32 key);

    event WithdrawalCreated(bytes32 key, Withdrawal.Props withdrawal);
    event WithdrawalExecuted(bytes32 key);
    event WithdrawalCancelled(bytes32 key);

    event OrderCreated(bytes32 key, Order.Props order);
    event OrderUpdated(
        bytes32 key,
        uint256 sizeDeltaUsd,
        uint256 triggerPrice,
        uint256 acceptablePrice
    );
    event OrderCancelled(bytes32 key, string reason);
    event OrderExecuted(bytes32 key);
    event OrderFrozen(bytes32 key, string reason);
    // event OrderCallback();

    // event SetPricePrecision

    event SwapFeesCollected(bytes32 action, SwapPricingUtils.SwapFees fees);
    event PositionFeesCollected(bool isIncrease, PositionPricingUtils.PositionFees fees);

    event PoolAmountUpdated(address market, address token, int256 delta, uint256 nextValue);
    event SwapImpactPoolAmountUpdated(address market, address token, int256 delta, uint256 nextValue);
    event PositionImpactPoolAmountUpdated(address market, int256 delta, uint256 nextValue);
    event OpenInterestUpdated(address market, address collateralToken, bool isLong, int256 delta, uint256 nextValue);
    event OpenInterestInTokensUpdated(address market, address collateralToken, bool isLong, int256 delta, uint256 nextValue);
    event ClaimableFundingUpdated(address market, address token, address account, uint256 delta, uint256 nextValue);

    event CollateralSumDelta(
        address market,
        address collateralToken,
        bool isLong,
        int256 collateralDeltaAmount
    );

    event OraclePriceUpdated(address token, uint256 minPrice, uint256 maxPrice, bool isPrimary, bool isPriceFeed);

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function emitPoolAmountUpdated(address market, address token, int256 delta, uint256 nextValue) external onlyController {
        emit PoolAmountUpdated(market, token, delta, nextValue);
    }

    function emitSwapImpactPoolAmountUpdated(address market, address token, int256 delta, uint256 nextValue) external onlyController {
        emit SwapImpactPoolAmountUpdated(market, token, delta, nextValue);
    }

    function emitPositionImpactPoolAmountUpdated(address market, int256 delta, uint256 nextValue) external onlyController {
        emit PositionImpactPoolAmountUpdated(market, delta, nextValue);
    }

    function emitOpenInterestUpdated(address market, address collateralToken, bool isLong, int256 delta, uint256 nextValue) external onlyController {
        emit OpenInterestUpdated(market, collateralToken, isLong, delta, nextValue);
    }

    function emitOpenInterestInTokensUpdated(address market, address collateralToken, bool isLong, int256 delta, uint256 nextValue) external onlyController {
        emit OpenInterestInTokensUpdated(market, collateralToken, isLong, delta, nextValue);
    }

    function emitClaimableFundingUpdated(address market, address token, address account, uint256 delta, uint256 nextValue) external onlyController {
        emit ClaimableFundingUpdated(market, token, account, delta, nextValue);
    }

    function emitCollateralSumDelta(
        address market,
        address collateralToken,
        bool isLong,
        int256 collateralDeltaAmount
    ) external onlyController {
        emit CollateralSumDelta(market, collateralToken, isLong, collateralDeltaAmount);
    }

    function emitOrderCreated(bytes32 key, Order.Props memory order) external onlyController {
        emit OrderCreated(key, order);
    }

    function emitOrderExecuted(bytes32 key) external onlyController {
        emit OrderExecuted(key);
    }

    function emitOrderUpdated(
        bytes32 key,
        uint256 sizeDeltaUsd,
        uint256 triggerPrice,
        uint256 acceptablePrice
    ) external onlyController {
        emit OrderUpdated(key, sizeDeltaUsd, triggerPrice, acceptablePrice);
    }

    function emitOrderCancelled(bytes32 key, string memory reason) external onlyController {
        emit OrderCancelled(key, reason);
    }

    function emitOrderFrozen(bytes32 key, string memory reason) external onlyController {
        emit OrderFrozen(key, reason);
    }

    function emitDepositCreated(bytes32 key, Deposit.Props memory deposit) external onlyController {
        emit DepositCreated(key, deposit);
    }

    function emitDepositExecuted(bytes32 key) external onlyController {
        emit DepositExecuted(key);
    }

    function emitDepositCancelled(bytes32 key) external onlyController {
        emit DepositCancelled(key);
    }

    function emitWithdrawalCreated(bytes32 key, Withdrawal.Props memory withdrawal) external onlyController {
        emit WithdrawalCreated(key, withdrawal);
    }

    function emitWithdrawalExecuted(bytes32 key) external onlyController {
        emit WithdrawalExecuted(key);
    }

    function emitWithdrawalCancelled(bytes32 key) external onlyController {
        emit WithdrawalCancelled(key);
    }

    function emitSwapFeesCollected(bytes32 action, SwapPricingUtils.SwapFees calldata fees) external onlyController {
        emit SwapFeesCollected(action, fees);
    }

    function emitPositionFeesCollected(bool isIncrease, PositionPricingUtils.PositionFees calldata fees) external onlyController {
        emit PositionFeesCollected(isIncrease, fees);
    }

    function emitOraclePriceUpdated(address token, uint256 minPrice, uint256 maxPrice, bool isPrimary, bool isPriceFeed) external onlyController {
        emit OraclePriceUpdated(token, minPrice, maxPrice, isPrimary, isPriceFeed);
    }

    function emitPositionIncrease(
        bytes32 key,
        address account,
        address market,
        address collateralToken,
        bool isLong,
        uint256 executionPrice,
        uint256 sizeDeltaUsd,
        int256 collateralDeltaAmount
    ) external onlyController {
        emit PositionIncrease(
            key,
            account,
            market,
            collateralToken,
            isLong,
            executionPrice,
            sizeDeltaUsd,
            collateralDeltaAmount
        );
    }

    function emitPositionDecrease(
        bytes32 key,
        address account,
        address market,
        address collateralToken,
        bool isLong,
        uint256 executionPrice,
        uint256 sizeDeltaUsd,
        int256 collateralDeltaAmount,
        int256 remainingCollateralAmount,
        int256 outputAmount,
        int256 realizedPnlAmount
    ) external onlyController {
        emit PositionDecrease(
            key,
            account,
            market,
            collateralToken,
            isLong,
            executionPrice,
            sizeDeltaUsd,
            collateralDeltaAmount,
            remainingCollateralAmount,
            outputAmount,
            realizedPnlAmount
        );
    }

    function log1(bytes32 topic1, bytes memory data) external onlyController {
        uint256 len = data.length;
        assembly {
            log1(add(data, 32), len, topic1)
        }
    }

    function log2(bytes32 topic1, bytes32 topic2, bytes memory data) external onlyController {
        uint256 len = data.length;
        assembly {
            log2(add(data, 32), len, topic1, topic2)
        }
    }

    function log3(bytes32 topic1, bytes32 topic2, bytes32 topic3, bytes memory data) external onlyController {
        uint256 len = data.length;
        assembly {
            log3(add(data, 32), len, topic1, topic2, topic3)
        }
    }

    function log4(bytes32 topic1, bytes32 topic2, bytes32 topic3, bytes32 topic4, bytes memory data) external onlyController {
        uint256 len = data.length;
        assembly {
            log4(add(data, 32), len, topic1, topic2, topic3, topic4)
        }
    }
}
