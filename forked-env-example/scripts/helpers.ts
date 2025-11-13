import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";
import {
  IExchangeRouter,
  IOrderHandler,
  IOracle,
  IReader,
  IDataStore,
  IRoleStore,
  IOracleStore,
  MockOracleProvider,
} from "../typechain-types";

// ============================================================================
// Constants - GMX Arbitrum Addresses
// ============================================================================

export const GMX_ADDRESSES = {
  // Core contracts
  EXCHANGE_ROUTER: "0x87d66368cD08a7Ca42252f5ab44B2fb6d1Fb8d15",
  ORDER_HANDLER: "0x04315E233C1c6FfA61080B76E29d5e8a1f7B4A35",
  ORACLE: "0x7F01614cA5198Ec979B1aAd1DAF0DE7e0a215BDF",
  DATA_STORE: "0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8",
  ROLE_STORE: "0x3c3d99FD298f679DBC2CEcd132b4eC4d0F5e6e72",
  READER: "0x65A6CC451BAfF7e7B4FDAb4157763aB4b6b44D0E",
  ORACLE_STORE: "0xb34f4A8B0D2c76b8a2B204Ae43fE48f9FdE45aaF",
  ORDER_VAULT: "0x31eF83a530Fde1B38EE9A18093A333D8Bbbc40D5",

  // Oracle providers
  CHAINLINK_DATA_STREAM_PROVIDER: "0xE1d5a068c5b75E0c7Ea1A9Fe8EA056f9356C6fFD",

  // Markets
  ETH_USD_MARKET: "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336",
  BTC_USD_MARKET: "0x47c031236e19d024b42f8AE6780E44A573170703",

  // Tokens
  WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
};

// ============================================================================
// DataStore Keys (matching Keys library in Solidity)
// ============================================================================

export const Keys = {
  // Note: These use ABI.encode (not toUtf8Bytes) to match Solidity keccak256(abi.encode(...))
  ORDER_LIST: ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["ORDER_LIST"])),
  POSITION_LIST: ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["POSITION_LIST"])),
  // ORDER_KEEPER hash: 0x40a07f8f0fc57fcf18b093d96362a8e661eaac7b7e6edbf66f242111f83a6794 (verified from Role.sol)
  ORDER_KEEPER: ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["ORDER_KEEPER"])),

  accountOrderListKey: (account: string) => {
    // ACCOUNT_ORDER_LIST constant: keccak256(abi.encode("ACCOUNT_ORDER_LIST"))
    const ACCOUNT_ORDER_LIST = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["string"], ["ACCOUNT_ORDER_LIST"])
    );
    // Account key: keccak256(abi.encode(ACCOUNT_ORDER_LIST, account))
    return ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["bytes32", "address"], [ACCOUNT_ORDER_LIST, account])
    );
  },

  accountPositionListKey: (account: string) => {
    // ACCOUNT_POSITION_LIST constant: keccak256(abi.encode("ACCOUNT_POSITION_LIST"))
    const ACCOUNT_POSITION_LIST = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["string"], ["ACCOUNT_POSITION_LIST"])
    );
    // Account key: keccak256(abi.encode(ACCOUNT_POSITION_LIST, account))
    return ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["bytes32", "address"], [ACCOUNT_POSITION_LIST, account])
    );
  },
};

// ============================================================================
// Contract Instances
// ============================================================================

export interface GMXContracts {
  exchangeRouter: IExchangeRouter;
  orderHandler: IOrderHandler;
  oracle: IOracle;
  reader: IReader;
  dataStore: IDataStore;
  roleStore: IRoleStore;
  oracleStore: IOracleStore;
}

/**
 * Load all GMX contracts at their deployed addresses
 */
