// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../../contracts/router/ExchangeRouter.sol";
import "../../../contracts/exchange/DepositHandler.sol";
import "../../../contracts/deposit/DepositVault.sol";
import "../../../contracts/deposit/Deposit.sol";
import "../../../contracts/deposit/IDepositUtils.sol";
import "../../../contracts/deposit/DepositStoreUtils.sol";
import "../../../contracts/data/DataStore.sol";
import "../../../contracts/router/Router.sol";
import "../../../contracts/market/MarketFactory.sol";
import "../../../contracts/market/Market.sol";
import "../../../contracts/market/MarketToken.sol";
import "../../../contracts/token/IWNT.sol";
import "../../../contracts/role/RoleStore.sol";
import "../../../contracts/data/Keys.sol";
import "../../../contracts/mock/MintableToken.sol";
import "../../../contracts/oracle/Oracle.sol";
import "../../../contracts/oracle/OracleUtils.sol";
import "../../../contracts/price/Price.sol";
import "../../../contracts/role/Role.sol";

import "forge-std/Test.sol";
import "forge-std/Vm.sol";

import "./TestHelpers.sol";
import "./TestConstants.sol";

/**
 * @dev Test deposit flow on deployed GMX contracts on anvil node
 */
contract DepositTest is Test {
    ExchangeRouter exchangeRouter;
    DepositHandler depositHandler;
    DepositVault depositVault;
    DataStore dataStore;
    Router router;
    MarketFactory marketFactory;
    RoleStore roleStore;

    // Tokens
    IERC20 weth; // WETH is an ERC20 with additional deposit/withdraw
    MintableToken usdc;

    // Test accounts
    address user1;

    // Market
    MarketToken ethUsdMarket;

    function setUp() public {
        // Setup fork connection
        vm.createSelectFork(TestConstants.FORK_URL);

        // Load deployed contracts
        exchangeRouter = ExchangeRouter(payable(TestHelpers.loadDeploymentAddress(vm, "ExchangeRouter")));
        depositHandler = DepositHandler(payable(TestHelpers.loadDeploymentAddress(vm, "DepositHandler")));
        depositVault = DepositVault(payable(TestHelpers.loadDeploymentAddress(vm, "DepositVault")));
        dataStore = DataStore(TestHelpers.loadDeploymentAddress(vm, "DataStore"));
        router = Router(TestHelpers.loadDeploymentAddress(vm, "Router"));
        marketFactory = MarketFactory(TestHelpers.loadDeploymentAddress(vm, "MarketFactory"));
        roleStore = RoleStore(TestHelpers.loadDeploymentAddress(vm, "RoleStore"));

        // Load tokens
        weth = IERC20(TestHelpers.loadDeploymentAddress(vm, "WETH"));
        usdc = MintableToken(TestHelpers.loadDeploymentAddress(vm, "USDC"));

        // Setup accounts
        user1 = TestConstants.USER_1;

        // Setup user with ETH for gas
        vm.deal(user1, TestConstants.ETH_AMOUNT_FOR_GAS);

        // Load ethUsdMarket
        _setupMarket();

        // Grant ORDER_KEEPER role to deployer for deposit execution
        vm.prank(TestConstants.DEPLOYER);
        roleStore.grantRole(TestConstants.DEPLOYER, Role.ORDER_KEEPER);

        // Perform first deposit (mandatory any market)
        _performFirstDeposit();
    }

    function _setupMarket() internal {
        // The WETH:WETH:USDC market should already be deployed and configured
        address ethUsdMarketAddress = 0xBaA8B76537a9691CbA29563d357905364AC38D14;
        ethUsdMarket = MarketToken(payable(ethUsdMarketAddress));

        // Verify the market is properly configured by checking a key parameter
        bytes32 maxOpenInterestKey = Keys.maxOpenInterestKey(ethUsdMarketAddress, true);
        uint256 maxOpenInterest = dataStore.getUint(maxOpenInterestKey);
        assertTrue(maxOpenInterest > 0, "Max open interest key should exist");
    }

    function _performFirstDeposit() internal {
        // Setup funds for first deposit using deployer
        address firstDepositor = TestConstants.DEPLOYER;
        TestHelpers.setupFunds(
            vm,
            firstDepositor,
            address(weth),
            usdc,
            TestConstants.WETH_AMOUNT,
            TestConstants.USDC_AMOUNT
        );

        // Create first deposit with RECEIVER_FOR_FIRST_DEPOSIT as receiver
        bytes32 firstDepositKey = _createDeposit(
            firstDepositor,                             // depositor
            TestConstants.RECEIVER_FOR_FIRST_DEPOSIT,   // receiver
            address(ethUsdMarket),                      // market
            address(weth),                              // longToken
            address(usdc),                              // shortToken
            TestConstants.WETH_AMOUNT,                  // longAmount
            TestConstants.USDC_AMOUNT,                  // shortAmount
            0,                                          // minMarketTokens
            TestConstants.EXECUTION_FEE                 // executionFee
        );

        // Setup oracle and execute first deposit
        OracleUtils.SetPricesParams memory oracleParams = _getOracleParams();
        
        vm.prank(TestConstants.DEPLOYER);
        depositHandler.executeDeposit(firstDepositKey, oracleParams);

        // Verify first deposit executed successfully
        uint256 receiverMarketTokens = IERC20(address(ethUsdMarket)).balanceOf(TestConstants.RECEIVER_FOR_FIRST_DEPOSIT);
        require(receiverMarketTokens > 0, "First deposit should have minted market tokens");
    }
    
    /// @dev Helper function to create oracle prices, tokens, oracle params using the MockOracleProvider
    function _getOracleParams() internal returns (OracleUtils.SetPricesParams memory oracleParams) {
        // Create oracle params with prices
        uint256[] memory prices = new uint256[](2);
        prices[0] = 5000 * 10**30; // WETH: $5000
        prices[1] = 1 * 10**30;    // USDC: $1
        
        // Configure MockOracleProvider for tokens
        address[] memory tokens = new address[](2);
        tokens[0] = address(weth);
        tokens[1] = address(usdc);
        
        // Get MockOracleProvider address from deployment
        address mockOracleProviderAddress = TestHelpers.loadDeploymentAddress(vm, "MockOracleProvider");
        
        // Get Oracle address
        address oracleAddress = TestHelpers.loadDeploymentAddress(vm, "Oracle");
        
        vm.startPrank(TestConstants.DEPLOYER);
        
        // Grant CONTROLLER role temporarily for configuration
        roleStore.grantRole(TestConstants.DEPLOYER, Role.CONTROLLER);
        
        // Configure each token to use MockOracleProvider
        for (uint256 i = 0; i < tokens.length; i++) {
            bytes32 oracleProviderKey = Keys.oracleProviderForTokenKey(oracleAddress, tokens[i]);
            
            // Set MockOracleProvider as the provider
            dataStore.setAddress(oracleProviderKey, mockOracleProviderAddress);
        }
        
        // Enable MockOracleProvider
        bytes32 enabledKey = Keys.isOracleProviderEnabledKey(mockOracleProviderAddress);
        dataStore.setBool(enabledKey, true);
        
        vm.stopPrank();

        require(tokens.length == prices.length, "Tokens and prices length mismatch");
        
        address[] memory providers = new address[](tokens.length);
        bytes[] memory oracleData = new bytes[](tokens.length);
        
        for (uint256 i = 0; i < tokens.length; i++) {
            providers[i] = mockOracleProviderAddress; // Use MockOracleProvider for all tokens
            // MockOracleProvider expects encoded price data (min, max, timestamp)
            oracleData[i] = abi.encode(prices[i], prices[i], block.timestamp);
        }
        
        oracleParams = OracleUtils.SetPricesParams({
            tokens: tokens,
            providers: providers,
            data: oracleData
        });
        
        return oracleParams;
    }

    function _createDeposit(
        address depositor,
        address receiver,
        address market,
        address longToken,
        address shortToken,
        uint256 longAmount,
        uint256 shortAmount,
        uint256 minMarketTokens,
        uint256 executionFee
    ) internal returns (bytes32 depositKey) {
        vm.startPrank(depositor);
        
        // Approve tokens
        if (longAmount > 0) {
            IERC20(longToken).approve(address(router), longAmount);
        }
        if (shortAmount > 0) {
            IERC20(shortToken).approve(address(router), shortAmount);
        }
        
        // Create deposit params
        IDepositUtils.CreateDepositParams memory params = IDepositUtils.CreateDepositParams({
            addresses: IDepositUtils.CreateDepositParamsAddresses({
                receiver: receiver,
                callbackContract: address(0),
                uiFeeReceiver: address(0),
                market: market,
                initialLongToken: longToken,
                initialShortToken: shortToken,
                longTokenSwapPath: new address[](0),
                shortTokenSwapPath: new address[](0)
            }),
            minMarketTokens: minMarketTokens,
            shouldUnwrapNativeToken: false,
            executionFee: executionFee,
            callbackGasLimit: 0,
            dataList: new bytes32[](0)
        });
        
        // Build multicall data
        uint256 numCalls = 1; // For createDeposit
        if (executionFee > 0) numCalls++; // For sendWnt
        if (longAmount > 0) numCalls++; // For sendTokens (long)
        if (shortAmount > 0) numCalls++; // For sendTokens (short)
        
        bytes[] memory data = new bytes[](numCalls);
        uint256 callIndex = 0;
        
        // Add execution fee transfer if needed
        if (executionFee > 0) {
            data[callIndex++] = abi.encodeWithSignature(
                "sendWnt(address,uint256)", 
                address(depositVault), 
                executionFee
            );
        }
        
        // Add long token transfer if needed
        if (longAmount > 0) {
            data[callIndex++] = abi.encodeWithSignature(
                "sendTokens(address,address,uint256)",
                longToken,
                address(depositVault),
                longAmount
            );
        }
        
        // Add short token transfer if needed
        if (shortAmount > 0) {
            data[callIndex++] = abi.encodeWithSignature(
                "sendTokens(address,address,uint256)",
                shortToken,
                address(depositVault),
                shortAmount
            );
        }
        
        // Add createDeposit call
        data[callIndex] = abi.encodeCall(ExchangeRouter.createDeposit, (params));
        
        // Execute multicall
        bytes[] memory results = exchangeRouter.multicall{ value: executionFee }(data);
        depositKey = abi.decode(results[results.length - 1], (bytes32));
        
        vm.stopPrank();
        
        return depositKey;
    }

    function testCreateDeposit() public {

        // Setup: Mint tokens to user
        uint256 wethAmount = TestConstants.WETH_AMOUNT;
        uint256 usdcAmount = TestConstants.USDC_AMOUNT;
        uint256 executionFee = TestConstants.EXECUTION_FEE;

        // Setup user funds using TestHelpers
        TestHelpers.setupFunds(
            vm,
            user1,
            address(weth),
            usdc,
            wethAmount,
            usdcAmount
        );

        // Get initial deposit count
        bytes32 depositListKey = Keys.DEPOSIT_LIST;
        uint256 initialDepositCount = dataStore.getBytes32Count(depositListKey);

        // Create deposit using helper function
        bytes32 depositKey = _createDeposit(
            user1,                      // depositor
            user1,                      // receiver
            address(ethUsdMarket),      // market
            address(weth),              // longToken
            address(usdc),              // shortToken
            wethAmount,                 // longAmount
            usdcAmount,                 // shortAmount
            0,                          // minMarketTokens
            executionFee                // executionFee
        );


        // Verify deposit was created
        uint256 newDepositCount = dataStore.getBytes32Count(depositListKey);
        assertEq(newDepositCount, initialDepositCount + 1, "Deposit count should increase by 1");

        // Get deposit from DataStore
        Deposit.Props memory deposit = DepositStoreUtils.get(dataStore, depositKey);

        // Verify deposit properties
        assertEq(deposit.addresses.account, user1, "Account should be user1");
        assertEq(deposit.addresses.receiver, user1, "Receiver should be user1");
        assertEq(deposit.addresses.market, address(ethUsdMarket), "Market should match");
        assertEq(deposit.addresses.initialLongToken, address(weth), "Long token should be WETH");
        assertEq(deposit.addresses.initialShortToken, address(usdc), "Short token should be USDC");
        assertEq(deposit.numbers.initialLongTokenAmount, wethAmount, "Long token amount should match");
        assertEq(deposit.numbers.initialShortTokenAmount, usdcAmount, "Short token amount should match");
        assertEq(deposit.numbers.executionFee, executionFee, "Execution fee should match");

        // Verify tokens are in DepositVault
        uint256 vaultWethBalance = weth.balanceOf(address(depositVault));
        uint256 vaultUsdcBalance = usdc.balanceOf(address(depositVault));

        assertTrue(vaultWethBalance >= wethAmount + executionFee, "DepositVault should have WETH");
        assertTrue(vaultUsdcBalance >= usdcAmount, "DepositVault should have USDC");
    }
    
    function testExecuteDeposit() public {
        // At this point, setUp has already executed the first deposit
        // Market should have liquidity from RECEIVER_FOR_FIRST_DEPOSIT
        uint256 initialMarketTokenSupply = ethUsdMarket.totalSupply();
        
        require(initialMarketTokenSupply > 0, "Market should have liquidity from first deposit");
        
        // Setup user funds for their deposit
        TestHelpers.setupFunds(
            vm,
            user1,
            address(weth),
            usdc,
            TestConstants.WETH_AMOUNT,
            TestConstants.USDC_AMOUNT
        );
        
        // Create user deposit - this time user1 is both depositor and receiver
        bytes32 userDepositKey = _createDeposit(
            user1,                          // depositor
            user1,                          // receiver (user gets their own tokens)
            address(ethUsdMarket),          // market
            address(weth),                  // longToken
            address(usdc),                  // shortToken
            TestConstants.WETH_AMOUNT,      // longAmount
            TestConstants.USDC_AMOUNT,      // shortAmount
            0,                              // minMarketTokens
            TestConstants.EXECUTION_FEE     // executionFee
        );
        
        // Execute user deposit
        OracleUtils.SetPricesParams memory oracleParams = _getOracleParams();
        
        vm.prank(TestConstants.DEPLOYER);
        depositHandler.executeDeposit(userDepositKey, oracleParams);
        
        // Check results
        uint256 userWethAfter = weth.balanceOf(user1);
        uint256 userUsdcAfter = usdc.balanceOf(user1);
        uint256 userMarketTokens = IERC20(address(ethUsdMarket)).balanceOf(user1);
        uint256 finalMarketTokenSupply = ethUsdMarket.totalSupply();
        
        // Check deposit removal from storage
        Deposit.Props memory depositAfterExecution = DepositStoreUtils.get(dataStore, userDepositKey);
        bool depositRemoved = depositAfterExecution.addresses.account == address(0);
        
        // Assertions
        assertTrue(depositRemoved, "User deposit should be removed from storage after execution");
        assertEq(userWethAfter, 0, "User's WETH should be consumed");
        assertEq(userUsdcAfter, 0, "User's USDC should be consumed");
        assertGt(userMarketTokens, 0, "User should have received GM market tokens");
        assertGt(finalMarketTokenSupply, initialMarketTokenSupply, "Market token supply should increase");
    }
}
