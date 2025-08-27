# Test Plan for GMX Synthetics Swap Module

---

## 1. Test Plan Overview

### Goals
- Achieve **≥ 90% line coverage**
- Achieve **≥ 80% branch coverage**
- Ensure all **numerical calculations**, **overflow protection**, and **edge cases** are explicitly tested

### Core Modules
| Module              | Functionality |
|---------------------|---------------|
| **SwapHandler.sol** | Core trade execution logic (perp/spot swaps, fees, slippage, reentrancy protection) |
| **SwapUtils.sol**   | Swap path handling, validation, event emission, integration with Bank and Market |
| **SwapUtils.t.sol** | Foundry-based invariants, fuzzing, Solidity-native correctness checks |

---

## 2. Functional Path Testing

### Swap Execution Scenarios

| ID | Scenario Description | Input Parameters | Expected Result |
|----|----------------------|------------------|-----------------|
| 1  | Zero input amount | `amountIn = 0, swapPathMarkets = []` | Return `(tokenIn, 0)`; no transfers, no events |
| 2  | Direct swap without path (valid) | `amountIn = 100, minOutputAmount = 50, swapPathMarkets = [], receiver = Bob` | `bank.transferOut(tokenIn, Bob, 100, false)`; return `(tokenIn, 100)` |
| 3  | Direct swap with insufficient output | `amountIn = 50, minOutputAmount = 100, swapPathMarkets = []` | Revert: `InsufficientOutputAmount(50, 100)` |
| 4  | Multi-market swap path | `amountIn = 200, swapPathMarkets = [MarketX, MarketY], minOutputAmount = 180, receiver = Bob` | Stepwise execution `MarketX → MarketY → Bob`; return `(tokenOut, outputAmount)` with `outputAmount ≥ 180` |
| 5  | Duplicate market in path | `swapPathMarkets = [MarketX, MarketX]` | Revert: `DuplicatedMarketInSwapPath(MarketX)` |
| 6  | Swap output below min requirement | `amountIn = 100, swapPathMarkets = [MarketX], output = 60, minOutputAmount = 100` | Revert: `InsufficientSwapOutputAmount(60, 100)` |
| 7  | Final unwrap to native token | `swapPathMarkets = [MarketX], shouldUnwrapNativeToken = true, receiver = Bob` | Bob receives native ETH; return `(ETH, outputAmount)` |
| 8  | Receiver is the Bank | `receiver = Bank, swapPathMarkets = [], amountIn = 100, minOutputAmount = 50` | Skip `transferOut`; directly return `(tokenIn, 100)` |
| 9  | With UI fee receiver | `uiFeeReceiver = Carol, amountIn = 1000, swapPathMarkets = [MarketX]` | Internal fee split to Carol; return `(tokenOut, outputAmount)` |
| 10 | Reentrancy attack prevention | Malicious contract re-calls `swap()` inside callback | Revert: blocked by `ReentrancyGuard` |

---

## 3. Boundary Value Testing

| ID | Scenario Description | Input Parameters | Expected Result |
|----|----------------------|------------------|-----------------|
| 1  | Minimum nonzero amount | `amountIn = 1 wei, swapPathMarkets = [], minOutputAmount = 1, receiver = Bob` | Return `(tokenIn, 1)`; transfer succeeds |
| 2  | Input < minOutputAmount | `amountIn = 99, minOutputAmount = 100` | Revert: `InsufficientOutputAmount(99, 100)` |
| 3  | Input = minOutputAmount | `amountIn = 100, minOutputAmount = 100` | Return `(tokenIn, 100)`; no revert |
| 4  | Max integer input | `amountIn = 2^256-1, minOutputAmount = 1` | Transfer succeeds; return `(tokenIn, 2^256-1)` |
| 5  | Minimum path length (1 hop) | `swapPathMarkets = [MarketX], amountIn = 500` | Executes successfully; return `(tokenOut, outputAmount)` |
| 6  | Very long path (gas stress) | `swapPathMarkets = [Market1…MarketN], N large` | Executes until gas limit; if exceeded → revert |
| 7  | Invalid receiver | `receiver = address(0), amountIn = 100` | Revert from `Bank.transferOut` |
| 8  | No UI fee receiver | `uiFeeReceiver = 0x0, amountIn = 1000, swapPathMarkets = [MarketX]` | Fee logic skipped; executes successfully |
| 9  | Unwrap requested but final token not WETH | `swapPathMarkets = [MarketX], final token = USDC, shouldUnwrapNativeToken = true` | No unwrap applied; USDC transferred |
| 10 | Residual datastore flag | Prior tx aborted leaving flag uncleared; new swap reuses same market | Revert: `DuplicatedMarketInSwapPath(marketToken)` |

---

## 4. Numerical Invariants Testing

| ID | Scenario Description | Input Parameters | Expected Invariant |
|----|----------------------|------------------|--------------------|
| 1  | Single-hop value conservation | `amountIn = 100, swapPathMarkets = [MarketX], minOutputAmount = 50` | `ΔLPValue == fee + priceImpact + traderPnl`; assets conserved |
| 2  | Multi-hop cumulative path | `amountIn = 200, swapPathMarkets = [MarketX, MarketY]` | Output of hop i = input of hop i+1; final output consistent |
| 3  | Rounding error check | `amountIn = 1 wei` | `abs(expected - actual) ≤ 1 wei` |
| 4  | Overflow protection | `amountIn = 2^256-1` | No overflow; outputAmount ≤ `uint256.max` |
| 5  | Min output enforcement | `amountIn = 100, expectedOutput = 95, minOutputAmount = 90` | If `< minOutputAmount` → revert; else pass |
| 6  | Fee distribution invariant | `amountIn = 1000, uiFeeReceiver = Carol` | `input == userReceived + protocolFee + uiFee` |
| 7  | Unwrap conservation | `final output WETH = 50, shouldUnwrapNativeToken = true` | Bob receives 50 ETH; supply conserved |
| 8  | Multi-user concurrency | Alice swaps, then Bob swaps | Flags reset between swaps; no cross-user contamination |

---

## 5. Rounding & Overflow Testing

### Rounding Errors
- Construct edge values:
  - `amountIn = 1 wei`
  - `amountIn = veryLargeNumber`
  - Fractional oracle prices
- Compute expected outputs using **high-precision math** (Python/BigNumber).
- Assert: `abs(expectedOutput - actualOutput) ≤ 1 wei`.

### Overflow / SafeCast
- Test with:
  - `amountIn = type(uint256).max`
  - `amountIn` near `2^128-1`
- Expected behavior:
  - Swap succeeds safely or reverts explicitly.
  - Must not silently truncate values.
  - For legal ranges, swaps preserve value consistency.

---

## 6. Exit Criteria
- All **functional**, **boundary**, and **invariant** tests pass.
- ≥ 90% line coverage and ≥ 80% branch coverage achieved.
- No critical bugs remain unresolved.

---

## 7. Risks & Mitigation
- **Logic mismatch** between Solidity and TypeScript tests → *Cross-verify with same parameters*.  
- **False positives** due to mocks → *Add real contract deployment tests*.  
- **Gas exhaustion** on long swap paths → *Set practical path length limits*.  

---

## 8. Deliverables
- Test case execution results.
- Coverage reports (Foundry + Hardhat).
- Bug/issue tracking logs.

---

## 9. References
- `SwapHandler.sol`
- `SwapUtils.sol`
- `test/SwapHandler.test.ts`
- `test/SwapUtils.test.ts`
- `test/SwapUtils.t.sol`
- OpenZeppelin Contracts documentation
- Foundry & Hardhat documentation