export async function loadGMXContracts(): Promise<GMXContracts> {
  const exchangeRouter = (await ethers.getContractAt(
    "IExchangeRouter",
    GMX_ADDRESSES.EXCHANGE_ROUTER
  )) as IExchangeRouter;
  const orderHandler = (await ethers.getContractAt("IOrderHandler", GMX_ADDRESSES.ORDER_HANDLER)) as IOrderHandler;
  const oracle = (await ethers.getContractAt("IOracle", GMX_ADDRESSES.ORACLE)) as IOracle;
  const reader = (await ethers.getContractAt("IReader", GMX_ADDRESSES.READER)) as IReader;
  const dataStore = (await ethers.getContractAt("IDataStore", GMX_ADDRESSES.DATA_STORE)) as IDataStore;
  const roleStore = (await ethers.getContractAt("IRoleStore", GMX_ADDRESSES.ROLE_STORE)) as IRoleStore;
  const oracleStore = (await ethers.getContractAt("IOracleStore", GMX_ADDRESSES.ORACLE_STORE)) as IOracleStore;

  return {
    exchangeRouter,
    orderHandler,
    oracle,
    reader,
    dataStore,
    roleStore,
    oracleStore,
  };
}

// ============================================================================
// Account Management (Anvil-specific)
// ============================================================================

/**
 * Fund an address with ETH using Anvil's anvil_setBalance RPC
 */
export async function dealETH(address: string, amount: BigNumber): Promise<void> {
  const provider = ethers.provider;
  await provider.send("anvil_setBalance", [address, amount.toHexString()]);
  console.log(`Funded ${address} with ${ethers.utils.formatEther(amount)} ETH`);
}

/**
 * Fund an address with ERC20 tokens using Anvil's anvil_impersonateAccount
 */
export async function dealTokens(tokenAddress: string, recipient: string, amount: BigNumber): Promise<void> {
  const token = await ethers.getContractAt("IERC20", tokenAddress);

  // Known whale addresses on Arbitrum (have large balances)
  const whales: Record<string, string> = {
    [GMX_ADDRESSES.WETH.toLowerCase()]: "0x489ee077994B6658eAfA855C308275EAd8097C4A", // Arbitrum: Gateway
    [GMX_ADDRESSES.USDC.toLowerCase()]: "0x489ee077994B6658eAfA855C308275EAd8097C4A", // Arbitrum: Gateway
  };

  const whale = whales[tokenAddress.toLowerCase()];
  if (!whale) {
    throw new Error(`No whale address known for token ${tokenAddress}`);
  }

  // Impersonate the whale
  await ethers.provider.send("anvil_impersonateAccount", [whale]);
  const whaleSigner = await ethers.getSigner(whale);

  // Transfer tokens
  await token.connect(whaleSigner).transfer(recipient, amount);

  // Stop impersonating
  await ethers.provider.send("anvil_stopImpersonatingAccount", [whale]);

  console.log(`Funded ${recipient} with ${amount.toString()} tokens at ${tokenAddress}`);
}

// ============================================================================
// Keeper Management
// ============================================================================

/**
 * Get an active ORDER_KEEPER address
 */
export async function getActiveKeeper(roleStore: IRoleStore): Promise<string> {
  // Try to get keeper from RoleStore
  const keeperCount = await roleStore.getRoleMemberCount(Keys.ORDER_KEEPER);

  if (keeperCount.gt(0)) {
    const keepers = await roleStore.getRoleMembers(Keys.ORDER_KEEPER, 0, 1);
    const keeper = keepers[0];
    console.log(`Active keeper found from RoleStore: ${keeper}`);
    return keeper;
  }

  // Fallback: Use known keeper address from recent mainnet blocks
  const KNOWN_KEEPER = "0xE47b36382DC50b90bCF6176Ddb159C4b9333A7AB";
  console.log(`Using known keeper address (fallback): ${KNOWN_KEEPER}`);
  console.log(`  Note: No keepers registered at this fork block`);
  return KNOWN_KEEPER;
}

// ============================================================================
// Oracle Price Mocking (Anvil-specific)
// ============================================================================

/**
 * Setup mock oracle provider using Anvil's anvil_setCode RPC
 */
