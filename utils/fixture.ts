import hre from "hardhat";

import { expandDecimals } from "./math";
import { hashData } from "./hash";
import { getMarketTokenAddress } from "./market";

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
  const usdc = await hre.ethers.getContract("USDC");

  const usdcPriceFeed = await hre.ethers.getContract("USDCPriceFeed");
  await usdcPriceFeed.setAnswer(expandDecimals(1, 8));

  const oracleSalt = hashData(["uint256", "string"], [chainId, "xget-oracle-v1"]);

  const marketReader = await hre.ethers.getContract("MarketReader");
  const positionReader = await hre.ethers.getContract("PositionReader");
  const orderReader = await hre.ethers.getContract("OrderReader");
  const roleStore = await hre.ethers.getContract("RoleStore");
  const dataStore = await hre.ethers.getContract("DataStore");
  const depositStore = await hre.ethers.getContract("DepositStore");
  const eventEmitter = await hre.ethers.getContract("EventEmitter");
  const withdrawalStore = await hre.ethers.getContract("WithdrawalStore");
  const oracleStore = await hre.ethers.getContract("OracleStore");
  const orderStore = await hre.ethers.getContract("OrderStore");
  const marketStore = await hre.ethers.getContract("MarketStore");
  const marketFactory = await hre.ethers.getContract("MarketFactory");
  const depositHandler = await hre.ethers.getContract("DepositHandler");
  const withdrawalHandler = await hre.ethers.getContract("WithdrawalHandler");
  const orderHandler = await hre.ethers.getContract("OrderHandler");
  const liquidationHandler = await hre.ethers.getContract("LiquidationHandler");
  const adlHandler = await hre.ethers.getContract("AdlHandler");
  const router = await hre.ethers.getContract("Router");
  const exchangeRouter = await hre.ethers.getContract("ExchangeRouter");
  const feeReceiver = await hre.ethers.getContract("FeeReceiver");
  const oracle = await hre.ethers.getContract("Oracle");
  const positionStoreUtils = await hre.ethers.getContract("PositionStoreUtils");

  const ethUsdMarketAddress = getMarketTokenAddress(
    wnt.address,
    wnt.address,
    usdc.address,
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );
  const ethUsdMarket = await marketStore.get(ethUsdMarketAddress);

  return {
    accountList,
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
      marketReader,
      positionReader,
      orderReader,
      roleStore,
      dataStore,
      depositStore,
      eventEmitter,
      withdrawalStore,
      oracleStore,
      orderStore,
      marketStore,
      marketFactory,
      depositHandler,
      withdrawalHandler,
      orderHandler,
      liquidationHandler,
      adlHandler,
      router,
      exchangeRouter,
      feeReceiver,
      oracle,
      positionStoreUtils,
      usdcPriceFeed,
      wnt,
      wbtc,
      usdc,
      ethUsdMarket,
    },
    props: { oracleSalt, signerIndexes: [0, 1, 2, 3, 4, 5, 6], executionFee: "1000000000000000" },
  };
}
