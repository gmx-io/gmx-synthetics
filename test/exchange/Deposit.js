const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const { deployFixture } = require("../../utils/fixture");
const { expandDecimals, decimalToFloat } = require("../../utils/math");
const { getBalanceOf } = require("../../utils/token");
const { getMarketTokenPrice } = require("../../utils/market");
const { createDeposit, executeDeposit, handleDeposit } = require("../../utils/deposit");

describe("Exchange.Deposit", () => {
  const { provider } = ethers;

  let fixture;
  let user0, user1, user2;
  let feeReceiver, reader, dataStore, keys, depositStore, ethUsdMarket, weth, usdc;

  beforeEach(async () => {
    fixture = await loadFixture(deployFixture);
    ({ user0, user1, user2 } = fixture.accounts);
    ({ feeReceiver, reader, dataStore, keys, depositStore, ethUsdMarket, weth, usdc } = fixture.contracts);
  });

  it("createDeposit", async () => {
    await createDeposit(fixture, {
      receiver: user1,
      callbackContract: user2,
      market: ethUsdMarket,
      longTokenAmount: expandDecimals(10, 18),
      shortTokenAmount: expandDecimals(10 * 5000, 6),
      minMarketTokens: 100,
      shouldConvertETH: true,
      executionFee: "500",
      callbackGasLimit: "200000",
      gasUsageLabel: "createDeposit",
    });

    const block = await provider.getBlock();
    const depositKeys = await depositStore.getDepositKeys(0, 1);
    const deposit = await depositStore.get(depositKeys[0]);

    expect(deposit.account).eq(user0.address);
    expect(deposit.receiver).eq(user1.address);
    expect(deposit.callbackContract).eq(user2.address);
    expect(deposit.market).eq(ethUsdMarket.marketToken);
    expect(deposit.longTokenAmount).eq(expandDecimals(10, 18));
    expect(deposit.shortTokenAmount).eq(expandDecimals(10 * 5000, 6));
    expect(deposit.minMarketTokens).eq(100);
    expect(deposit.updatedAtBlock).eq(block.number);
    expect(deposit.shouldConvertETH).eq(true);
    expect(deposit.executionFee).eq("500");
    expect(deposit.callbackGasLimit).eq("200000");
  });

  it("executeDeposit", async () => {
    await createDeposit(fixture, {
      receiver: user1,
      market: ethUsdMarket,
      longTokenAmount: expandDecimals(10, 18),
      shortTokenAmount: expandDecimals(9 * 5000, 6),
      minMarketTokens: 100,
      gasUsageLabel: "createDeposit",
    });

    const depositKeys = await depositStore.getDepositKeys(0, 1);
    let deposit = await depositStore.get(depositKeys[0]);

    expect(deposit.account).eq(user0.address);
    expect(await depositStore.getDepositCount()).eq(1);

    await executeDeposit(fixture, { gasUsageLabel: "executeDeposit" });

    deposit = await depositStore.get(depositKeys[0]);

    expect(deposit.account).eq(ethers.constants.AddressZero);
    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq(expandDecimals(95000, 18));
    expect(await depositStore.getDepositCount()).eq(0);
  });

  it("price impact", async () => {
    // set price impact to 0.1% for every $50,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 50,000 => 2 * (10 ** -8)
    await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(2, 8));
    await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
    await dataStore.setUint(await reader.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(0);
    expect(await weth.balanceOf(depositStore.address)).eq(0);
    expect(await usdc.balanceOf(depositStore.address)).eq(0);

    expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(0);
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await depositStore.getDepositCount()).eq(0);
    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("49975000000000000000000");
    expect(await weth.balanceOf(depositStore.address)).eq(0);
    expect(await usdc.balanceOf(depositStore.address)).eq(0);

    expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "9995000000000000000"
    );
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);
    expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "5000000000000000" // 0.005 ETH, 25 USD
    );

    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq(0);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(49975, 6),
        receiver: user1,
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));

    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq("50000000000000000000000"); // 50000
  });

  // it("positive and negative price impact", async () => {
  //   // set negative price impact to 0.1% for every $50,000 of token imbalance
  //   // 0.1% => 0.001
  //   // 0.001 / 50,000 => 2 * (10 ** -8)
  //   // set positive price impact to 0.05% for every $50,000 of token imbalance
  //   // 0.05% => 0.0005
  //   // 0.0005 / 50,000 => 1 * (10 ** -8)
  //   await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
  //   await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 8));
  //   await dataStore.setUint(await reader.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));
  //
  //   await handleDeposit(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       longTokenAmount: expandDecimals(10, 18),
  //     },
  //     execute: {
  //       gasUsageLabel: "executeDeposit",
  //     },
  //   });
  //
  //   expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));
  //
  //   expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("49975000000000000010000");
  //   expect(await weth.balanceOf(depositStore.address)).eq(0);
  //   expect(await usdc.balanceOf(depositStore.address)).eq(0);
  //
  //   expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
  //   expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "9995000000000000001"
  //   );
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);
  //   expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "4999999999999999" // 0.005 ETH, 25 USD
  //   );
  //
  //   await handleDeposit(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       shortTokenAmount: expandDecimals(49975, 6),
  //       receiver: user1,
  //     },
  //     execute: {
  //       gasUsageLabel: "executeDeposit",
  //     },
  //   });
  //
  //   expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));
  //
  //   expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq("49987487503124999995000"); // 49987.487503125
  // });
  //
  // it("price impact split over multiple orders", async () => {
  //   // set negative price impact to 0.1% for every $50,000 of token imbalance
  //   // 0.1% => 0.001
  //   // 0.001 / 50,000 => 2 * (10 ** -8)
  //   // set positive price impact to 0.05% for every $50,000 of token imbalance
  //   // 0.05% => 0.0005
  //   // 0.0005 / 50,000 => 1 * (10 ** -8)
  //   await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
  //   await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 8));
  //   await dataStore.setUint(await reader.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));
  //
  //   await handleDeposit(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       longTokenAmount: expandDecimals(5, 18),
  //     },
  //     execute: {
  //       gasUsageLabel: "executeDeposit",
  //     },
  //   });
  //
  //   expect(
  //     await reader.getMarketTokenPrice(
  //       dataStore.address,
  //       ethUsdMarket,
  //       expandDecimals(5000, 4 + 8),
  //       expandDecimals(1, 6 + 18),
  //       expandDecimals(5000, 4 + 8)
  //     )
  //   ).eq(expandDecimals(1, 30));
  //
  //   expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("24993750000000000005000");
  //   expect(await weth.balanceOf(depositStore.address)).eq(0);
  //   expect(await usdc.balanceOf(depositStore.address)).eq(0);
  //
  //   expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(5, 18));
  //   expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "4998750000000000001" // 4.99875
  //   );
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);
  //   expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "1249999999999999" // 0.00125 ETH, 6.25 USD
  //   );
  //
  //   await handleDeposit(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       longTokenAmount: expandDecimals(5, 18),
  //       receiver: user1,
  //     },
  //     execute: {
  //       gasUsageLabel: "executeDeposit",
  //     },
  //   });
  //
  //   expect(
  //     await reader.getMarketTokenPrice(
  //       dataStore.address,
  //       ethUsdMarket,
  //       expandDecimals(5000, 4 + 8),
  //       expandDecimals(1, 6 + 18),
  //       expandDecimals(5000, 4 + 8)
  //     )
  //   ).eq(expandDecimals(1, 30));
  //
  //   expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq("24981253125000000005000"); // 24981.253125
  //
  //   expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
  //   expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "9995000625000000002" // 9.995000625
  //   );
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);
  //   expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "4999374999999998" // 0.004999375 ETH, 24.996875 USD
  //   );
  //
  //   // increase positive price impact to 0.2% for every $50,000 of token imbalance
  //   // 0.2% => 0.002
  //   // 0.002 / 50,000 => 4 * (10 ** -8)
  //   await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(4, 8));
  //   await dataStore.setUint(await reader.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));
  //
  //   await handleDeposit(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       shortTokenAmount: expandDecimals(50000, 6),
  //       receiver: user2,
  //     },
  //     execute: {
  //       gasUsageLabel: "executeDeposit",
  //     },
  //   });
  //
  //   expect(
  //     await reader.getMarketTokenPrice(
  //       dataStore.address,
  //       ethUsdMarket,
  //       expandDecimals(5000, 4 + 8),
  //       expandDecimals(1, 6 + 18),
  //       expandDecimals(5000, 4 + 8)
  //     )
  //   ).eq(expandDecimals(1, 30));
  //
  //   expect(await getBalanceOf(ethUsdMarket.marketToken, user2.address)).eq("50024996874999999990000"); // 50024.996875
  //
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     expandDecimals(10, 18)
  //   );
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(
  //     expandDecimals(50 * 1000, 6)
  //   );
  //   expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(0);
  // });
  //
  // it("!isSameSideRebalance, net negative price impact", async () => {
  //   // set negative price impact to 0.1% for every $50,000 of token imbalance
  //   // 0.1% => 0.001
  //   // 0.001 / 50,000 => 2 * (10 ** -8)
  //   // set positive price impact to 0.05% for every $50,000 of token imbalance
  //   // 0.05% => 0.0005
  //   // 0.0005 / 50,000 => 1 * (10 ** -8)
  //   await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
  //   await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 8));
  //   await dataStore.setUint(await reader.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));
  //
  //   await handleDeposit(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       longTokenAmount: expandDecimals(10, 18),
  //     },
  //     execute: {
  //       gasUsageLabel: "executeDeposit",
  //     },
  //   });
  //
  //   expect(
  //     await reader.getMarketTokenPrice(
  //       dataStore.address,
  //       ethUsdMarket,
  //       expandDecimals(5000, 4 + 8),
  //       expandDecimals(1, 6 + 18),
  //       expandDecimals(5000, 4 + 8)
  //     )
  //   ).eq(expandDecimals(1, 30));
  //
  //   expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("49975000000000000005000");
  //   expect(await weth.balanceOf(depositStore.address)).eq(0);
  //   expect(await usdc.balanceOf(depositStore.address)).eq(0);
  //
  //   expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
  //   expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "9995000000000000001"
  //   );
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);
  //   expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "4999999999999999" // 0.005 ETH, 25 USD
  //   );
  //
  //   await handleDeposit(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       shortTokenAmount: expandDecimals(100 * 1000, 6),
  //       receiver: user1,
  //     },
  //     execute: {
  //       gasUsageLabel: "executeDeposit",
  //     },
  //   });
  //
  //   expect(
  //     await reader.getMarketTokenPrice(
  //       dataStore.address,
  //       ethUsdMarket,
  //       expandDecimals(5000, 4 + 8),
  //       expandDecimals(1, 6 + 18),
  //       expandDecimals(5000, 4 + 8)
  //     )
  //   ).eq(expandDecimals(1, 30));
  //
  //   expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq("99987462497000000000000"); // 99987.462497
  //
  //   expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
  //   expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(100 * 1000, 6));
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "9995000000000000001"
  //   );
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq("99987462497"); // 99987.462497
  //   expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "4999999999999999" // 0.005 ETH, 25 USD
  //   );
  //   // 12.5 USD positive price impact, 25 USD negative price impact
  //   // net ~12.5 USD negative price impact
  //   expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(
  //     "12537503" // 12.537503
  //   );
  // });
  //
  // it("!isSameSideRebalance, net positive price impact", async () => {
  //   // set negative price impact to 0.1% for every $50,000 of token imbalance
  //   // 0.1% => 0.001
  //   // 0.001 / 50,000 => 2 * (10 ** -8)
  //   // set positive price impact to 0.05% for every $50,000 of token imbalance
  //   // 0.05% => 0.0005
  //   // 0.0005 / 50,000 => 1 * (10 ** -8)
  //   await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
  //   await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 8));
  //   await dataStore.setUint(await reader.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));
  //
  //   await handleDeposit(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       longTokenAmount: expandDecimals(10, 18),
  //     },
  //     execute: {
  //       gasUsageLabel: "executeDeposit",
  //     },
  //   });
  //
  //   expect(
  //     await reader.getMarketTokenPrice(
  //       dataStore.address,
  //       ethUsdMarket,
  //       expandDecimals(5000, 4 + 8),
  //       expandDecimals(1, 6 + 18),
  //       expandDecimals(5000, 4 + 8)
  //     )
  //   ).eq(expandDecimals(1, 30));
  //
  //   expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("49975000000000000005000");
  //   expect(await weth.balanceOf(depositStore.address)).eq(0);
  //   expect(await usdc.balanceOf(depositStore.address)).eq(0);
  //
  //   expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
  //   expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "9995000000000000001"
  //   );
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);
  //   expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "4999999999999999" // 0.005 ETH, 25 USD
  //   );
  //
  //   await handleDeposit(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       shortTokenAmount: expandDecimals(60 * 1000, 6),
  //       receiver: user1,
  //     },
  //     execute: {
  //       gasUsageLabel: "executeDeposit",
  //     },
  //   });
  //
  //   expect(
  //     await reader.getMarketTokenPrice(
  //       dataStore.address,
  //       ethUsdMarket,
  //       expandDecimals(5000, 4 + 8),
  //       expandDecimals(1, 6 + 18),
  //       expandDecimals(5000, 4 + 8)
  //     )
  //   ).eq(expandDecimals(1, 30));
  //
  //   expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq("60011482496874999995000"); // 60011.482496875
  //
  //   expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
  //   expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(60 * 1000, 6));
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "9997296499375000000" // 9.997296499375
  //   );
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq("60000000000"); // 60,000
  //   expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "2703500625000000" // 0.002703500625 ETH, ~13.51 USD
  //   );
  //   expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);
  // });
  //
  // it("price impact, fees", async () => {
  //   // 0.05%: 0.0005
  //   await dataStore.setUint(await reader.swapFeeFactorKey(ethUsdMarket.marketToken), decimalToFloat(5, 4));
  //   // 30%
  //   await dataStore.setUint(await keys.FEE_RECEIVER_DEPOSIT_FACTOR(), decimalToFloat(3, 1));
  //
  //   // set negative price impact to 0.1% for every $50,000 of token imbalance
  //   // 0.1% => 0.001
  //   // 0.001 / 50,000 => 2 * (10 ** -8)
  //   // set positive price impact to 0.05% for every $50,000 of token imbalance
  //   // 0.05% => 0.0005
  //   // 0.0005 / 50,000 => 1 * (10 ** -8)
  //   await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
  //   await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 8));
  //   await dataStore.setUint(await reader.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));
  //
  //   await handleDeposit(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       longTokenAmount: expandDecimals(10, 18),
  //     },
  //     execute: {
  //       gasUsageLabel: "executeDeposit",
  //     },
  //   });
  //
  //   expect(
  //     await reader.getMarketTokenPrice(
  //       dataStore.address,
  //       ethUsdMarket,
  //       expandDecimals(5000, 4 + 8),
  //       expandDecimals(1, 6 + 18),
  //       expandDecimals(5000, 4 + 8)
  //     )
  //   ).eq("1000350350350350350350315280245"); // ~1.00035
  //
  //   expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("49950000000000000005000"); // 49950
  //   expect(await weth.balanceOf(depositStore.address)).eq(0);
  //   expect(await usdc.balanceOf(depositStore.address)).eq(0);
  //   expect(await weth.balanceOf(feeReceiver.address)).eq("1500000000000000"); // 0.0015 ETH, 7.5 USD
  //   expect(await usdc.balanceOf(feeReceiver.address)).eq(0);
  //
  //   expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq("9998500000000000000"); // 9.9985 ETH
  //   expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "9993500000000000001" // 9.9935 ETH
  //   );
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);
  //   expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "4999999999999999" // 0.005 ETH, 25 USD
  //   );
  //
  //   await handleDeposit(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       shortTokenAmount: expandDecimals(49975, 6),
  //       receiver: user1,
  //     },
  //     execute: {
  //       gasUsageLabel: "executeDeposit",
  //     },
  //   });
  //
  //   expect(
  //     await reader.getMarketTokenPrice(
  //       dataStore.address,
  //       ethUsdMarket,
  //       expandDecimals(5000, 4 + 8),
  //       expandDecimals(1, 6 + 18),
  //       expandDecimals(5000, 4 + 8)
  //     )
  //   ).eq("1000525446705012120185445364966"); // ~1.00052
  //
  //   expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq("49944998007168690894087"); // 49944.998
  //   expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq("9998500000000000000"); // 9.9985 ETH
  //   expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq("49967503750"); // 49967.50375 USDC
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "9995996750943750000" // 9.996 ETH
  //   );
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq("49967503750"); // 49967.50375 USDC
  //   expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "2503249056250000" // 0.0025, 12.5 USD
  //   );
  // });
  //
  // it("price impact, spread, fees", async () => {
  //   // 0.05%: 0.0005
  //   await dataStore.setUint(await reader.swapFeeFactorKey(ethUsdMarket.marketToken), decimalToFloat(5, 4));
  //   // 30%
  //   await dataStore.setUint(await keys.FEE_RECEIVER_DEPOSIT_FACTOR(), decimalToFloat(3, 1));
  //
  //   // set negative price impact to 0.1% for every $50,000 of token imbalance
  //   // 0.1% => 0.001
  //   // 0.001 / 50,000 => 2 * (10 ** -8)
  //   // set positive price impact to 0.05% for every $50,000 of token imbalance
  //   // 0.05% => 0.0005
  //   // 0.0005 / 50,000 => 1 * (10 ** -8)
  //   await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
  //   await dataStore.setUint(await reader.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 8));
  //   await dataStore.setUint(await reader.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));
  //
  //   await handleDeposit(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       longTokenAmount: expandDecimals(10, 18),
  //     },
  //     execute: {
  //       gasUsageLabel: "executeDeposit",
  //     },
  //   });
  //
  //   expect(
  //     await reader.getMarketTokenPrice(
  //       dataStore.address,
  //       ethUsdMarket,
  //       expandDecimals(5000, 4 + 8),
  //       expandDecimals(1, 6 + 18),
  //       expandDecimals(5000, 4 + 8)
  //     )
  //   ).eq("1000450495545099609570482481174"); // ~1.00045
  //
  //   expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("49945000000000000005000");
  //   expect(await weth.balanceOf(depositStore.address)).eq(0);
  //   expect(await usdc.balanceOf(depositStore.address)).eq(0);
  //   expect(await weth.balanceOf(feeReceiver.address)).eq("1500000000000000"); // 0.0015 ETH, 7.5 USD
  //   expect(await usdc.balanceOf(feeReceiver.address)).eq(0);
  //
  //   expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq("9998500000000000000"); // 9.9985 ETH
  //   expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "9993500000000000001" // 9.9935 ETH
  //   );
  //   expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);
  //   expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
  //     "4999999999999999" // 0.005 ETH, 24.97 USD
  //   );
  //
  //   await handleDeposit(fixture, {
  //     create: {
  //       market: ethUsdMarket,
  //       shortTokenAmount: expandDecimals(49975, 6),
  //       receiver: user1,
  //     },
  //     execute: {
  //       gasUsageLabel: "executeDeposit",
  //     },
  //   });
  //
  //   expect(
  //     await reader.getMarketTokenPrice(
  //       dataStore.address,
  //       ethUsdMarket,
  //       expandDecimals(5000, 4 + 8),
  //       expandDecimals(1, 6 + 18),
  //       expandDecimals(5000, 4 + 8)
  //     )
  //   ).eq("1000675653226981766171799091984"); // ~1.000675
  //
  //   expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq("49935003258206393525799"); // 49935.0032
  // });
});