export async function setupMockOracleProvider(wethPriceUSD: number, usdcPriceUSD: number): Promise<void> {
  console.log("\n=== Setting up mock oracle provider ===");

  // Deploy MockOracleProvider
  const MockOracleProviderFactory = await ethers.getContractFactory("MockOracleProvider");
  const mockImpl = await MockOracleProviderFactory.deploy();
  await mockImpl.deployed();
  const mockImplAddress = mockImpl.address;

  console.log(`MockOracleProvider deployed at: ${mockImplAddress}`);

  // Get the bytecode of the deployed mock
  const mockBytecode = await ethers.provider.getCode(mockImplAddress);

  // Replace bytecode at the production Chainlink Data Streams provider address
  await ethers.provider.send("anvil_setCode", [GMX_ADDRESSES.CHAINLINK_DATA_STREAM_PROVIDER, mockBytecode]);

  console.log(`Replaced bytecode at Chainlink provider: ${GMX_ADDRESSES.CHAINLINK_DATA_STREAM_PROVIDER}`);

  // Now configure prices in the mock (which is now at the production address)
  const mockAtProviderAddress = (await ethers.getContractAt(
    "MockOracleProvider",
    GMX_ADDRESSES.CHAINLINK_DATA_STREAM_PROVIDER
  )) as MockOracleProvider;

  // GMX price format: price * 10^30 / 10^tokenDecimals
  // For WETH (18 decimals): $3892 = 3892 * 10^30 / 10^18 = 3892 * 10^12
  // For USDC (6 decimals): $1 = 1 * 10^30 / 10^6 = 1 * 10^24
  const wethPriceFormatted = BigNumber.from(wethPriceUSD).mul(BigNumber.from(10).pow(12));
  const usdcPriceFormatted = BigNumber.from(usdcPriceUSD).mul(BigNumber.from(10).pow(24));

  await mockAtProviderAddress.setPrice(GMX_ADDRESSES.WETH, wethPriceFormatted, wethPriceFormatted);
  await mockAtProviderAddress.setPrice(GMX_ADDRESSES.USDC, usdcPriceFormatted, usdcPriceFormatted);

  console.log(`WETH price set to: ${wethPriceFormatted.toString()} (${wethPriceUSD} USD)`);
  console.log(`USDC price set to: ${usdcPriceFormatted.toString()} (${usdcPriceUSD} USD)`);
  console.log("=== Oracle setup complete ===\n");
}

// ============================================================================
// Order Parameter Builders
// ============================================================================

/**
 * Get execution fee for order creation
 * Increased for Anvil's higher gas prices (gasLimit * tx.gasprice)
 */
export function getExecutionFee(): BigNumber {
  return ethers.utils.parseEther("0.01"); // Increased from 0.0002 to cover Anvil gas prices
}

/**
 * Create parameters for a MarketIncrease order (open/increase position)
 */
export function createIncreaseOrderParams(params: {
  market: string;
  collateralToken: string;
  collateralAmount: BigNumber;
  sizeDeltaUsd: BigNumber;
  isLong: boolean;
  receiver: string;
}): any {
  const executionFee = getExecutionFee();
  const emptySwapPath: string[] = [];

  // initialCollateralDeltaAmount = collateral + execution fee
  // Both are sent via sendWnt to ORDER_VAULT before creating order
  const initialCollateralDeltaAmount = params.collateralAmount.add(executionFee);

  return {
    addresses: {
      receiver: params.receiver,
      cancellationReceiver: params.receiver,
      callbackContract: ethers.constants.AddressZero,
      uiFeeReceiver: ethers.constants.AddressZero,
      market: params.market,
      initialCollateralToken: params.collateralToken,
      swapPath: emptySwapPath,
    },
    numbers: {
      sizeDeltaUsd: params.sizeDeltaUsd,
      initialCollateralDeltaAmount: initialCollateralDeltaAmount,
      triggerPrice: 0,
      acceptablePrice: params.isLong ? ethers.constants.MaxUint256 : 1,
      executionFee: executionFee,
      callbackGasLimit: 200000,
      minOutputAmount: 1,
      validFromTime: 0,
    },
    orderType: 2, // MarketIncrease
    decreasePositionSwapType: 0, // NoSwap
    isLong: params.isLong,
    shouldUnwrapNativeToken: false,
    autoCancel: true,
    referralCode: ethers.constants.HashZero,
    dataList: [],
  };
}

