const { expandDecimals } = require("./math");
const { grantRole } = require("./role");
const { deployContract } = require("./deploy");
const { decimalToFloat, expandFloatDecimals } = require("./math");

async function deployFixture() {
  const chainId = 31337; // hardhat chain id
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
  ] = await ethers.getSigners();

  const keys = await deployContract("Keys", []);
  const reader = await deployContract("Reader", []);

  const roleStore = await deployContract("RoleStore", []);
  await grantRole(roleStore, wallet.address, "CONTROLLER");
  await grantRole(roleStore, wallet.address, "ORDER_KEEPER");

  const dataStore = await deployContract("DataStore", [roleStore.address]);
  await dataStore.setUint(await keys.MIN_ORACLE_BLOCK_CONFIRMATIONS(), 100);
  await dataStore.setUint(await keys.MAX_ORACLE_BLOCK_AGE(), 200);
  await dataStore.setUint(await keys.MAX_LEVERAGE(), expandFloatDecimals(100));

  const eventEmitter = await deployContract("EventEmitter", [roleStore.address]);

  const oracleStore = await deployContract("OracleStore", [roleStore.address]);

  await oracleStore.addSigner(signer0.address);
  await oracleStore.addSigner(signer1.address);
  await oracleStore.addSigner(signer2.address);
  await oracleStore.addSigner(signer3.address);
  await oracleStore.addSigner(signer4.address);
  await oracleStore.addSigner(signer5.address);
  await oracleStore.addSigner(signer6.address);
  await oracleStore.addSigner(signer7.address);
  await oracleStore.addSigner(signer8.address);
  await oracleStore.addSigner(signer9.address);

  const oracle = await deployContract("Oracle", [roleStore.address, oracleStore.address]);
  await grantRole(roleStore, oracle.address, "CONTROLLER");

  const weth = await deployContract("WETH", []);
  await weth.deposit({ value: expandDecimals(10, 18) });

  const wbtc = await deployContract("MintableToken", []);
  const usdc = await deployContract("MintableToken", []);

  await dataStore.setAddress(await keys.WETH(), weth.address);
  await dataStore.setUint(await reader.oraclePrecisionKey(weth.address), expandDecimals(1, 8));
  await dataStore.setUint(await reader.oraclePrecisionKey(wbtc.address), expandDecimals(1, 20));
  await dataStore.setUint(await reader.oraclePrecisionKey(usdc.address), expandDecimals(1, 18));

  const oracleSalt = ethers.utils.solidityKeccak256(["uint256", "string"], [chainId, "xget-oracle-v1"]);

  const depositStore = await deployContract("DepositStore", [roleStore.address]);
  const withdrawalStore = await deployContract("WithdrawalStore", [roleStore.address]);
  const orderStore = await deployContract("OrderStore", [roleStore.address]);
  const positionStore = await deployContract("PositionStore", [roleStore.address]);
  const marketStore = await deployContract("MarketStore", [roleStore.address]);

  const marketFactory = await deployContract("MarketFactory", [roleStore.address, marketStore.address]);
  await grantRole(roleStore, marketFactory.address, "CONTROLLER");

  await marketFactory.createMarket(weth.address, weth.address, usdc.address);
  const marketKeys = await marketStore.getMarketKeys(0, 1);
  const ethUsdMarket = await marketStore.get(marketKeys[0]);

  await dataStore.setUint(await reader.reserveFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 1));

  const feeReceiver = await deployContract("FeeReceiver", []);

  const gasUtils = await deployContract("GasUtils", []);

  const increaseOrderUtils = await deployContract("IncreaseOrderUtils", []);
  const decreaseOrderUtils = await deployContract("DecreaseOrderUtils", []);

  const swapOrderUtils = await deployContract("SwapOrderUtils", []);

  const liquidationUtils = await deployContract("LiquidationUtils", [], {
    libraries: {
      DecreaseOrderUtils: decreaseOrderUtils.address,
    },
  });

  const depositHandler = await deployContract(
    "DepositHandler",
    [
      roleStore.address,
      dataStore.address,
      eventEmitter.address,
      depositStore.address,
      marketStore.address,
      oracle.address,
      feeReceiver.address,
    ],
    {
      libraries: {
        GasUtils: gasUtils.address,
      },
    }
  );

  const withdrawalHandler = await deployContract(
    "WithdrawalHandler",
    [
      roleStore.address,
      dataStore.address,
      eventEmitter.address,
      withdrawalStore.address,
      marketStore.address,
      oracle.address,
      feeReceiver.address,
    ],
    {
      libraries: {
        GasUtils: gasUtils.address,
      },
    }
  );

  const orderHandler = await deployContract(
    "OrderHandler",
    [
      roleStore.address,
      dataStore.address,
      eventEmitter.address,
      marketStore.address,
      orderStore.address,
      positionStore.address,
      oracle.address,
      feeReceiver.address,
    ],
    {
      libraries: {
        GasUtils: gasUtils.address,
        IncreaseOrderUtils: increaseOrderUtils.address,
        DecreaseOrderUtils: decreaseOrderUtils.address,
        SwapOrderUtils: swapOrderUtils.address,
      },
    }
  );

  const liquidationHandler = await deployContract(
    "LiquidationHandler",
    [
      roleStore.address,
      dataStore.address,
      eventEmitter.address,
      marketStore.address,
      positionStore.address,
      oracle.address,
      feeReceiver.address,
    ],
    {
      libraries: {
        LiquidationUtils: liquidationUtils.address,
      },
    }
  );

  await grantRole(roleStore, depositHandler.address, "CONTROLLER");
  await grantRole(roleStore, withdrawalHandler.address, "CONTROLLER");
  await grantRole(roleStore, orderHandler.address, "CONTROLLER");
  await grantRole(roleStore, liquidationHandler.address, "CONTROLLER");

  return {
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
      keys,
      reader,
      roleStore,
      dataStore,
      depositStore,
      eventEmitter,
      withdrawalStore,
      oracleStore,
      orderStore,
      positionStore,
      marketStore,
      marketFactory,
      depositHandler,
      withdrawalHandler,
      orderHandler,
      liquidationHandler,
      feeReceiver,
      oracle,
      weth,
      wbtc,
      usdc,
      ethUsdMarket,
    },
    props: { oracleSalt, signerIndexes: [0, 1, 2, 3, 4, 5, 6] },
  };
}

module.exports = {
  deployFixture,
};
