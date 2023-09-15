import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import * as keys from "../../utils/keys";
import { grantRole } from "../../utils/role";
import { encodeData } from "../../utils/hash";
import { prices } from "../../utils/prices";
import { getMarketTokenPriceWithPoolValue } from "../../utils/market";
import { getSupplyOf } from "../../utils/token";

describe("Guardian.FirstDeposit", () => {
  let fixture;
  let wallet;
  let roleStore, wnt, usdc, config, ethUsdMarket;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet } = fixture.accounts);
    ({ roleStore, ethUsdMarket, wnt, usdc, config } = fixture.contracts);
  });

  it("First deposits may go through if there is no requirement configured", async () => {
    // Market is empty
    expect(await getSupplyOf(ethUsdMarket.marketToken)).to.eq(0);

    // Market token price is $1
    let [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    expect(marketTokenPrice).to.eq(decimalToFloat(1));
    expect(poolValueInfo.poolValue).to.eq(0);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(10 * 5_000, 6),
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    // Market is no longer empty
    expect(await getSupplyOf(ethUsdMarket.marketToken)).to.eq(expandDecimals(100_000, 18));

    // Market token price is $1
    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    expect(marketTokenPrice).to.eq(decimalToFloat(1));
    expect(poolValueInfo.poolValue).to.eq(decimalToFloat(100_000));
  });

  it("First deposits must be above the configured value and go to address(1)", async () => {
    // Configure the first depositor requirement
    await grantRole(roleStore, wallet.address, "CONFIG_KEEPER");

    await config
      .connect(wallet)
      .setUint(
        keys.MIN_MARKET_TOKENS_FOR_FIRST_DEPOSIT,
        encodeData(["address"], [ethUsdMarket.marketToken]),
        expandDecimals(10, 18)
      );

    // Market is empty
    expect(await getSupplyOf(ethUsdMarket.marketToken)).to.eq(0);

    // Market token price is $1
    let [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    expect(marketTokenPrice).to.eq(decimalToFloat(1));
    expect(poolValueInfo.poolValue).to.eq(0);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(10 * 5_000, 6),
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        expectedCancellationReason: "InvalidReceiverForFirstDeposit",
      },
    });

    // Market is still empty
    expect(await getSupplyOf(ethUsdMarket.marketToken)).to.eq(0);

    // Market token price is $1
    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    expect(marketTokenPrice).to.eq(decimalToFloat(1));
    expect(poolValueInfo.poolValue).to.eq(0);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1, 15),
        shortTokenAmount: expandDecimals(5, 6),
        receiver: { address: "0x0000000000000000000000000000000000000001" },
        minMarketTokens: expandDecimals(9, 18),
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        expectedCancellationReason: "InvalidMinMarketTokensForFirstDeposit",
      },
    });

    // Market is still empty
    expect(await getSupplyOf(ethUsdMarket.marketToken)).to.eq(0);

    // Market token price is $1
    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    expect(marketTokenPrice).to.eq(decimalToFloat(1));
    expect(poolValueInfo.poolValue).to.eq(0);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1, 15),
        shortTokenAmount: expandDecimals(4, 6),
        receiver: { address: "0x0000000000000000000000000000000000000001" },
        minMarketTokens: expandDecimals(10, 18),
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        expectedCancellationReason: "MinMarketTokens",
      },
    });

    // Market is still empty
    expect(await getSupplyOf(ethUsdMarket.marketToken)).to.eq(0);

    // Market token price is $1
    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    expect(marketTokenPrice).to.eq(decimalToFloat(1));
    expect(poolValueInfo.poolValue).to.eq(0);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1, 15),
        shortTokenAmount: expandDecimals(5, 6),
        receiver: { address: "0x0000000000000000000000000000000000000001" },
        minMarketTokens: expandDecimals(10, 18),
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    // Market is no longer empty
    expect(await getSupplyOf(ethUsdMarket.marketToken)).to.eq(expandDecimals(10, 18));

    // Market token price is $1
    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    expect(marketTokenPrice).to.eq(decimalToFloat(1));
    expect(poolValueInfo.poolValue).to.eq(decimalToFloat(10));
  });

  it("Markets function normally after the first deposit is made", async () => {
    // Configure the first depositor requirement
    await grantRole(roleStore, wallet.address, "CONFIG_KEEPER");

    await config
      .connect(wallet)
      .setUint(
        keys.MIN_MARKET_TOKENS_FOR_FIRST_DEPOSIT,
        encodeData(["address"], [ethUsdMarket.marketToken]),
        expandDecimals(10, 18)
      );

    // Market is empty
    expect(await getSupplyOf(ethUsdMarket.marketToken)).to.eq(0);

    // Market token price is $1
    let [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    expect(marketTokenPrice).to.eq(decimalToFloat(1));
    expect(poolValueInfo.poolValue).to.eq(0);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(100, 18),
        shortTokenAmount: expandDecimals(100 * 5_000, 6),
        minMarketTokens: expandDecimals(200, 18),
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        expectedCancellationReason: "InvalidReceiverForFirstDeposit",
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1, 15),
        shortTokenAmount: expandDecimals(5, 6),
        receiver: { address: "0x0000000000000000000000000000000000000001" },
        minMarketTokens: expandDecimals(10, 18),
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    // Market is no longer empty
    expect(await getSupplyOf(ethUsdMarket.marketToken)).to.eq(expandDecimals(10, 18));

    // Market token price is $1
    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    expect(marketTokenPrice).to.eq(decimalToFloat(1));
    expect(poolValueInfo.poolValue).to.eq(decimalToFloat(10));

    // Now regular deposits can occur.

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(100, 18),
        shortTokenAmount: expandDecimals(100 * 5_000, 6),
        minMarketTokens: expandDecimals(200, 18),
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    // Deposit has been made
    expect(await getSupplyOf(ethUsdMarket.marketToken)).to.eq(expandDecimals(1_000_010, 18));

    // Market token price is $1
    [marketTokenPrice, poolValueInfo] = await getMarketTokenPriceWithPoolValue(fixture, {
      prices: prices.ethUsdMarket,
    });

    expect(marketTokenPrice).to.eq(decimalToFloat(1));
    expect(poolValueInfo.poolValue).to.eq(decimalToFloat(1_000_010));
  });
});
