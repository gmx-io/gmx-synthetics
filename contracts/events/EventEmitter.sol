
// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../role/RoleModule.sol";
import "../order/Order.sol";
import "../deposit/Deposit.sol";
import "../pricing/SwapPricingUtils.sol";
import "../pricing/PositionPricingUtils.sol";

contract EventEmitter is RoleModule {
    event PositionIncrease(
        address indexed account,
        address indexed market,
        address collateralToken,
        bool isLong,
        uint256 price,
        uint256 sizeDeltaInUsd,
        int256 collateralDeltaAmount
    );
    event PositionDecrease(
        address indexed account,
        address indexed market,
        address collateralToken,
        bool isLong,
        uint256 price,
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
        uint256 acceptablePrice,
        int256 acceptableUsdAdjustment
    );
    event OrderCancelled(bytes32 key, bytes32 reason);
    event OrderExecuted(bytes32 key);
    event OrderFrozen(bytes32 key, bytes32 reason);
    // event OrderCallback();

    // event SetPricePrecision

    event SwapFeesCollected(bytes32 action, SwapPricingUtils.SwapFees fees);
    event PositionFeesCollected(bool isIncrease, PositionPricingUtils.PositionFees fees);

    event PoolAmountIncreased(address market, address token, uint256 amount);
    event PoolAmountDecreased(address market, address token, uint256 amount);

    event ImpactPoolAmountIncreased(address market, address token, uint256 amount);
    event ImpactPoolAmountDecrease(address market, address token, uint256 amount);

    event OpenInterestIncrease(address market, bool isLong, uint256 sizeDeltaUsd);
    event OpenInterestDecreased(address market, bool isLong, uint256 sizeDeltaUsd);

    event CollateralSumIncreased(
        address market,
        address collateralToken,
        bool isLong,
        uint256 collateralDeltaAmount
    );

    event CollateralSumDecreased(
        address market,
        address collateralToken,
        bool isLong,
        uint256 collateralDeltaAmount
    );

    event OraclePriceUpdated(address token, uint256 price, bool isPrimary, bool isPriceFeed);

    constructor(RoleStore _roleStore) RoleModule(_roleStore) {}

    function emitPoolAmountIncreased(address market, address token, uint256 amount) external onlyController {
        emit PoolAmountIncreased(market, token, amount);
    }

    function emitPoolAmountDecreased(address market, address token, uint256 amount) external onlyController {
        emit PoolAmountDecreased(market, token, amount);
    }

    function emitImpactPoolAmountIncreased(address market, address token, uint256 amount) external onlyController {
        emit ImpactPoolAmountIncreased(market, token, amount);
    }

    function emitImpactPoolAmountDecreased(address market, address token, uint256 amount) external onlyController {
        emit ImpactPoolAmountDecrease(market, token, amount);
    }

    function emitOpenInterestIncreased(address market, bool isLong, uint256 sizeDeltaUsd) external onlyController {
        emit OpenInterestIncrease(market, isLong, sizeDeltaUsd);
    }

    function emitOpenInterestDecreased(address market, bool isLong, uint256 sizeDeltaUsd) external onlyController {
        emit OpenInterestDecreased(market, isLong, sizeDeltaUsd);
    }

    function emitCollateralSumIncreased(
        address market,
        address collateralToken,
        bool isLong,
        uint256 collateralDeltaAmount
    ) external onlyController {
        emit CollateralSumIncreased(market, collateralToken, isLong, collateralDeltaAmount);
    }

    function emitCollateralSumDecreased(
        address market,
        address collateralToken,
        bool isLong,
        uint256 collateralDeltaAmount
    ) external onlyController {
        emit CollateralSumDecreased(market, collateralToken, isLong, collateralDeltaAmount);
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
        uint256 acceptablePrice,
        int256 acceptableUsdAdjustment
    ) external onlyController {
        emit OrderUpdated(key, sizeDeltaUsd, acceptablePrice, acceptableUsdAdjustment);
    }

    function emitOrderCancelled(bytes32 key, bytes32 reason) external onlyController {
        emit OrderCancelled(key, reason);
    }

    function emitOrderFrozen(bytes32 key, bytes32 reason) external onlyController {
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

    function emitOraclePriceUpdated(address token, uint256 price, bool isPrimary, bool isPriceFeed) external onlyController {
        emit OraclePriceUpdated(token, price, isPrimary, isPriceFeed);
    }

    function emitPositionIncrease(
        address account,
        address market,
        address collateralToken,
        bool isLong,
        uint256 price,
        uint256 sizeDeltaUsd,
        int256 collateralDeltaAmount
    ) external onlyController {
        emit PositionIncrease(
            account,
            market,
            collateralToken,
            isLong,
            price,
            sizeDeltaUsd,
            collateralDeltaAmount
        );
    }

    function emitPositionDecrease(
        address account,
        address market,
        address collateralToken,
        bool isLong,
        uint256 price,
        uint256 sizeDeltaUsd,
        int256 collateralDeltaAmount,
        int256 remainingCollateralAmount,
        int256 outputAmount,
        int256 realizedPnlAmount
    ) external onlyController {
        emit PositionDecrease(
            account,
            market,
            collateralToken,
            isLong,
            price,
            sizeDeltaUsd,
            collateralDeltaAmount,
            remainingCollateralAmount,
            outputAmount,
            realizedPnlAmount
        );
    }
}
