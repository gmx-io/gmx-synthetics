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
import "../../../contracts/token/IWNT.sol";
import "../../../contracts/role/RoleStore.sol";
import "../../../contracts/data/Keys.sol";
import "../../../contracts/mock/MintableToken.sol";

import "forge-std/Test.sol";

import "./TestHelpers.sol";
import "./TestConstants.sol";

/**
 * @dev Test deposit creation flow on deployed GMX contracts on anvil node
 */
contract DepositTest is Test {
    // Deployed contracts
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
    address ethUsdMarketToken;

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

        // Check if market exists, create if needed
        _setupMarket();
    }

    function _setupMarket() internal {
        // Check if WETH:WETH:USDC market exists
        bytes32 marketKey = keccak256(abi.encode(address(weth), address(weth), address(usdc)));

        // Try to get market from DataStore
        // Market key is stored as: keccak256(abi.encode("MARKET_BY_KEY", marketKey))
        bytes32 marketByKeyHash = keccak256(abi.encode("MARKET_BY_KEY", marketKey));
        address existingMarket = dataStore.getAddress(marketByKeyHash);

        if (existingMarket != address(0)) {
            ethUsdMarketToken = existingMarket;
            console.log("Using existing WETH:WETH:USDC market at:", ethUsdMarketToken);
            return;
        }

        // Market doesn't exist, create it
        console.log("Creating WETH:WETH:USDC market...");

        // Impersonate deployer who has CONTROLLER role
        vm.prank(TestConstants.DEPLOYER);
        Market.Props memory market = marketFactory.createMarket(
            address(weth), // indexToken
            address(weth), // longToken
            address(usdc), // shortToken
            "" // marketType (empty for DEFAULT_MARKET_TYPE)
        );
        ethUsdMarketToken = market.marketToken;

        console.log("Created WETH:WETH:USDC market at:", ethUsdMarketToken);
    }

    function testDepositCreation() public {
        console.log("\n=== Testing Deposit Creation ===");

        // Setup: Mint tokens to user
        uint256 wethAmount = TestConstants.WETH_AMOUNT;
        uint256 usdcAmount = TestConstants.USDC_AMOUNT;
        uint256 executionFee = TestConstants.EXECUTION_FEE;

        // Mint WETH to user (WETH is wrapped native token)
        vm.deal(user1, wethAmount + executionFee + TestConstants.ETH_AMOUNT_FOR_GAS); // Extra for execution fee and gas
        vm.prank(user1);
        IWNT(address(weth)).deposit{ value: wethAmount }();

        // Mint USDC to user (assuming mintable for testing)
        vm.prank(TestConstants.DEPLOYER);
        usdc.mint(user1, usdcAmount);

        console.log("User1 WETH balance:", weth.balanceOf(user1));
        console.log("User1 USDC balance:", usdc.balanceOf(user1));
        console.log("User1 ETH balance:", user1.balance);

        // Get initial deposit count
        bytes32 depositListKey = Keys.DEPOSIT_LIST;
        uint256 initialDepositCount = dataStore.getBytes32Count(depositListKey);
        console.log("Initial deposit count:", initialDepositCount);

        // Approve Router for token spending
        vm.startPrank(user1);
        weth.approve(address(router), wethAmount);
        usdc.approve(address(router), usdcAmount);
        console.log("Approved Router for token spending");

        // Create deposit parameters
        IDepositUtils.CreateDepositParams memory params = IDepositUtils.CreateDepositParams({
            addresses: IDepositUtils.CreateDepositParamsAddresses({
                receiver: user1,
                callbackContract: address(0),
                uiFeeReceiver: address(0),
                market: ethUsdMarketToken,
                initialLongToken: address(weth),
                initialShortToken: address(usdc),
                longTokenSwapPath: new address[](0),
                shortTokenSwapPath: new address[](0)
            }),
            minMarketTokens: 0,
            shouldUnwrapNativeToken: false,
            executionFee: executionFee,
            callbackGasLimit: 0,
            dataList: new bytes32[](0)
        });

        console.log("Creating deposit...");
        console.log("Market:", ethUsdMarketToken);
        console.log("Long token (WETH):", address(weth));
        console.log("Short token (USDC):", address(usdc));
        console.log("Long amount:", wethAmount);
        console.log("Short amount:", usdcAmount);

        // Create deposit using multicall to send tokens and create deposit
        bytes[] memory data = new bytes[](4);
        data[0] = abi.encodeWithSignature("sendWnt(address,uint256)", address(depositVault), executionFee);
        data[1] = abi.encodeWithSignature(
            "sendTokens(address,address,uint256)",
            address(weth),
            address(depositVault),
            wethAmount
        );
        data[2] = abi.encodeWithSignature(
            "sendTokens(address,address,uint256)",
            address(usdc),
            address(depositVault),
            usdcAmount
        );
        data[3] = abi.encodeCall(ExchangeRouter.createDeposit, (params));

        bytes[] memory results = exchangeRouter.multicall{ value: executionFee }(data);
        bytes32 depositKey = abi.decode(results[3], (bytes32));
        vm.stopPrank();

        console.log("Deposit created with key:", vm.toString(depositKey));

        // Verify deposit was created
        uint256 newDepositCount = dataStore.getBytes32Count(depositListKey);
        assertEq(newDepositCount, initialDepositCount + 1, "Deposit count should increase by 1");
        console.log("New deposit count:", newDepositCount);

        // Get deposit from DataStore
        Deposit.Props memory deposit = DepositStoreUtils.get(dataStore, depositKey);

        // Verify deposit properties
        assertEq(deposit.addresses.account, user1, "Account should be user1");
        assertEq(deposit.addresses.receiver, user1, "Receiver should be user1");
        assertEq(deposit.addresses.market, ethUsdMarketToken, "Market should match");
        assertEq(deposit.addresses.initialLongToken, address(weth), "Long token should be WETH");
        assertEq(deposit.addresses.initialShortToken, address(usdc), "Short token should be USDC");
        assertEq(deposit.numbers.initialLongTokenAmount, wethAmount, "Long token amount should match");
        assertEq(deposit.numbers.initialShortTokenAmount, usdcAmount, "Short token amount should match");
        assertEq(deposit.numbers.executionFee, executionFee, "Execution fee should match");

        console.log("\n=== Deposit Verification ===");
        console.log("Account:", deposit.addresses.account);
        console.log("Receiver:", deposit.addresses.receiver);
        console.log("Market:", deposit.addresses.market);
        console.log("Long token amount:", deposit.numbers.initialLongTokenAmount);
        console.log("Short token amount:", deposit.numbers.initialShortTokenAmount);
        console.log("Execution fee:", deposit.numbers.executionFee);
        console.log("Min market tokens:", deposit.numbers.minMarketTokens);

        // Verify tokens are in DepositVault
        uint256 vaultWethBalance = weth.balanceOf(address(depositVault));
        uint256 vaultUsdcBalance = usdc.balanceOf(address(depositVault));

        console.log("\n=== Vault Balances ===");
        console.log("DepositVault WETH balance:", vaultWethBalance);
        console.log("DepositVault USDC balance:", vaultUsdcBalance);

        assertTrue(vaultWethBalance >= wethAmount + executionFee, "DepositVault should have WETH");
        assertTrue(vaultUsdcBalance >= usdcAmount, "DepositVault should have USDC");

        console.log("\nDeposit creation test passed!");
    }
}
