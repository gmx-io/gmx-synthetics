const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const { deployFixture } = require("../../utils/fixture");
const { getOracleParams } = require("../../utils/oracle");
const { printGasUsage } = require("../../utils/gas");
const { expandDecimals, decimalToFloat } = require("../../utils/math");
const { getBalanceOf, getSupplyOf } = require("../../utils/token");

describe("Exchange.Withdrawal", () => {
  const { AddressZero } = ethers.constants;
  const { provider } = ethers;
  const executionFee = "0";

  let wallet, user0, signers, signerIndexes;
  let depositHandler,
    withdrawalHandler,
    feeReceiver,
    reader,
    dataStore,
    keys,
    depositStore,
    withdrawalStore,
    ethUsdMarket,
    weth,
    usdc;
  let oracleSalt;

  beforeEach(async () => {
    const fixture = await loadFixture(deployFixture);
    ({ wallet, user0, signers } = fixture.accounts);
    ({
      depositHandler,
      withdrawalHandler,
      feeReceiver,
      reader,
      dataStore,
      keys,
      depositStore,
      withdrawalStore,
      ethUsdMarket,
      weth,
      usdc,
    } = fixture.contracts);
    ({ oracleSalt, signerIndexes } = fixture.props);
  });

  it("createWithdrawal", async () => {
    const block = await provider.getBlock();

    expect(await withdrawalStore.getWithdrawalCount()).eq(0);
    const tx0 = await withdrawalHandler
      .connect(wallet)
      .createWithdrawal(
        user0.address,
        ethUsdMarket.marketToken,
        expandDecimals(1000, 18),
        expandDecimals(500, 18),
        100,
        50,
        false,
        executionFee
      );
    expect(await withdrawalStore.getWithdrawalCount()).eq(1);

    const withdrawalKeys = await withdrawalStore.getWithdrawalKeys(0, 1);
    const withdrawal = await withdrawalStore.get(withdrawalKeys[0]);

    expect(withdrawal.account).eq(user0.address);
    expect(withdrawal.market).eq(ethUsdMarket.marketToken);
    expect(withdrawal.marketTokensLongAmount).eq(expandDecimals(1000, 18));
    expect(withdrawal.marketTokensShortAmount).eq(expandDecimals(500, 18));
    expect(withdrawal.minLongTokenAmount).eq(100);
    expect(withdrawal.minShortTokenAmount).eq(50);
    expect(withdrawal.updatedAtBlock).eq(block.number + 1);

    await printGasUsage(provider, tx0, "withdrawalHandler.createWithdrawal tx0");
  });

  it("executeWithdrawal", async () => {
    await weth.mint(depositStore.address, expandDecimals(10, 18));
    await usdc.mint(depositStore.address, expandDecimals(10 * 5000, 6));

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

    await withdrawalHandler
      .connect(wallet)
      .createWithdrawal(
        user0.address,
        ethUsdMarket.marketToken,
        expandDecimals(1000, 18),
        expandDecimals(500, 18),
        100,
        50,
        false,
        executionFee
      );

    block = await provider.getBlock();

    oracleParams = await getOracleParams({
      oracleSalt,
      oracleBlockNumbers: [block.number, block.number],
      blockHashes: [block.hash, block.hash],
      signerIndexes,
      tokens: [weth.address, usdc.address],
      prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      signers,
      priceFeedTokens: [],
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(100 * 1000, 18));
    expect(await weth.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await usdc.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(50 * 1000, 6));
    expect(await weth.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      expandDecimals(10, 18)
    );
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(
      expandDecimals(50 * 1000, 6)
    );

    const withdrawalKeys = await withdrawalStore.getWithdrawalKeys(0, 1);
    let withdrawal = await withdrawalStore.get(withdrawalKeys[0]);

    block = await provider.getBlock();

    expect(withdrawal.account).eq(user0.address);
    expect(withdrawal.market).eq(ethUsdMarket.marketToken);
    expect(withdrawal.marketTokensLongAmount).eq(expandDecimals(1000, 18));
    expect(withdrawal.marketTokensShortAmount).eq(expandDecimals(500, 18));
    expect(withdrawal.minLongTokenAmount).eq(100);
    expect(withdrawal.minShortTokenAmount).eq(50);
    expect(withdrawal.updatedAtBlock).eq(block.number);

    const tx0 = await withdrawalHandler.executeWithdrawal(withdrawalKeys[0], oracleParams);

    await printGasUsage(provider, tx0, "withdrawalHandler.executeWithdrawal tx0");

    withdrawal = await withdrawalStore.get(withdrawalKeys[0]);
    expect(withdrawal.account).eq(AddressZero);
    expect(withdrawal.market).eq(AddressZero);
    expect(withdrawal.marketTokensLongAmount).eq(0);
    expect(withdrawal.marketTokensShortAmount).eq(0);
    expect(withdrawal.minLongTokenAmount).eq(0);
    expect(withdrawal.minShortTokenAmount).eq(0);
    expect(withdrawal.updatedAtBlock).eq(0);

    expect(
      await reader.getMarketTokenPrice(
        dataStore.address,
        ethUsdMarket,
        expandDecimals(5000, 4 + 8),
        expandDecimals(1, 6 + 18),
        expandDecimals(5000, 4 + 8)
      )
    ).eq(expandDecimals(1, 30));

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("98500000000000000000000"); // 98500
    expect(await weth.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await usdc.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq("9800000000000000000"); // 9.8 ETH
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq("49500000000"); // 49500 USDC
    expect(await weth.balanceOf(user0.address)).eq("200000000000000000"); // 0.2 ETH
    expect(await usdc.balanceOf(user0.address)).eq("500000000"); // 500

    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "9800000000000000000" // 9.8 ETH
    );
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(
      "49500000000" // 49500 USDC
    );
  });

  it("price impact", async () => {
    await weth.mint(depositStore.address, expandDecimals(10, 18));

    // set price impact to 0.1% for every $50,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 50,000 => 2 * (10 ** -8)
    await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(2, 8));
    await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
    await dataStore.setUint(await reader.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

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

    await withdrawalHandler
      .connect(wallet)
      .createWithdrawal(
        user0.address,
        ethUsdMarket.marketToken,
        49975000000000000005000n,
        0,
        100,
        0,
        false,
        executionFee
      );

    block = await provider.getBlock();

    oracleParams = await getOracleParams({
      oracleSalt,
      oracleBlockNumbers: [block.number, block.number],
      blockHashes: [block.hash, block.hash],
      signerIndexes,
      tokens: [weth.address, usdc.address],
      prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      signers,
      priceFeedTokens: [],
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(49975000000000000005000n);
    expect(await weth.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await usdc.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await weth.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "9995000000000000001" // 9.995
    );
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);

    const withdrawalKeys = await withdrawalStore.getWithdrawalKeys(0, 1);
    const tx0 = await withdrawalHandler.executeWithdrawal(withdrawalKeys[0], oracleParams);

    await printGasUsage(provider, tx0, "withdrawalHandler.executeWithdrawal tx0");

    expect(
      await reader.getMarketTokenPrice(
        dataStore.address,
        ethUsdMarket,
        expandDecimals(5000, 4 + 8),
        expandDecimals(1, 6 + 18),
        expandDecimals(5000, 4 + 8)
      )
    ).eq(0);

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("0");
    expect(await weth.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await usdc.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq("4998750000000"); // 0.00000499875 ETH
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await weth.balanceOf(user0.address)).eq("9999995001250000000"); // 9.99999500125 ETH
    expect(await usdc.balanceOf(user0.address)).eq(0); // 500

    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(0);
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);

    expect(await reader.getImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "4998750000000" // 0.00000499875 ETH, 0.02499375 USD
    );
  });

  it("price impact, fees", async () => {
    // 0.05%: 0.0005
    await dataStore.setUint(await reader.swapFeeFactorKey(ethUsdMarket.marketToken), decimalToFloat(5, 4));
    // 30%
    await dataStore.setUint(await keys.FEE_RECEIVER_WITHDRAWAL_FACTOR(), decimalToFloat(3, 1));

    await weth.mint(depositStore.address, expandDecimals(10, 18));

    // set price impact to 0.1% for every $50,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 50,000 => 2 * (10 ** -8)
    await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(2, 8));
    await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
    await dataStore.setUint(await reader.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

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

    expect(
      await reader.getMarketTokenPrice(
        dataStore.address,
        ethUsdMarket,
        expandDecimals(5000, 4 + 8),
        expandDecimals(1, 6 + 18),
        expandDecimals(5000, 4 + 8)
      )
    ).eq("1000500500500500500500450400350"); // 1.0005005

    await withdrawalHandler
      .connect(wallet)
      .createWithdrawal(
        user0.address,
        ethUsdMarket.marketToken,
        expandDecimals(49940, 18),
        0,
        100,
        0,
        false,
        executionFee
      );

    block = await provider.getBlock();

    oracleParams = await getOracleParams({
      oracleSalt,
      oracleBlockNumbers: [block.number, block.number],
      blockHashes: [block.hash, block.hash],
      signerIndexes,
      tokens: [weth.address, usdc.address],
      prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      signers,
      priceFeedTokens: [],
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("49950000000000000005000"); // 49950
    expect(await weth.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await usdc.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await weth.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "9995000000000000001" // 9.995
    );
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);

    expect(await weth.balanceOf(feeReceiver.address)).eq(0);
    expect(await usdc.balanceOf(feeReceiver.address)).eq(0);

    const withdrawalKeys = await withdrawalStore.getWithdrawalKeys(0, 1);
    const tx0 = await withdrawalHandler.executeWithdrawal(withdrawalKeys[0], oracleParams);

    await printGasUsage(provider, tx0, "withdrawalHandler.executeWithdrawal tx0");

    expect(await weth.balanceOf(feeReceiver.address)).eq("1498949849849849"); // 0.0014989
    expect(await usdc.balanceOf(feeReceiver.address)).eq(0);

    expect(
      await reader.getMarketTokenPrice(
        dataStore.address,
        ethUsdMarket,
        expandDecimals(5000, 4 + 8),
        expandDecimals(1, 6 + 18),
        expandDecimals(5000, 4 + 8)
      )
    ).eq("2749275325325325125362337337337"); // 2.74927532533

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("10000000000000005000"); // 10
    expect(await getSupplyOf(ethUsdMarket.marketToken)).eq("10000000000000005000"); // 10
    expect(await weth.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await usdc.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq("5503549600850903"); // 0.0055035 ETH, ~27 USD
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await weth.balanceOf(user0.address)).eq("9992997500549299248"); // 9.9929975 ETH
    expect(await usdc.balanceOf(user0.address)).eq(0); // 500

    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "5498550650650653"
    ); // 0.005498550650650652, 27.5 USD
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);

    expect(await reader.getImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "4998950200250" // 0.000004998950200251, ~0.025 USD
    );
  });

  it("price impact, spread, fees", async () => {
    // 0.05%: 0.0005
    await dataStore.setUint(await reader.swapFeeFactorKey(ethUsdMarket.marketToken), decimalToFloat(5, 4));
    // 30%
    await dataStore.setUint(await keys.FEE_RECEIVER_WITHDRAWAL_FACTOR(), decimalToFloat(3, 1));
    // 0.01%: 0.0001
    await dataStore.setUint(await reader.swapSpreadFactorKey(ethUsdMarket.marketToken), decimalToFloat(1, 4));

    await weth.mint(depositStore.address, expandDecimals(10, 18));

    // set price impact to 0.1% for every $50,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 50,000 => 2 * (10 ** -8)
    await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(2, 8));
    await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
    await dataStore.setUint(await reader.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

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

    await withdrawalHandler
      .connect(wallet)
      .createWithdrawal(
        user0.address,
        ethUsdMarket.marketToken,
        expandDecimals(49940, 18),
        0,
        100,
        0,
        false,
        executionFee
      );

    block = await provider.getBlock();

    oracleParams = await getOracleParams({
      oracleSalt,
      oracleBlockNumbers: [block.number, block.number],
      blockHashes: [block.hash, block.hash],
      signerIndexes,
      tokens: [weth.address, usdc.address],
      prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      signers,
      priceFeedTokens: [],
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("49945000000000000005000"); // 49945
    expect(await weth.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await usdc.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await weth.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "9995000000000000001" // 9.995
    );
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);

    const withdrawalKeys = await withdrawalStore.getWithdrawalKeys(0, 1);
    const tx0 = await withdrawalHandler.executeWithdrawal(withdrawalKeys[0], oracleParams);

    await printGasUsage(provider, tx0, "withdrawalHandler.executeWithdrawal tx0");

    expect(
      await reader.getMarketTokenPrice(
        dataStore.address,
        ethUsdMarket,
        expandDecimals(5000, 4 + 8),
        expandDecimals(1, 6 + 18),
        expandDecimals(5000, 4 + 8)
      )
    ).eq("5497900390429468502099609570531"); // 5.49790039043

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("5000000000000005000"); // 5
    expect(await weth.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await usdc.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq("5502899190489558"); // 0.005502 ETH, ~27 USD
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await weth.balanceOf(user0.address)).eq("9992998000899609552"); // 9.992998 ETH
    expect(await usdc.balanceOf(user0.address)).eq(0); // 500

    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "5497900390429474"
    ); // 0.005497900390429474
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);

    expect(await reader.getImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "4998800060084" // 0.000004998800060084 ETH, ~0.025 USD
    );
  });
});
