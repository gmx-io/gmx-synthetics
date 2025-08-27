// forge-tests/SwapUtils.t.sol
pragma solidity ^0.8.0;

// Foundry test utils
import "forge-std/Test.sol";

// repo contracts (paths kept as in your original file)
import "../../contracts/swap/SwapUtils.sol";
import "../../contracts/data/DataStore.sol";
import "../../contracts/data/Keys.sol";
import "../../contracts/market/Market.sol";
import "../../contracts/oracle/Oracle.sol";
import "../../contracts/bank/Bank.sol";
import "../../contracts/event/EventEmitter.sol";
import "../../contracts/price/Price.sol";
import "../../contracts/swap/ISwapPricingUtils.sol";

contract MockBank {
    // minimal mock: same external signature used by SwapUtils
    function transferOut(address /*token*/, address /*receiver*/, uint256 /*amount*/, bool /*unwrapNativeToken*/) external pure {
        // no-op
    }
}

contract MockOracle {
    // Return a Price.Props with min = max = 1e18 ($1)
    function getPrimaryPrice(address /*token*/) external pure returns (Price.Props memory) {
        return Price.Props({min: 1e18, max: 1e18});
    }
}

contract MockEventEmitter {
    // placeholder to satisfy calls - no-op
    function emitEventLog1(bytes32 /*eventName*/, bytes32 /*topic1*/, EventUtils.EventLogData memory /*eventData*/) external pure {
        // no-op
    }
}

