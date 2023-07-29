import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { getBalanceOf } from "../../utils/token";
import { getPoolAmount } from "../../utils/market";
import { getDepositCount, handleDeposit } from "../../utils/deposit";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";

describe("Guardian.HomogenousMarkets", () => {
  let fixture;
  let user1;
  let dataStore, wnt, usdc, ethUsdSingleTokenMarket;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user1 } = fixture.accounts);
    ({ dataStore, wnt, usdc, ethUsdSingleTokenMarket } = fixture.contracts);
  });

  it("Long token == short token, deposit long token", async () => {
    // Check that long token and short token are the same
    expect(ethUsdSingleTokenMarket.longToken).to.eq(ethUsdSingleTokenMarket.shortToken);

    // User1 creates a deposit for $500,000 worth of long tokens
    await handleDeposit(fixture, {
      create: {
        account: user1,
        market: ethUsdSingleTokenMarket,
        longTokenAmount: expandDecimals(500_000, 6), // $500,000
      },
      execute: {
        tokens: [wnt.address, usdc.address],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    // Check that User1 have $500,000 worth of market tokens
    expect(await getBalanceOf(ethUsdSingleTokenMarket.marketToken, user1.address)).eq(expandDecimals(500000, 18));

    // Check the pool received the deposited amount
    expect(await getPoolAmount(dataStore, ethUsdSingleTokenMarket.marketToken, usdc.address)).eq(
      expandDecimals(500_000, 6)
    );
  });

  it("Long token == short token, deposit short token", async () => {
    // Check that long token and short token are the same
    expect(ethUsdSingleTokenMarket.longToken).to.eq(ethUsdSingleTokenMarket.shortToken);

    // User1 creates a deposit for $500,000 worth of short tokens
    await handleDeposit(fixture, {
      create: {
        account: user1,
        market: ethUsdSingleTokenMarket,
        longTokenAmount: expandDecimals(500_000, 6), // $500,000
      },
      execute: {
        tokens: [wnt.address, usdc.address],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    // Check that User1 have $500,000 worth of market tokens
    expect(await getBalanceOf(ethUsdSingleTokenMarket.marketToken, user1.address)).eq(expandDecimals(500000, 18));

    // Check the pool received the deposited amount
    expect(await getPoolAmount(dataStore, ethUsdSingleTokenMarket.marketToken, usdc.address)).eq(
      expandDecimals(500_000, 6)
    );
  });

  it("Long token == short token, deposit short tokens and long tokens", async () => {
    // Check that long token and short token are the same
    expect(ethUsdSingleTokenMarket.longToken).to.eq(ethUsdSingleTokenMarket.shortToken);

    // User1 creates a deposit for $250,000 worth of long tokens and $250,000 worth of short tokens
    await handleDeposit(fixture, {
      create: {
        account: user1,
        market: ethUsdSingleTokenMarket,
        longTokenAmount: expandDecimals(250_000, 6), // $500,000
        shortTokenAmount: expandDecimals(250_000, 6), // $250,000
      },
      execute: {
        tokens: [wnt.address, usdc.address],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
        precisions: [8, 18],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    // Check that User1 have $500,000 worth of market token
    expect(await getBalanceOf(ethUsdSingleTokenMarket.marketToken, user1.address)).eq(expandDecimals(500000, 18));

    // Check the pool received the deposited amount
    expect(await getPoolAmount(dataStore, ethUsdSingleTokenMarket.marketToken, usdc.address)).eq(
      expandDecimals(500_000, 6)
    );

    // Check that User0's deposit got executed and there is 0 deposits waiting to get executed
    expect(await getDepositCount(dataStore)).eq(0);
  });
});
