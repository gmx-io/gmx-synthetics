import hre from "hardhat";

import { expandDecimals } from "./math";
import { hashData } from "./hash";
import { getMarketTokenAddress, DEFAULT_MARKET_TYPE } from "./market";
import { getSyntheticTokenAddress } from "./token";

export async function deployFixture() {
  await hre.deployments.fixture();
  const chainId = 31337; // hardhat chain id
  const accountList = await hre.ethers.getSigners();
  const [
    wallet,
    user0,
    user1,
    user2,
    user3,
    user4,
    user5,
    user6,
    user7,
    user8,
    signer0,
    signer1,
    signer2,
    signer3,
    signer4,
    signer5,
    signer6,
    signer7,
    signer8,
    signer9,
  ] = accountList;

  const wnt = await hre.ethers.getContract("WETH");
  await wnt.deposit({ value: expandDecimals(50, 18) });

  const wbtc = await hre.ethers.getContract("WBTC");
  const sol = { address: getSyntheticTokenAddress(hre.network.config.chainId, "SOL") };

  const usdc = await hre.ethers.getContract("USDC");
  const usdt = await hre.ethers.getContract("USDT");

  const usdcPriceFeed = await hre.ethers.getContract("USDCPriceFeed");
  await usdcPriceFeed.setAnswer(expandDecimals(1, 8));

  const usdtPriceFeed = await hre.ethers.getContract("USDTPriceFeed");
  await usdtPriceFeed.setAnswer(expandDecimals(1, 8));

  const oracleSalt = hashData(["uint256", "string"], [chainId, "xget-oracle-v1"]);

  const config = await hre.ethers.getContract("Config");
  const timelock = await hre.ethers.getContract("Timelock");
  const reader = await hre.ethers.getContract("Reader");
  const roleStore = await hre.ethers.getContract("RoleStore");
  const dataStore = await hre.ethers.getContract("DataStore");
  const depositVault = await hre.ethers.getContract("DepositVault");
  const withdrawalVault = await hre.ethers.getContract("WithdrawalVault");
  const eventEmitter = await hre.ethers.getContract("EventEmitter");
  const oracleStore = await hre.ethers.getContract("OracleStore");
  const orderVault = await hre.ethers.getContract("OrderVault");
  const marketFactory = await hre.ethers.getContract("MarketFactory");
  const depositHandler = await hre.ethers.getContract("DepositHandler");
  const depositUtils = await hre.ethers.getContract("DepositUtils");
  const executeDepositUtils = await hre.ethers.getContract("ExecuteDepositUtils");
  const withdrawalHandler = await hre.ethers.getContract("WithdrawalHandler");
  const orderHandler = await hre.ethers.getContract("OrderHandler");
  const baseOrderUtils = await hre.ethers.getContract("BaseOrderUtils");
  const orderUtils = await hre.ethers.getContract("OrderUtils");
  const liquidationHandler = await hre.ethers.getContract("LiquidationHandler");
  const adlHandler = await hre.ethers.getContract("AdlHandler");
  const router = await hre.ethers.getContract("Router");
  const exchangeRouter = await hre.ethers.getContract("ExchangeRouter");
  const oracle = await hre.ethers.getContract("Oracle");
  const marketUtils = await hre.ethers.getContract("MarketUtils");
  const marketStoreUtils = await hre.ethers.getContract("MarketStoreUtils");
  const depositStoreUtils = await hre.ethers.getContract("DepositStoreUtils");
  const withdrawalStoreUtils = await hre.ethers.getContract("WithdrawalStoreUtils");
  const positionStoreUtils = await hre.ethers.getContract("PositionStoreUtils");
  const orderStoreUtils = await hre.ethers.getContract("OrderStoreUtils");
  const decreasePositionUtils = await hre.ethers.getContract("DecreasePositionUtils");
  const increaseOrderUtils = await hre.ethers.getContract("IncreaseOrderUtils");
  const increasePositionUtils = await hre.ethers.getContract("IncreasePositionUtils");
  const positionUtils = await hre.ethers.getContract("PositionUtils");
  const swapUtils = await hre.ethers.getContract("SwapUtils");
  const referralStorage = await hre.ethers.getContract("ReferralStorage");
  const feeHandler = await hre.ethers.getContract("FeeHandler");

  const ethUsdMarketAddress = getMarketTokenAddress(
    wnt.address,
    wnt.address,
    usdc.address,
    DEFAULT_MARKET_TYPE,
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );
  const ethUsdMarket = await reader.getMarket(dataStore.address, ethUsdMarketAddress);

  const ethUsdtMarketAddress = getMarketTokenAddress(
    wnt.address,
    wnt.address,
    usdt.address,
    DEFAULT_MARKET_TYPE,
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );
  const ethUsdtMarket = await reader.getMarket(dataStore.address, ethUsdtMarketAddress);

  const ethUsdSpotOnlyMarketAddress = getMarketTokenAddress(
    ethers.constants.AddressZero,
    wnt.address,
    usdc.address,
    DEFAULT_MARKET_TYPE,
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );
  const ethUsdSpotOnlyMarket = await reader.getMarket(dataStore.address, ethUsdSpotOnlyMarketAddress);

  const ethUsdSingleTokenMarketAddress = getMarketTokenAddress(
    wnt.address,
    usdc.address,
    usdc.address,
    DEFAULT_MARKET_TYPE,
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );
  const ethUsdSingleTokenMarket = await reader.getMarket(dataStore.address, ethUsdSingleTokenMarketAddress);

  const btcUsdMarketAddress = getMarketTokenAddress(
    wbtc.address,
    wbtc.address,
    usdc.address,
    DEFAULT_MARKET_TYPE,
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );
  const btcUsdMarket = await reader.getMarket(dataStore.address, btcUsdMarketAddress);

  const solUsdMarketAddress = getMarketTokenAddress(
    sol.address,
    wnt.address,
    usdc.address,
    DEFAULT_MARKET_TYPE,
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );
  const solUsdMarket = await reader.getMarket(dataStore.address, solUsdMarketAddress);

  return {
    accountList,
    getContract: async (contractName) => {
      return await hre.ethers.getContract(contractName);
    },
    accounts: {
      wallet,
      user0,
      user1,
      user2,
      user3,
      user4,
      user5,
      user6,
      user7,
      user8,
      signer0,
      signer1,
      signer2,
      signer3,
      signer4,
      signer5,
      signer6,
      signer7,
      signer8,
      signer9,
      signers: [signer0, signer1, signer2, signer3, signer4, signer5, signer6],
    },
    contracts: {
      config,
      timelock,
      reader,
      roleStore,
      dataStore,
      depositVault,
      eventEmitter,
      withdrawalVault,
      oracleStore,
      orderVault,
      marketFactory,
      depositHandler,
      depositUtils,
      executeDepositUtils,
      withdrawalHandler,
      orderHandler,
      baseOrderUtils,
      orderUtils,
      liquidationHandler,
      adlHandler,
      router,
      exchangeRouter,
      oracle,
      marketUtils,
      marketStoreUtils,
      depositStoreUtils,
      withdrawalStoreUtils,
      positionStoreUtils,
      orderStoreUtils,
      decreasePositionUtils,
      increaseOrderUtils,
      increasePositionUtils,
      positionUtils,
      swapUtils,
      referralStorage,
      usdcPriceFeed,
      wnt,
      wbtc,
      sol,
      usdc,
      usdt,
      ethUsdMarket,
      ethUsdtMarket,
      ethUsdSpotOnlyMarket,
      ethUsdSingleTokenMarket,
      btcUsdMarket,
      solUsdMarket,
      feeHandler,
    },
    props: { oracleSalt, signerIndexes: [0, 1, 2, 3, 4, 5, 6], executionFee: "1000000000000000" },
  };
}
