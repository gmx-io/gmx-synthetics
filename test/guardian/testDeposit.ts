import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { getBalanceOf } from "../../utils/token";
import { getPoolAmount } from "../../utils/market";
import { getDepositCount, getDepositKeys, createDeposit, executeDeposit, handleDeposit } from "../../utils/deposit";
import { getExecuteParams } from "../../utils/exchange";

describe("Guardian.Deposit", () => {
  let fixture;
  let user0, user1, user2;
  let reader, dataStore, ethUsdMarket, ethUsdSpotOnlyMarket, ethUsdtMarket, btcUsdMarket, wnt, usdc, usdt, wbtc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2 } = fixture.accounts);
    ({ reader, dataStore, ethUsdMarket, ethUsdSpotOnlyMarket, ethUsdtMarket, btcUsdMarket, wnt, usdc, usdt, wbtc } =
      fixture.contracts);
  });

  it("Deposit long token", async () => {
    // User0 creates a deposit for $50,000 worth of long token
    await createDeposit(fixture, {
      account: user0,
      receiver: user0,
      market: ethUsdMarket,
      longTokenAmount: expandDecimals(10, 18), // $50,000
    });

    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    // Check that 1 deposit has been created
    expect(deposit.addresses.account).eq(user0.address);
    expect(await getDepositCount(dataStore)).eq(1);

    // Execute the deposit
    await executeDeposit(fixture);

    // Check that User1 have $50,000 worth of market token
    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(50000, 18));

    // Check the pool received the deposited amount
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0);

    // Check that User0's deposit got executed and there is 0 deposits waiting to get executed
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("Deposit short token", async () => {
    // User1 creates a deposit for $50,000 worth of short token
    await createDeposit(fixture, {
      account: user1,
      receiver: user1,
      market: ethUsdMarket,
      shortTokenAmount: expandDecimals(50 * 1000, 6), // $50,000
    });

    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    // Check that 1 deposit has been created
    expect(deposit.addresses.account).eq(user1.address);
    expect(await getDepositCount(dataStore)).eq(1);

    // Execute the deposit
    await executeDeposit(fixture);

    // Check that User1 have $50,000 worth of market token
    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq(expandDecimals(50000, 18));

    // Check the pool received the deposited amount
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50 * 1000, 6));

    // Check that User1's deposit got executed and there is 0 deposits waiting to get executed
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("Deposit both long and short token", async () => {
    // User2 creates a deposit for $25,000 worth of long token and $25,000 worth of short token
    await createDeposit(fixture, {
      account: user2,
      receiver: user2,
      market: ethUsdMarket,
      longTokenAmount: expandDecimals(5, 18), // $25,000
      shortTokenAmount: expandDecimals(25 * 1000, 6), // $25,000
    });

    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    // Check that 1 deposit has been created
    expect(deposit.addresses.account).eq(user2.address);
    expect(await getDepositCount(dataStore)).eq(1);

    // Execute the deposit
    await executeDeposit(fixture);

    // Check that User2 have $50,000 worth of market token
    expect(await getBalanceOf(ethUsdMarket.marketToken, user2.address)).eq(expandDecimals(50000, 18));

    // Check the pool received the deposited amount
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(5, 18));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(25 * 1000, 6));

    // Check that User2's deposit got executed and there is 0 deposits waiting to get executed
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("Deposit long token with swap path", async () => {
    // User0 adds liquidity for both tokens in both pools
    await handleDeposit(fixture, {
      create: {
        account: user0,
        receiver: user0,
        market: ethUsdSpotOnlyMarket,
        longTokenAmount: expandDecimals(10, 18), // $50,000
        shortTokenAmount: expandDecimals(50 * 1000, 6), // $50,000
      },
    });
    await handleDeposit(fixture, {
      create: {
        account: user0,
        receiver: user0,
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18), // $50,000
        shortTokenAmount: expandDecimals(50 * 1000, 6), // $50,000
      },
    });
    // Check the pools before the deposit
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18)); // $50,000
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50 * 1000, 6)); // $50,000

    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18)); // $50,000
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(
      expandDecimals(50 * 1000, 6)
    ); // $50,000

    // User2 swaps $50,000 of USDC through another market and deposits the WNT output
    await createDeposit(fixture, {
      account: user2,
      receiver: user2,
      market: ethUsdMarket,
      initialLongToken: usdc.address,
      longTokenAmount: expandDecimals(50 * 1000, 6), // $50,000
      longTokenSwapPath: [ethUsdSpotOnlyMarket.marketToken],
    });

    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    // Check that 1 deposit has been created
    expect(deposit.addresses.account).eq(user2.address);
    expect(await getDepositCount(dataStore)).eq(1);

    // Execute the deposit
    await executeDeposit(fixture);

    // Check that User2 have $50,000 worth of market token
    expect(await getBalanceOf(ethUsdMarket.marketToken, user2.address)).eq(expandDecimals(50000, 18));

    // Check the pools received the deposited amount
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(20, 18)); // $100,000
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50 * 1000, 6)); // $50,000

    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(0); // $0
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(
      expandDecimals(100 * 1000, 6)
    ); // $100,000

    // Check that User2's deposit got executed and there is 0 deposits waiting to get executed
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("Deposit short token with swap path", async () => {
    // User0 adds liquidity for both tokens in both pools
    await handleDeposit(fixture, {
      create: {
        account: user0,
        receiver: user0,
        market: ethUsdSpotOnlyMarket,
        longTokenAmount: expandDecimals(10, 18), // $50,000
        shortTokenAmount: expandDecimals(50 * 1000, 6), // $50,000
      },
    });
    await handleDeposit(fixture, {
      create: {
        account: user0,
        receiver: user0,
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18), // $50,000
        shortTokenAmount: expandDecimals(50 * 1000, 6), // $50,000
      },
    });
    await handleDeposit(fixture, {
      create: {
        account: user0,
        receiver: user0,
        market: ethUsdtMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(50 * 1000, 6),
      },
      execute: getExecuteParams(fixture, { tokens: [wnt, usdt] }),
    });

    // Check the pools before the deposit
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18)); // $50,000
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50 * 1000, 6)); // $50,000

    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18)); // $50,000
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(
      expandDecimals(50 * 1000, 6)
    ); // $50,000

    // User2 swaps $50,000 of USDT through other markets and deposits the USDC output
    await createDeposit(fixture, {
      account: user2,
      receiver: user2,
      market: ethUsdMarket,
      initialShortToken: usdt.address,
      shortTokenAmount: expandDecimals(50 * 1000, 6), // $50,000
      shortTokenSwapPath: [ethUsdtMarket.marketToken, ethUsdSpotOnlyMarket.marketToken],
    });

    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    // Check that 1 deposit has been created
    expect(deposit.addresses.account).eq(user2.address);
    expect(await getDepositCount(dataStore)).eq(1);

    // Execute the deposit
    await executeDeposit(fixture, getExecuteParams(fixture, { tokens: [wnt, usdc, usdt] }));

    // Check that User2 have $50,000 worth of market token
    expect(await getBalanceOf(ethUsdMarket.marketToken, user2.address)).eq(expandDecimals(50000, 18));

    // Check the pools received the deposited amount
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18)); // $50,000
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(100 * 1000, 6)); // $100,000

    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(expandDecimals(20, 18)); // $100,000
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(0); // $0

    // Check that User2's deposit got executed and there is 0 deposits waiting to get executed
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("Deposit both long token and short token with a swap path for both", async () => {
    // User0 adds liquidity for both tokens in both pools
    await handleDeposit(fixture, {
      create: {
        account: user0,
        receiver: user0,
        market: ethUsdSpotOnlyMarket,
        longTokenAmount: expandDecimals(10, 18), // $50,000
        shortTokenAmount: expandDecimals(50 * 1000, 6), // $50,000
      },
    });
    await handleDeposit(fixture, {
      create: {
        account: user0,
        receiver: user0,
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18), // $50,000
        shortTokenAmount: expandDecimals(50 * 1000, 6), // $50,000
      },
    });

    // Check the pools before the deposit
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18)); // $50,000
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50 * 1000, 6)); // $50,000

    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18)); // $50,000
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(
      expandDecimals(50 * 1000, 6)
    ); // $50,000

    // User2 creates a deposit for $25,000 worth of long token and $25,000 worth of short token with swap paths for both
    await createDeposit(fixture, {
      account: user2,
      receiver: user2,
      market: ethUsdMarket,
      // Short token: swap WNT to USDC through another market
      initialShortToken: wnt.address,
      shortTokenAmount: expandDecimals(5, 18), // $25,000
      shortTokenSwapPath: [ethUsdSpotOnlyMarket.marketToken],
      // Long token: swap USDC to WNT through another market
      initialLongToken: usdc.address,
      longTokenAmount: expandDecimals(25 * 1000, 6), // $25,000
      longTokenSwapPath: [ethUsdSpotOnlyMarket.marketToken],
    });

    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    // Check that 1 deposit has been created
    expect(deposit.addresses.account).eq(user2.address);
    expect(await getDepositCount(dataStore)).eq(1);

    // Execute the deposit
    await executeDeposit(fixture);

    // Check that User2 have $50,000 worth of market token
    expect(await getBalanceOf(ethUsdMarket.marketToken, user2.address)).eq(expandDecimals(50000, 18));

    // Check the pools received the deposited amount
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(15, 18)); // $75,000
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(75 * 1000, 6)); // $75,000

    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18)); // $50,000
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(
      expandDecimals(50 * 1000, 6)
    ); // $50,000

    // Check that User2's deposit got executed and there is 0 deposits waiting to get executed
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("Deposit both long token and short token with a swap path for long", async () => {
    // User0 adds liquidity for both tokens in both pools
    await handleDeposit(fixture, {
      create: {
        account: user0,
        receiver: user0,
        market: ethUsdSpotOnlyMarket,
        longTokenAmount: expandDecimals(10, 18), // $50,000
        shortTokenAmount: expandDecimals(50 * 1000, 6), // $50,000
      },
    });
    await handleDeposit(fixture, {
      create: {
        account: user0,
        receiver: user0,
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18), // $50,000
        shortTokenAmount: expandDecimals(50 * 1000, 6), // $50,000
      },
    });
    await handleDeposit(fixture, {
      create: {
        account: user0,
        receiver: user0,
        market: btcUsdMarket,
        longTokenAmount: expandDecimals(10, 8),
        shortTokenAmount: expandDecimals(500 * 1000, 6),
      },
      execute: getExecuteParams(fixture, { tokens: [wbtc, usdc] }),
    });

    // Check the pools before the deposit
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18)); // $50,000
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50 * 1000, 6)); // $50,000

    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18)); // $50,000
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(
      expandDecimals(50 * 1000, 6)
    ); // $50,000

    // User2 creates a deposit for $25,000 worth of long token and $25,000 worth of short token provides a long token swap path
    await createDeposit(fixture, {
      account: user2,
      receiver: user2,
      market: ethUsdMarket,
      // Short token
      initialShortToken: ethUsdMarket.shortToken,
      shortTokenAmount: expandDecimals(25 * 1000, 6), // $25,000
      // Long token: swap WBTC to USDC and then WNT without using the destination market
      initialLongToken: wbtc.address,
      longTokenAmount: expandDecimals(5, 7), // 0.5 WBTC, $25,000
      longTokenSwapPath: [btcUsdMarket.marketToken, ethUsdSpotOnlyMarket.marketToken],
    });

    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    // Check that 1 deposit has been created
    expect(deposit.addresses.account).eq(user2.address);
    expect(await getDepositCount(dataStore)).eq(1);

    // Execute the deposit
    await executeDeposit(fixture, getExecuteParams(fixture, { tokens: [wnt, usdc, wbtc] }));

    // Check that User2 have $50,000 worth of market token}
    expect(await getBalanceOf(ethUsdMarket.marketToken, user2.address)).eq(expandDecimals(50000, 18));

    // Check pool received the deposited amount
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(15, 18)); // $75,000
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(75 * 1000, 6)); // $75,000

    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(expandDecimals(5, 18)); // $25,000
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(
      expandDecimals(75 * 1000, 6)
    ); // $75,000

    // Check that User2's deposit got executed and there is 0 deposits waiting to get executed
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("Deposit both long token and short token with a swap path for short", async () => {
    // User0 adds liquidity for both tokens in both pools
    await handleDeposit(fixture, {
      create: {
        account: user0,
        receiver: user0,
        market: ethUsdSpotOnlyMarket,
        longTokenAmount: expandDecimals(10, 18), // $50,000
        shortTokenAmount: expandDecimals(50 * 1000, 6), // $50,000
      },
    });
    await handleDeposit(fixture, {
      create: {
        account: user0,
        receiver: user0,
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18), // $50,000
        shortTokenAmount: expandDecimals(50 * 1000, 6), // $50,000
      },
    });
    await handleDeposit(fixture, {
      create: {
        account: user0,
        receiver: user0,
        market: ethUsdtMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(50 * 1000, 6),
      },
      execute: getExecuteParams(fixture, { tokens: [wnt, usdt] }),
    });

    // Check the pools before the deposit
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18)); // $50,000
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50 * 1000, 6)); // $50,000

    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18)); // $50,000
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(
      expandDecimals(50 * 1000, 6)
    ); // $50,000

    // User2 creates a deposit for $25,000 worth of long token and $25,000 worth of short token and provides a short token swap path
    await createDeposit(fixture, {
      account: user2,
      receiver: user2,
      market: ethUsdMarket,
      // Short token: swap USDT to WNT and then USDC without using the destination market
      initialShortToken: usdt.address,
      shortTokenAmount: expandDecimals(25 * 1000, 6), // $25,000
      shortTokenSwapPath: [ethUsdtMarket.marketToken, ethUsdSpotOnlyMarket.marketToken],
      // Long token
      initialLongToken: ethUsdMarket.longToken,
      longTokenAmount: expandDecimals(5, 18), // $25,000
    });

    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    // Check that 1 deposit has been created
    expect(deposit.addresses.account).eq(user2.address);
    expect(await getDepositCount(dataStore)).eq(1);

    // Execute the deposit
    await executeDeposit(fixture, getExecuteParams(fixture, { tokens: [wnt, usdc, usdt] }));

    // Check that User2 have $50,000 worth of market token
    expect(await getBalanceOf(ethUsdMarket.marketToken, user2.address)).eq(expandDecimals(50000, 18));

    // Check the pools received the deposited amount
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(15, 18)); // $75,000
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(75 * 1000, 6)); // $75,000

    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(expandDecimals(15, 18)); // $75,000
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(
      expandDecimals(25 * 1000, 6)
    ); // $25,000

    // Check that User2's deposit got executed and there is 0 deposits waiting to get executed
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("insufficient pool value due to long token swap path", async () => {
    // User0 adds liquidity for 1 market
    await createDeposit(fixture, {
      account: user0,
      receiver: user0,
      market: ethUsdSpotOnlyMarket,
      longTokenAmount: expandDecimals(10, 18), // $50,000
      shortTokenAmount: expandDecimals(50 * 1000, 6), // $50,000
    });
    await executeDeposit(fixture);

    // User2 attempts to swap more USDC than the external market can pay out in WNT
    await createDeposit(fixture, {
      account: user2,
      receiver: user2,
      market: ethUsdMarket,
      initialLongToken: usdc.address,
      longTokenAmount: expandDecimals(100 * 1000, 6), // $100,000
      longTokenSwapPath: [ethUsdSpotOnlyMarket.marketToken],
    });

    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    // Check that 1 deposit has been created
    expect(deposit.addresses.account).eq(user2.address);
    expect(await getDepositCount(dataStore)).eq(1);

    // Execute deposit will get cancelled due to insufficient pool value
    await executeDeposit(fixture, {
      expectedCancellationReason: "UsdDeltaExceedsPoolValue",
    });

    // Check the pools didn't receive the deposited amount
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0); // $0
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0); // $0

    // Check that User2's deposit got cancelled and there is 0 deposits waiting to get executed
    expect(await getDepositCount(dataStore)).eq(0);
  });

  it("insufficient pool value due to short token swap path", async () => {
    // User0 adds liquidity for 1 market
    await createDeposit(fixture, {
      account: user0,
      receiver: user0,
      market: ethUsdSpotOnlyMarket,
      longTokenAmount: expandDecimals(10, 18), // $50,000
      shortTokenAmount: expandDecimals(50 * 1000, 6), // $50,000
    });
    await executeDeposit(fixture);
    await handleDeposit(fixture, {
      create: {
        account: user0,
        receiver: user0,
        market: ethUsdtMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(50 * 1000, 6),
      },
      execute: getExecuteParams(fixture, { tokens: [wnt, usdt] }),
    });

    // User2 attempts to swap more USDT than the external markets can route
    await createDeposit(fixture, {
      account: user2,
      receiver: user2,
      market: ethUsdMarket,
      initialShortToken: usdt.address,
      shortTokenAmount: expandDecimals(100 * 1000, 6), // $100,000
      shortTokenSwapPath: [ethUsdtMarket.marketToken, ethUsdSpotOnlyMarket.marketToken],
    });

    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    // Check that 1 deposit has been created
    expect(deposit.addresses.account).eq(user2.address);
    expect(await getDepositCount(dataStore)).eq(1);

    // Execute deposit will get cancelled due to insufficient pool value
    await executeDeposit(fixture, {
      ...getExecuteParams(fixture, { tokens: [wnt, usdc, usdt] }),
      expectedCancellationReason: "UsdDeltaExceedsPoolValue",
    });

    // Check the pools didn't receive the deposited amount
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0); // $0
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0); // $0

    // Check that User2's deposit got cancelled and there is 0 deposits waiting to get executed
    expect(await getDepositCount(dataStore)).eq(0);
  });
});
