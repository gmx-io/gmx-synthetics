// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../swap/SwapHandler.sol";
import "../swap/SwapUtils.sol"; 
import "../bank/Bank.sol";      
import "../market/Market.sol";  
import "../data/DataStore.sol";
import "../event/EventEmitter.sol";
import "../oracle/Oracle.sol";

contract SwapHandlerTest is Test {
    SwapHandler swapHandler;
    DataStore dataStore;
    EventEmitter eventEmitter;
    Oracle oracle;
    Bank bank;
    RoleStore roleStore;

    address alice = address(0xAAA1);
    address bob   = address(0xBBB1);
    address carol = address(0xCCC1);
    address tokenA = makeAddr("tokenA");
    address market  = makeAddr("market1");

    function setUp() public {
        roleStore = new RoleStore();
        swapHandler = new SwapHandler(roleStore);

        dataStore = new DataStore();
        eventEmitter = new EventEmitter();
        oracle = new Oracle();
        bank = new Bank();
        
        tokenA = makeAddr("tokenA");
        vm.deal(alice, 100 ether);
    }

    // ------------------------------
    // 功能路径测试
    // ------------------------------

    /// 场景1: 输入金额为0
    function testSwapAmountZero() public {
        SwapUtils.SwapParams memory params;
        params.amountIn = 0;
        params.tokenIn = tokenA;
        (address tokenOut, uint256 outputAmount) = swapHandler.swap(params);
        assertEq(tokenOut, params.tokenIn);
        assertEq(outputAmount, 0);
    }

    /// 场景2: 无 swapPath，输入金额满足最小输出
    function testSwapNoPathSuccess() public {
        SwapUtils.SwapParams memory params;
        params.tokenIn = tokenA;
        params.amountIn = 100;
        params.minOutputAmount = 50;
        params.receiver = bob;
        (address tokenOut, uint256 outputAmount) = swapHandler.swap(params);
        assertEq(tokenOut, params.tokenIn);
        assertEq(outputAmount, 100);
    }

    /// 场景3: 无 swapPath，输入金额 < 最小输出
    function testSwapNoPathRevertOnInsufficientOutput() public {
        SwapUtils.SwapParams memory params;
        params.tokenIn = tokenA;
        params.amountIn = 50;
        params.minOutputAmount = 100;
        vm.expectRevert();
        swapHandler.swap(params);
    }

    /// 场景4: fuzz 多 hop swap
    function testFuzzMultiHopSwap(uint256 amountIn) public {
        vm.assume(amountIn > 0 && amountIn < 1e30);

        // 构造1-hop路径
        Market.Props ;
        path[0] = Market.Props({ marketToken: market });

        SwapUtils.SwapParams memory params;
        params.tokenIn = tokenA;
        params.amountIn = amountIn;
        params.minOutputAmount = 1;
        params.receiver = bob;
        params.swapPathMarkets = path;

        (address tokenOut, uint256 outputAmount) = swapHandler.swap(params);

        assertGe(outputAmount, 1);
        assertEq(tokenOut != address(0), true); // 任意非零输出
    }

    /// 场景5: SwapPath中市场重复
    function testSwapRevertOnDuplicatedMarket() public {
        Market.Props ;
        path[0] = Market.Props({ marketToken: market });
        path[1] = Market.Props({ marketToken: market });

        SwapUtils.SwapParams memory params;
        params.tokenIn = tokenA;
        params.amountIn = 100;
        params.swapPathMarkets = path;

        vm.expectRevert();
        swapHandler.swap(params);
    }

    /// 场景6: 输出小于最小要求
    function testSwapRevertOnLowOutput() public {
        Market.Props ;
        path[0] = Market.Props({ marketToken: market });

        SwapUtils.SwapParams memory params;
        params.amountIn = 100;
        params.minOutputAmount = 200;
        params.swapPathMarkets = path;

        vm.expectRevert();
        swapHandler.swap(params);
    }

    // ------------------------------
    // 边界值测试
    // ------------------------------

    function testSwapMinAmount() public {
        SwapUtils.SwapParams memory params;
        params.tokenIn = tokenA;
        params.amountIn = 1;
        params.minOutputAmount = 1;
        params.receiver = bob;

        (address tokenOut, uint256 outputAmount) = swapHandler.swap(params);
        assertEq(outputAmount, 1);
        assertEq(tokenOut, params.tokenIn);
    }

    function testSwapMaxAmount() public {
        SwapUtils.SwapParams memory params;
        params.tokenIn = tokenA;
        params.amountIn = type(uint256).max;
        params.minOutputAmount = 1;
        params.receiver = bob;

        (address tokenOut, uint256 outputAmount) = swapHandler.swap(params);
        assertEq(outputAmount, type(uint256).max);
        assertEq(tokenOut, params.tokenIn);
    }

    // ------------------------------
    // 数值不变性测试
    // ------------------------------

    /// N1: 验证 output >= minOutputAmount
    function testInvariantMinOutput(uint256 amountIn, uint256 minOut) public {
        vm.assume(amountIn > 0 && amountIn < 1e30);
        vm.assume(minOut <= amountIn);

        SwapUtils.SwapParams memory params;
        params.tokenIn = tokenA;
        params.amountIn = amountIn;
        params.minOutputAmount = minOut;
        params.receiver = bob;

        (address tokenOut, uint256 outputAmount) = swapHandler.swap(params);

        assertGe(outputAmount, minOut);
        assertEq(tokenOut, params.tokenIn);
    }

    /// N3: rounding 误差检查 (构造小数分割场景)
    function testInvariantRoundingError() public {
        uint256 amountIn = 1;
        SwapUtils.SwapParams memory params;
        params.tokenIn = tokenA;
        params.amountIn = amountIn;
        params.minOutputAmount = 1;
        params.receiver = bob;

        ( , uint256 outputAmount) = swapHandler.swap(params);

        uint256 expected = 1;
        assertLe(expected - outputAmount <= 1, true);
    }
}