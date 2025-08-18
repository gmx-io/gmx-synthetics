
## 1. Test Plan Overview

目标：覆盖 GMX Synthetics 的核心 swap 和 liquidity math 功能，保证：

* **≥ 90% 行覆盖率**
* **≥ 80% 分支覆盖率**
* 所有关键数值计算、溢出防护和边界情况都有对应测试

主要模块：

| Module                 | Description                      |
| ---------------------- | -------------------------------- |
| `SwapHandler.sol`      | 核心交易执行逻辑，包括 perp/spot swap、费用、滑点 |
| `LiquidityHandler.sol` | LP 增减逻辑、份额计算、价值守恒                |
| `MarketUtils.sol`      | 交易费用、滑点、价格影响计算                   |
| `SwapPricingUtils.sol` | AMM 价格曲线、常数积检查                   |

---

## 2. Functional Paths

### Swap Execution

| Scenario                 | Expected Behavior                              | Notes                        |
| ------------------------ | ---------------------------------------------- | ---------------------------- |
| Swap exact input amount  | Correct output amount, fees, price impact sign | Validate against AMM formula |
| Swap exact output amount | Input token amount correctly calculated        | Includes fee + slippage      |
| Zero amount swap         | Revert                                         | Guard against dust trades    |
| Max slippage breach      | Revert                                         | Test protection logic        |
| Swap long → short        | Correct funding/PnL applied                    | Includes cross-asset swaps   |
| Swap short → long        | Correct funding/PnL applied                    | Mirror test                  |

### Liquidity Math

| Scenario               | Expected Behavior                | Notes                                                |
| ---------------------- | -------------------------------- | ---------------------------------------------------- |
| Add liquidity          | LP shares minted correctly       | Total LP value == total asset value                  |
| Remove liquidity       | LP shares burned, value returned | Invariant: ΔLPValue == fee + priceImpact + traderPnl |
| Consecutive add/remove | LP accounting accurate           | Test multiple sequential operations                  |
| Extreme amounts        | Guard against overflow/underflow | Use SafeCast checks                                  |
| Zero liquidity         | Revert                           | Cannot remove LP shares if none exist                |

---

## 3. Edge Cases

| Edge Case                         | Description                     |
| --------------------------------- | ------------------------------- |
| Minimum and maximum token amounts | Test rounding errors ≤ 1 wei    |
| Max uint256 values                | Test overflow protection        |
| Price = 0                         | Ensure revert                   |
| Fee = 0                           | Correctly applied               |
| Small fraction swaps              | Validate precision and rounding |

---

## 4. Numerical Invariants

1. **LP Value Conservation**

   ```
   ΔLPValue == fee + priceImpact + traderPnl
   ```
2. **Non-negative reserves**

   ```
   tokenReserve >= 0 && quoteReserve >= 0
   ```
3. **Constant-product check (AMM)**

   ```
   oldReserves.x * oldReserves.y <= newReserves.x * newReserves.y + 1 wei
   ```
4. **Funding & PnL**

   ```
   sum(longPositions) + sum(shortPositions) == totalNotionalValue
   ```

---

## 5. Rounding and Overflow Testing

* **Rounding errors**

  * Use fuzzing (Foundry) to test small fractions and extreme values
  * Assert `abs(actual - expected) <= 1 wei`

* **Overflow / SafeCast**

  * Explicitly cast large numbers and test boundary conditions
  * Confirm `SafeCast` reverts when value > max allowed

