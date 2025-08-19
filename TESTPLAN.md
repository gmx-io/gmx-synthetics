
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

| **场景编号** | **测试场景描述**           | **输入参数**                                                                        | **预期结果 / 不变性验证**                                                    |                               |           |
| -------- | -------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------- | --------- |
| **1**   | 单 hop swap：检查输入与输出守恒 | `amountIn = 100`，`swapPathMarkets = [MarketX]`，`minOutputAmount = 50`           | 验证 `ΔLPValue == fee + priceImpact + traderPnl` 成立；总资产变化符合 swap 定价规则 |                               |           |
| **2**   | 多 hop swap：逐步累计      | `amountIn = 200`，`swapPathMarkets = [MarketX, MarketY]`，`minOutputAmount = 150` | 每个 hop 输出应作为下一个 hop 输入，保证 `Σ(amountOut[i])` 与最终 `outputAmount` 一致   |                               |           |
| **3**   | rounding 误差检查        | 构造小数换算导致精度丢失的场景（如 1 wei 的拆分 swap）                                               | 验证最终 \`                                                             | expectedOutput - actualOutput | ≤ 1 wei\` |
| **4**   | SafeCast 溢出保护        | `amountIn = type(uint256).max`，`swapPathMarkets = []`                           | 交易应成功，不发生溢出；不变量：`outputAmount ≤ uint256.max`                        |                               |           |
| **5**   | minOutputAmount 约束   | `amountIn = 100`，`expectedOutput = 95`，`minOutputAmount = 90`                   | 验证 `outputAmount ≥ minOutputAmount`；否则 Revert                       |                               |           |
| **6**   | fee 分润不变性            | `amountIn = 1000`，`uiFeeReceiver = Carol`                                       | 验证 `amountIn = userReceived + protocolFee + uiFee` 成立；总值守恒          |                               |           |
| **7**   | unwrap 场景下守恒         | 最后一步 swap 输出 WETH=50，`shouldUnwrapNativeToken = true`                           | 验证 Bob 实际收到 ETH=50；token 总量不变（WETH→ETH 仅换壳）                         |                               |           |
| **8**   | 多用户并发时数据清理           | Alice swap 后，`dataStore` 标记清除，再由 Bob swap                                       | 验证 `dataStore` 中的标记被正确 reset，不影响下一次 swap；保证市场标志位守恒（最终均为 false）      |                               |           |

---

## 5. 舍入和溢出测试

* **Rounding errors**

  * 构造极端输入，例如 amountIn = 1、amountIn = veryLargeNumber，以及带小数比例的价格（比如 1.333...）
  * 在测试中预期值用高精度公式（比如 Python/Foundry BigNumber）计算，再和合约输出对比。
  * Assert abs(expectedOutput - actualOutput) <= 1 wei。如果超过 1 wei，说明 rounding 存在问题。

* **Overflow / SafeCast**

  * 构造输入边界值，比如 amountIn = type(uint256).max 或接近 2^128 - 1。
  * 调用 swap，观察是否触发 SafeCast revert。
  * 对于超过范围的数值，交易应当 revert（防止静默截断）。
  * 在合法范围内应当正确执行，输出与输入保持一致性。