contract SwapUtilsTest is Test {
    // using SwapUtils for SwapUtils.SwapParams; // not needed for calling external library fn

    DataStore internal dataStore;
    MockEventEmitter internal mockEventEmitter;
    MockOracle internal mockOracle;
    MockBank internal mockBank;

    // tokens / market addresses used in tests
    address internal tokenA = address(0x1);
    address internal tokenB = address(0x2);
    address internal marketToken = address(0x3);

    function setUp() public {
        // Deploy the real DataStore from repo (it should compile in your repo)
        dataStore = new DataStore();

        // Deploy mocks
        mockEventEmitter = new MockEventEmitter();
        mockOracle = new MockOracle();
        mockBank = new MockBank();

        // Setup a single market (we don't deploy a Market contract; Market.Props is a struct)
        // Set pool amounts for both tokens in the market
        dataStore.setUint(Keys.poolAmountKey(marketToken, tokenA), 1000e18);
        dataStore.setUint(Keys.poolAmountKey(marketToken, tokenB), 1000e18);

        // Set fee factors (these keys are used by SwapPricingUtils / FeeUtils in repo)
        // NOTE: the numeric representations assume the repo uses 1e18 scaling for decimals
        dataStore.setUint(Keys.swapFeeFactorKey(marketToken, true), 0.01e18);  // 1% (buy)
        dataStore.setUint(Keys.swapFeeFactorKey(marketToken, false), 0.02e18); // 2% (sell)

        // Set swap fee receiver factor (example): 50% to sdk receiver
        dataStore.setUint(Keys.SWAP_FEE_RECEIVER_FACTOR, 0.5e18);

        // Debug log for test runs
        emit log_named_uint("poolAmount tokenA", dataStore.getUint(Keys.poolAmountKey(marketToken, tokenA)));
        emit log_named_uint("poolAmount tokenB", dataStore.getUint(Keys.poolAmountKey(marketToken, tokenB)));
    }

    function test_SingleMarketSwap_PositiveImpact() public {
        // Construct one-market path (swap tokenA -> tokenB)
        Market.Props;
        markets[0] = Market.Props({
            marketToken: marketToken,
            indexToken: address(0),
            longToken: tokenA,
            shortToken: tokenB
        });

        // Build SwapParams. Note: we cast our mock contracts' addresses to expected contract types.
        SwapUtils.SwapParams memory params = SwapUtils.SwapParams({
            dataStore: dataStore,
            eventEmitter: EventEmitter(address(mockEventEmitter)),
            oracle: Oracle(address(mockOracle)),
            bank: Bank(payable(address(mockBank))),
            key: keccak256("test_single_positive"),
            tokenIn: tokenA,
            amountIn: 100e18,
            swapPathMarkets: markets,
            minOutputAmount: 90e18,
            receiver: address(0x4),
            uiFeeReceiver: address(0x5),
            shouldUnwrapNativeToken: false,
            swapPricingType: ISwapPricingUtils.SwapPricingType.Swap
        });

        // Call swap (library external call)
        (address outputToken, uint256 outputAmount) = SwapUtils.swap(params);

        // Basic assertions
        assertEq(outputToken, tokenB, "Output token should be tokenB");
        assertTrue(outputAmount >= 90e18, "Output amount should meet minimum");
    }

    function test_MultiMarketSwap() public {
        // Create two markets in path: A->B then B->A
        Market.Props;
        markets[0] = Market.Props({marketToken: address(0x10), indexToken: address(0), longToken: tokenA, shortToken: tokenB});
        markets[1] = Market.Props({marketToken: address(0x11), indexToken: address(0), longToken: tokenB, shortToken: tokenA});

        // Ensure swap path flags are clear (SwapUtils will set them during execution)
        dataStore.setBool(Keys.swapPathMarketFlagKey(address(0x10)), false);
        dataStore.setBool(Keys.swapPathMarketFlagKey(address(0x11)), false);

        SwapUtils.SwapParams memory params = SwapUtils.SwapParams({
            dataStore: dataStore,
            eventEmitter: EventEmitter(address(mockEventEmitter)),
            oracle: Oracle(address(mockOracle)),
            bank: Bank(payable(address(mockBank))),
            key: keccak256("test_multi"),
            tokenIn: tokenA,
            amountIn: 100e18,
            swapPathMarkets: markets,
            minOutputAmount: 80e18,
            receiver: address(0x4),
            uiFeeReceiver: address(0x5),
            shouldUnwrapNativeToken: false,
            swapPricingType: ISwapPricingUtils.SwapPricingType.Swap
        });

        (address outputToken, uint256 outputAmount) = SwapUtils.swap(params);

        // After A->B->A we expect the output token to be the original
        assertEq(outputToken, tokenA, "Output token should be tokenA");
        assertTrue(outputAmount >= 80e18, "Output amount should meet minimum");
    }

    function test_Revert_InvalidTokenIn() public {
        Market.Props;
        markets[0] = Market.Props({marketToken: marketToken, indexToken: address(0), longToken: tokenA, shortToken: tokenB});

        SwapUtils.SwapParams memory params = SwapUtils.SwapParams({
            dataStore: dataStore,
            eventEmitter: EventEmitter(address(mockEventEmitter)),
            oracle: Oracle(address(mockOracle)),
            bank: Bank(payable(address(mockBank))),
            key: keccak256("test_invalid_token"),
            tokenIn: address(0x9), // invalid token (neither longToken nor shortToken)
            amountIn: 100e18,
            swapPathMarkets: markets,
            minOutputAmount: 0,
            receiver: address(0x4),
            uiFeeReceiver: address(0x5),
            shouldUnwrapNativeToken: false,
            swapPricingType: ISwapPricingUtils.SwapPricingType.Swap
        });

        // Expect any revert (matching specific custom error selectors is fragile across versions)
        vm.expectRevert();
        SwapUtils.swap(params);
    }

    function test_Revert_InsufficientOutput() public {
        Market.Props;
        markets[0] = Market.Props({marketToken: marketToken, indexToken: address(0), longToken: tokenA, shortToken: tokenB});

        SwapUtils.SwapParams memory params = SwapUtils.SwapParams({
            dataStore: dataStore,
            eventEmitter: EventEmitter(address(mockEventEmitter)),
            oracle: Oracle(address(mockOracle)),
            bank: Bank(payable(address(mockBank))),
            key: keccak256("test_insufficient_output"),
            tokenIn: tokenA,
            amountIn: 100e18,
            swapPathMarkets: markets,
            minOutputAmount: 200e18, // unrealistic high min -> should revert
            receiver: address(0x4),
            uiFeeReceiver: address(0x5),
            shouldUnwrapNativeToken: false,
            swapPricingType: ISwapPricingUtils.SwapPricingType.Swap
        });

        vm.expectRevert();
        SwapUtils.swap(params);
    }

    function test_Revert_DuplicateMarket() public {
        Market.Props;
        markets[0] = Market.Props({marketToken: marketToken, indexToken: address(0), longToken: tokenA, shortToken: tokenB});
        markets[1] = Market.Props({marketToken: marketToken, indexToken: address(0), longToken: tokenB, shortToken: tokenA}); // duplicate marketToken

        SwapUtils.SwapParams memory params = SwapUtils.SwapParams({
            dataStore: dataStore,
            eventEmitter: EventEmitter(address(mockEventEmitter)),
            oracle: Oracle(address(mockOracle)),
            bank: Bank(payable(address(mockBank))),
            key: keccak256("test_dup"),
            tokenIn: tokenA,
            amountIn: 100e18,
            swapPathMarkets: markets,
            minOutputAmount: 0,
            receiver: address(0x4),
            uiFeeReceiver: address(0x5),
            shouldUnwrapNativeToken: false,
            swapPricingType: ISwapPricingUtils.SwapPricingType.Swap
        });

        vm.expectRevert();
        SwapUtils.swap(params);
    }

    function test_FeesCalculation() public {
        Market.Props;
        markets[0] = Market.Props({marketToken: marketToken, indexToken: address(0), longToken: tokenA, shortToken: tokenB});

        SwapUtils.SwapParams memory params = SwapUtils.SwapParams({
            dataStore: dataStore,
            eventEmitter: EventEmitter(address(mockEventEmitter)),
            oracle: Oracle(address(mockOracle)),
            bank: Bank(payable(address(mockBank))),
            key: keccak256("test_fees"),
            tokenIn: tokenA,
            amountIn: 100e18,
            swapPathMarkets: markets,
            minOutputAmount: 0,
            receiver: address(0x4),
            uiFeeReceiver: address(0x5),
            shouldUnwrapNativeToken: false,
            swapPricingType: ISwapPricingUtils.SwapPricingType.Swap
        });

        ( , uint256 outputAmount) = SwapUtils.swap(params);

        // Verify fees were recorded to dataStore (claimable fee amount > 0)
        uint256 claimableFee = dataStore.getUint(Keys.claimableFeeAmountKey(
            marketToken,
            tokenA,
            Keys.SWAP_FEE_TYPE
        ));

        // Fee should be non-zero because we set swap fee factors in setUp
        assertTrue(claimableFee > 0, "Fees should be claimable");

        // Because fees exist, the poolAmountOut (amount sent from pool side) should be <= input valuation
        // We simply assert outputAmount is not unreasonably large
        assertTrue(outputAmount < 150e18, "Output shouldn't be absurdly large");
    }
}
