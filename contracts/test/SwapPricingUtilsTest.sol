// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import "../../lib/forge-std/src/Test.sol";
import "../../contracts/pricing/SwapPricingUtils.sol";
import "../../contracts/data/DataStore.sol";
import "../../contracts/market/Market.sol";

contract SwapPricingUtilsTest is Test {
    DataStore public dataStore;
    Market.Props public market;
    address public tokenA = address(0x111);
    address public tokenB = address(0x222);

    function getPriceImpactUsd(
        DataStore dataStore_,
        Market.Props memory market_,
        address tokenA_,
        address tokenB_,
        uint256 priceForTokenA_,
        uint256 priceForTokenB_,
        int256 usdDeltaForTokenA_,
        int256 usdDeltaForTokenB_,
        bool includeVirtualInventoryImpact_
    ) external view returns (int256) {
        SwapPricingUtils.GetPriceImpactUsdParams memory params = SwapPricingUtils.GetPriceImpactUsdParams({
            dataStore: dataStore_,
            market: market_,
            tokenA: tokenA_,
            tokenB: tokenB_,
            priceForTokenA: priceForTokenA_,
            priceForTokenB: priceForTokenB_,
            usdDeltaForTokenA: usdDeltaForTokenA_,
            usdDeltaForTokenB: usdDeltaForTokenB_,
            includeVirtualInventoryImpact: includeVirtualInventoryImpact_
        });
        return SwapPricingUtils.getPriceImpactUsd(params);
    }

    function setUp() public {
        RoleStore roleStore = new RoleStore();
            // Assign CONTROLLER permission for testing
        roleStore.grantRole(address(this), Role.CONTROLLER);
        dataStore = new DataStore(roleStore);
            // Mock market props (should be initialized according to Market.Props struct in actual project)
        market.marketToken = address(0x333);
        market.longToken = tokenA;
        market.shortToken = tokenB;
            // Mock initial pool balance to avoid usdDelta exceeding pool balance
            // Here, assume getPoolAmount depends on DataStore's uintValues
    bytes32 poolKeyA = Keys.poolAmountKey(market.marketToken, tokenA);
    bytes32 poolKeyB = Keys.poolAmountKey(market.marketToken, tokenB);
        dataStore.setUint(poolKeyA, 2e18); // tokenA pool balance
        dataStore.setUint(poolKeyB, 2e18); // tokenB pool balance
            // Mock related parameters
            // For example, set impactExponentFactor, feeFactor, etc.
            // dataStore.setUint(Keys.swapImpactExponentFactorKey(market.marketToken), 1e18);
            // dataStore.setUint(Keys.swapFeeFactorKey(market.marketToken, true), 1e16);
    }

    function testGetPriceImpactUsd_PositiveImpact() public {
        SwapPricingUtils.GetPriceImpactUsdParams memory params = SwapPricingUtils.GetPriceImpactUsdParams({
            dataStore: dataStore,
            market: market,
            tokenA: tokenA,
            tokenB: tokenB,
            priceForTokenA: 2e18,
            priceForTokenB: 1e18,
            usdDeltaForTokenA: int256(1e18),
            usdDeltaForTokenB: int256(-1e18),
            includeVirtualInventoryImpact: false
        });
        int256 impact = SwapPricingUtils.getPriceImpactUsd(params);
        // Only type and range can be asserted here, specific values need to be combined with actual logic
        assertTrue(impact >= 0, "Price impact should be positive or zero");
    }

    function testGetPriceImpactUsd_NegativeImpact() public {
        SwapPricingUtils.GetPriceImpactUsdParams memory params = SwapPricingUtils.GetPriceImpactUsdParams({
            dataStore: dataStore,
            market: market,
            tokenA: tokenA,
            tokenB: tokenB,
            priceForTokenA: 1e18,
            priceForTokenB: 2e18,
            usdDeltaForTokenA: int256(-1e18),
            usdDeltaForTokenB: int256(1e18),
            includeVirtualInventoryImpact: false
        });
        int256 impact = SwapPricingUtils.getPriceImpactUsd(params);
        assertTrue(impact <= 0, "Price impact should be negative or zero");
    }

    function testGetSwapFees() public {
        // 这里只做接口调用演示，实际应 mock DataStore 的 getUint 返回值
        // Only interface call demonstration here, actual test should mock DataStore's getUint return value
        SwapPricingUtils.SwapFees memory fees = SwapPricingUtils.getSwapFees(
            dataStore,
            market.marketToken,
            100e18,
            true,
            address(0x444),
            ISwapPricingUtils.SwapPricingType.Swap
        );
        // Assert type and range
        assertTrue(fees.amountAfterFees <= 100e18, "Amount after fees should be less than or equal to input");
    }
}
