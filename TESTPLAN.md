
## 1. Test Plan Overview

目标：覆盖 GMX Synthetics 的核心 swap 和 liquidity math 功能，保证：

* **≥ 90% 行覆盖率**
* **≥ 80% 分支覆盖率**
* 所有关键数值计算、溢出防护和边界情况都有对应测试

主要模块：

| 模块                 | 功能                      |
| ---------------------- | -------------------------------- |
| `SwapHandler.sol`      | 核心交易执行逻辑，包括 perp/spot swap、费用、滑点 |
| `LiquidityHandler.sol` | LP 增减逻辑、份额计算、价值守恒(没有找到sol文件)                | 
| `MarketUtils.sol`      | 交易费用、滑点、价格影响计算                   |
| `SwapPricingUtils.sol` | AMM 价格曲线、常数积检查                   |

---

## 2. 功能路径测试

### Swap Execution
| **场景编号** | **测试场景描述**             | **输入参数**                                                                                              | **预期结果**                                                                                                                         |
| -------- | ---------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **1**    | 输入金额为 0                | `amountIn = 0`，`swapPathMarkets = []`                                                                 | 返回 `(tokenIn, 0)`；无转账，无事件                                                                                                        |
| **2**    | 无 swapPath，输入金额 ≥ 最小输出 | `amountIn = 100`，`minOutputAmount = 50`，`swapPathMarkets = []`，`receiver = Bob`                       | 调用 `bank.transferOut(tokenIn, Bob, 100, false)`；返回 `(tokenIn, 100)`                                                              |
| **3**    | 无 swapPath，输入金额 < 最小输出 | `amountIn = 50`，`minOutputAmount = 100`，`swapPathMarkets = []`                                        | 交易 Revert: `InsufficientOutputAmount(50, 100)`                                                                                   |
| **4**    | 有 swapPath，多市场链路       | `amountIn = 200`，`swapPathMarkets = [MarketX, MarketY]`，`minOutputAmount = 180`，`receiver = Bob`      | `bank.transferOut(tokenIn, MarketX, 200, false)`；路径逐步执行 MarketX→MarketY→Bob；返回 `(tokenOut, outputAmount)` 且 `outputAmount ≥ 180` |
| **5**    | SwapPath 中市场重复         | `swapPathMarkets = [MarketX, MarketX]`                                                                | 交易 Revert: `DuplicatedMarketInSwapPath(MarketX)`                                                                                 |
| **6**    | Swap 输出小于最小要求          | `amountIn = 100`，`swapPathMarkets = [MarketX]`，`_swap` 返回 `outputAmount = 60`，`minOutputAmount = 100` | 交易 Revert: `InsufficientSwapOutputAmount(60, 100)`                                                                               |
| **7**    | 最终输出需要 unwrap          | `swapPathMarkets = [MarketX]`，`shouldUnwrapNativeToken = true`，`receiver = Bob`                       | 最后一步 `_swap` 时 unwrap = true；Bob 收到原生 ETH                                                                                        |
| **8**    | 银行和接收地址相同              | `swapPathMarkets = []`，`receiver = Bank`，`amountIn = 100`，`minOutputAmount = 50`                      | 不调用 `transferOut`；直接返回 `(tokenIn, 100)`                                                                                          |
| **9**    | 带 UI Fee Receiver 的交易  | `uiFeeReceiver = Carol`，`amountIn = 1000`，`swapPathMarkets = [MarketX]`                               | `_swap` 内部分润给 Carol；最终返回 `(tokenOut, outputAmount)`                                                                              |
| **10**   | 重入攻击防护                 | 恶意合约在回调中再次调用 `swap()`                                                                                 | 交易 Revert: 被 `ReentrancyGuard` 拦截                                                                                                |


### Liquidity Math (没有找到sol文件) 



---

## 3. 边界值测试
### Swap Execution
| **场景编号** | **测试场景描述**                                    | **输入参数**                                                                     | **预期结果**                                                            |
| -------- | --------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **1**   | `amountIn` 为 `1 wei` (最小非零值)                  | `amountIn = 1`，`swapPathMarkets = []`，`minOutputAmount = 1`，`receiver = Bob` | 返回 `(tokenIn, 1)`；转账成功，不报错                                          |
| **2**   | `amountIn` = `minOutputAmount - 1`            | `amountIn = 99`，`minOutputAmount = 100`，`swapPathMarkets = []`               | 交易 Revert: `InsufficientOutputAmount(99, 100)`                      |
| **3**   | `amountIn` = `minOutputAmount` (刚好满足)         | `amountIn = 100`，`minOutputAmount = 100`，`swapPathMarkets = []`              | 返回 `(tokenIn, 100)`；不报错                                             |
| **4**   | `amountIn` 为 `uint256.max` (极大值输入)            | `amountIn = 2^256-1`，`swapPathMarkets = []`，`minOutputAmount = 1`            | 检查是否溢出；若合约安全实现（SafeCast/uint256 原生支持），应成功转账并返回 `(tokenIn, 2^256-1)` |
| **5**   | `swapPathMarkets` 长度为 1 (最短合法路径)              | `swapPathMarkets = [MarketX]`，`amountIn = 500`，`minOutputAmount = 1`         | `_swap` 正常执行一次；返回 `(tokenOut, outputAmount)`                        |
| **6**   | `swapPathMarkets` 很长 (接近 gas 限制)              | 构造 `swapPathMarkets = [Market1, Market2, …, MarketN]`，其中 N 很大                | 测试 gas 消耗，验证能否成功完成，若超出 gas 则 revert                                 |
| **7**   | `receiver = address(0)` (无效接收地址)              | `amountIn = 100`，`receiver = 0x0`，`swapPathMarkets = []`                     | 可能触发 `transferOut` 的 revert（依赖 Bank 实现）；应保证安全失败                     |
| **8**   | `uiFeeReceiver = address(0)` (未指定 UI 接收人)     | `amountIn = 1000`，`swapPathMarkets = [MarketX]`，`uiFeeReceiver = 0x0`        | `_swap` 内部应跳过 fee 逻辑，交易仍成功                                          |
| **9**   | `shouldUnwrapNativeToken = true` 但最终输出不是 WETH | `swapPathMarkets = [MarketX]` → 最终输出 USDC，`shouldUnwrapNativeToken = true`   | unwrap 不生效，直接转出 USDC；不报错                                            |
| **10**  | `dataStore` 标记未清除时再次 swap                     | 在上一次交易异常中途 revert，未执行清理；下次 swap 仍检测到 `flagExists = true`                     | 交易 Revert: `DuplicatedMarketInSwapPath(marketToken)`                |


---

## 4. 数值不变测试

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

## 5. 舍入和溢出测试

* **Rounding errors**

  * Use fuzzing (Foundry) to test small fractions and extreme values
  * Assert `abs(actual - expected) <= 1 wei`

* **Overflow / SafeCast**

  * Explicitly cast large numbers and test boundary conditions
  * Confirm `SafeCast` reverts when value > max allowed

