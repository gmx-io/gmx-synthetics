
# GMX Synthetics Test Plan

This test plan covers the main contract and TypeScript test scripts for the GMX Synthetics project, focusing on swap pricing, liquidation, market utilities, and handler logic. The plan ensures both Solidity and TypeScript tests are well organized and provide comprehensive coverage for core features.

## 1. Solidity Contract Tests (`contracts/test/`)

### 1.1 LiquidationUtilsTest.sol
- **Purpose:** Test the creation and permission logic for liquidation orders.
- **Coverage:**
	- Role assignment and access control.
	- Liquidation order creation with/without proper permissions.
	- DataStore and EventEmitter initialization.

### 1.2 MarketUtilsTest.sol
- **Purpose:** Validate market utility functions.
- **Coverage:**
	- Swap market validation.
	- Opposite token retrieval.
	- Usage factor and pool USD calculations.

### 1.3 SwapHandlerTest.sol
- **Purpose:** Test swap handler logic and permission checks.
- **Coverage:**
	- Swap execution with/without CONTROLLER role.
	- Swap parameter mocking and state assertions.

### 1.4 SwapPricingUtilsTest.sol
- **Purpose:** Test swap pricing logic and fee calculations.
- **Coverage:**
	- Price impact calculation (positive/negative scenarios).
	- Swap fee calculation and assertions.
	- Market and DataStore setup for pricing tests.

## 2. TypeScript Test Scripts (`test/task/`)

### 2.1 LiquidationUtils.ts
- **Purpose:** Test liquidation logic using Hardhat and ethers.js.
- **Coverage:**
	- RoleStore and DataStore deployment.
	- Permission checks and liquidation order creation.
	- Mocking contract state and event assertions.

### 2.2 MarketUtils.ts
- **Purpose:** Test market utility functions in a TypeScript environment.
- **Coverage:**
	- Market property mocking.
	- Usage factor and pool calculations.
	- Swap market validation and token logic.

### 2.3 SwapHandler.ts
- **Purpose:** Test swap handler logic and contract interactions.
- **Coverage:**
	- Swap execution with various parameters.
	- Permission checks and error handling.
	- State assertions after swap operations.

### 2.4 SwapPricingUtils.ts
- **Purpose:** Test swap pricing logic and fee calculations in TypeScript.
- **Coverage:**
	- Price impact calculation for different swap scenarios.
	- Fee factor and impact factor mocking.
	- Assertion of output types and ranges.

## 3. General Guidelines
- All tests should be run using the appropriate framework:
	- Solidity: `forge test` (Foundry)
	- TypeScript: `npx hardhat test`
- Ensure all mock data and contract deployments match the expected structure and logic of the main contracts.
- Permission and role checks must be included in all relevant tests.
- Edge cases (zero amounts, slippage breaches, permission errors) should be explicitly tested.
- All assertions should check both type and value/range where applicable.

## 4. Maintenance
- Update this test plan whenever new test files are added or major logic changes occur.
- Ensure all test scripts and contracts remain in their designated directories for consistency.

---
This test plan provides a clear structure for maintaining and expanding the test coverage of GMX Synthetics. For any new features, add corresponding test cases and update this document accordingly.