/**
 * Create parameters for a MarketDecrease order (close/decrease position)
 */
export function createDecreaseOrderParams(params: {
  market: string;
  collateralToken: string;
  sizeDeltaUsd: BigNumber;
  isLong: boolean;
  receiver: string;
}): any {
  const executionFee = getExecutionFee();
  const emptySwapPath: string[] = [];

  return {
    addresses: {
      receiver: params.receiver,
      cancellationReceiver: params.receiver,
      callbackContract: ethers.constants.AddressZero,
      uiFeeReceiver: ethers.constants.AddressZero,
      market: params.market,
      initialCollateralToken: params.collateralToken,
      swapPath: emptySwapPath,
    },
    numbers: {
      sizeDeltaUsd: params.sizeDeltaUsd,
      initialCollateralDeltaAmount: 0, // No collateral added when closing
      triggerPrice: 0,
      acceptablePrice: params.isLong ? 0 : ethers.constants.MaxUint256,
      executionFee: executionFee,
      callbackGasLimit: 0,
      minOutputAmount: 0,
      validFromTime: 0,
    },
    orderType: 4, // MarketDecrease
    decreasePositionSwapType: 0, // NoSwap
    isLong: params.isLong,
    shouldUnwrapNativeToken: false,
    autoCancel: false,
    referralCode: ethers.constants.HashZero,
    dataList: [],
  };
}

// ============================================================================
// State Queries
// ============================================================================

/**
 * Get total order count from DataStore
 */
export async function getOrderCount(dataStore: IDataStore): Promise<BigNumber> {
  return await dataStore.getBytes32Count(Keys.ORDER_LIST);
}

/**
 * Get order count for a specific account
 */
export async function getAccountOrderCount(dataStore: IDataStore, account: string): Promise<BigNumber> {
  const accountOrderListKey = Keys.accountOrderListKey(account);
  return await dataStore.getBytes32Count(accountOrderListKey);
}

/**
 * Get total position count from DataStore
 */
export async function getPositionCount(dataStore: IDataStore): Promise<BigNumber> {
  return await dataStore.getBytes32Count(Keys.POSITION_LIST);
}

/**
 * Get position count for a specific account
 */
export async function getAccountPositionCount(dataStore: IDataStore, account: string): Promise<BigNumber> {
  const accountPositionListKey = Keys.accountPositionListKey(account);
  return await dataStore.getBytes32Count(accountPositionListKey);
}

/**
 * Compute position key from parameters
 */
export function getPositionKey(account: string, market: string, collateralToken: string, isLong: boolean): string {
  return ethers.utils.solidityKeccak256(
    ["address", "address", "address", "bool"],
    [account, market, collateralToken, isLong]
  );
}

/**
 * Create oracle params for order execution
 */
export function createOracleParams(): any {
  return {
    tokens: [GMX_ADDRESSES.WETH, GMX_ADDRESSES.USDC],
    providers: [GMX_ADDRESSES.CHAINLINK_DATA_STREAM_PROVIDER, GMX_ADDRESSES.CHAINLINK_DATA_STREAM_PROVIDER],
    data: [[], []], // Empty data - mock handles everything
  };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Extract order key from transaction receipt logs
 */
export function getOrderKeyFromReceipt(receipt: any): string {
  // OrderCreated event signature
  const orderCreatedTopic = ethers.utils.id("OrderCreated(bytes32,Order.Props)");

  for (const log of receipt.logs) {
    if (log.topics[0] === orderCreatedTopic) {
      return log.topics[1]; // First indexed parameter is the order key
    }
  }

  throw new Error("OrderCreated event not found in transaction receipt");
}

/**
 * Log formatted balances
 */
export async function logBalances(label: string, addresses: { name: string; address: string }[]): Promise<void> {
  console.log(`\n=== ${label} ===`);
  for (const { name, address } of addresses) {
    const balance = await ethers.provider.getBalance(address);
    console.log(`${name}: ${ethers.utils.formatEther(balance)} ETH`);
  }
  console.log("");
}
