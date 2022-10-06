const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const { deployFixture } = require("../../utils/fixture");
const { getOracleParams } = require("../../utils/oracle");
const { printGasUsage } = require("../../utils/gas");
const { bigNumberify, expandDecimals, expandFloatDecimals } = require("../../utils/math");
const { getBalanceOf } = require("../../utils/token");
const { OrderType } = require("../../utils/order");

describe("Exchange.IncreaseOrder", () => {
  const executionFee = "1000000000000000";
  const { AddressZero, HashZero } = ethers.constants;
  const { provider } = ethers;

  let wallet, user0, user1, user2, signers, signerIndexes;
  let orderHandler,
    depositHandler,
    depositStore,
    feeReceiver,
    reader,
    dataStore,
    keys,
    orderStore,
    positionStore,
    ethUsdMarket,
    weth,
    usdc;
  let oracleSalt;

  beforeEach(async () => {
    const fixture = await loadFixture(deployFixture);
    ({ wallet, user0, user1, user2, signers } = fixture.accounts);
    ({
      orderHandler,
      depositHandler,
      depositStore,
      feeReceiver,
      reader,
      dataStore,
      keys,
      orderStore,
      positionStore,
      ethUsdMarket,
      weth,
      usdc,
    } = fixture.contracts);
    ({ oracleSalt, signerIndexes } = fixture.props);

    await weth.mint(depositStore.address, expandDecimals(1000, 18));
    await depositHandler
      .connect(wallet)
      .createDeposit(user0.address, ethUsdMarket.marketToken, 100, false, executionFee);
    const depositKeys = await depositStore.getDepositKeys(0, 1);
    const deposit = await depositStore.get(depositKeys[0]);

    let block = await provider.getBlock(deposit.updatedAtBlock.toNumber());

    let oracleParams = await getOracleParams({
      oracleSalt,
      oracleBlockNumbers: [block.number, block.number],
      blockHashes: [block.hash, block.hash],
      signerIndexes,
      tokens: [weth.address, usdc.address],
      prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      signers,
      priceFeedTokens: [],
    });

    await depositHandler.executeDeposit(depositKeys[0], oracleParams);
  });

  it("createOrder", async () => {
    await weth.mint(orderStore.address, expandDecimals(10, 18));

    const block = await provider.getBlock();

    expect(await orderStore.getOrderCount()).eq(0);
    const params = {
      market: ethUsdMarket.marketToken,
      initialCollateralToken: weth.address,
      swapPath: [ethUsdMarket.marketToken],
      sizeDeltaUsd: expandFloatDecimals(200 * 1000),
      acceptablePrice: expandDecimals(5001, 12),
      priceImpactUsd: expandDecimals(-5, 30),
      executionFee,
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      hasCollateralInETH: false,
    };
    const tx0 = await orderHandler.connect(wallet).createOrder(user0.address, params);

    expect(await orderStore.getOrderCount()).eq(1);

    await printGasUsage(provider, tx0, "orderHandler.createOrder tx0");

    const orderKeys = await orderStore.getOrderKeys(0, 1);
    const order = await orderStore.get(orderKeys[0]);

    expect(order.addresses.account).eq(user0.address);
    expect(order.addresses.market).eq(ethUsdMarket.marketToken);
    expect(order.addresses.initialCollateralToken).eq(weth.address);
    expect(order.addresses.swapPath).eql([ethUsdMarket.marketToken]);
    expect(order.numbers.sizeDeltaUsd).eq(expandFloatDecimals(200 * 1000));
    expect(order.numbers.initialCollateralDeltaAmount).eq(expandDecimals(10, 18).sub(executionFee));
    expect(order.numbers.acceptablePrice).eq(expandDecimals(5001, 12));
    expect(order.numbers.priceImpactUsd).eq(expandDecimals(-5, 30));
    expect(order.numbers.executionFee).eq(expandDecimals(1, 15));
    expect(order.numbers.minOutputAmount).eq(expandDecimals(50000, 6));
    expect(order.numbers.updatedAtBlock).eq(block.number + 1);
    expect(order.flags.orderType).eq(OrderType.MarketIncrease);
    expect(order.flags.isLong).eq(true);
    expect(order.flags.hasCollateralInETH).eq(false);
  });

  it("executeOrder", async () => {
    await weth.mint(orderStore.address, expandDecimals(10, 18));

    let block = await provider.getBlock();

    expect(await orderStore.getOrderCount()).eq(0);
    const params = {
      market: ethUsdMarket.marketToken,
      initialCollateralToken: weth.address,
      swapPath: [],
      sizeDeltaUsd: expandFloatDecimals(200 * 1000),
      acceptablePrice: expandDecimals(5001, 12),
      priceImpactUsd: expandDecimals(-5, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      hasCollateralInETH: false,
    };
    await orderHandler.connect(wallet).createOrder(user0.address, params);

    expect(await orderStore.getOrderCount()).eq(1);

    let orderKeys = await orderStore.getOrderKeys(0, 1);
    let order = await orderStore.get(orderKeys[0]);

    let oracleBlockNumber = order.numbers.updatedAtBlock;
    block = await provider.getBlock(oracleBlockNumber.toNumber());

    let oracleParams = await getOracleParams({
      oracleSalt,
      oracleBlockNumbers: [oracleBlockNumber, oracleBlockNumber],
      blockHashes: [block.hash, block.hash],
      signerIndexes,
      tokens: [weth.address, usdc.address],
      prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      signers,
      priceFeedTokens: [],
    });

    const tx0 = await orderHandler.executeOrder(orderKeys[0], oracleParams);

    await printGasUsage(provider, tx0, "orderHandler.executeOrder tx0");

    expect(await positionStore.getAccountPositionCount(user0.address)).eq(1);

    await weth.mint(orderStore.address, expandDecimals(10, 18));
    await orderHandler.connect(wallet).createOrder(user1.address, params);

    orderKeys = await orderStore.getOrderKeys(0, 1);
    order = await orderStore.get(orderKeys[0]);

    oracleBlockNumber = order.numbers.updatedAtBlock;
    block = await provider.getBlock(oracleBlockNumber.toNumber());

    oracleParams = await getOracleParams({
      oracleSalt,
      oracleBlockNumbers: [oracleBlockNumber, oracleBlockNumber],
      blockHashes: [block.hash, block.hash],
      signerIndexes,
      tokens: [weth.address, usdc.address],
      prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      signers,
      priceFeedTokens: [],
    });

    const tx1 = await orderHandler.executeOrder(orderKeys[0], oracleParams);
    await printGasUsage(provider, tx1, "orderHandler.executeOrder tx1");
  });
});
