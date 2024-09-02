import { expect } from "chai";
import { ethers } from "hardhat";

import * as keys from "../../utils/keys";
import { handleGlvDeposit, handleGlvWithdrawal } from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { decimalToFloat, expandDecimals } from "../../utils/math";
import { getBalanceOf } from "../../utils/token";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";

describe("Guardian.Glv", () => {
  let fixture;
  let user0, user1;
  let dataStore, ethUsdMarket, ethUsdGlvAddress, wnt, usdc, solUsdMarket, reader, sol;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, ethUsdGlvAddress, wnt, usdc, solUsdMarket, reader, sol } = fixture.contracts);
  });

  it("When GM markets in Glv are above PnlToPoolFactor for withdrawals, no value is extractable", async () => {
    await dataStore.setUint(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, expandDecimals(30, 28));
    await dataStore.setUint(keys.MAX_PNL_FACTOR_FOR_DEPOSITS, expandDecimals(60, 28));

    // This GLV is made up of:
    //  - SOL/USD
    //  - ETH/USD
    //
    // Deposit an initial balance of 10,000 SOL/USD GM tokens
    const glvSolGMBalanceBefore = await getBalanceOf(solUsdMarket.marketToken, ethUsdGlvAddress);

    await handleGlvDeposit(fixture, {
      create: {
        account: user1,
        shortTokenAmount: expandDecimals(5000, 6),
        longTokenAmount: expandDecimals(1, 18),
        market: solUsdMarket,
      },
    });

    // Ensure GM tokens have been deposited into the GLV
    const glvSolGMBalanceAfter = await getBalanceOf(solUsdMarket.marketToken, ethUsdGlvAddress);

    expect(glvSolGMBalanceAfter.sub(glvSolGMBalanceBefore)).to.eq(expandDecimals(10_000, 18));

    const glvEthGMBalanceBefore = await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress);

    // get the same amount GM tokens for the ETH/USD market in GLV as well
    await handleGlvDeposit(fixture, {
      create: {
        account: user1,
        shortTokenAmount: expandDecimals(5000, 6),
        longTokenAmount: expandDecimals(1, 18),
        market: ethUsdMarket,
      },
    });

    const glvEthGMBalanceAfter = await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress);

    expect(glvEthGMBalanceAfter.sub(glvEthGMBalanceBefore)).to.eq(expandDecimals(10_000, 18));

    // Open trader position to get some PnL

    await handleOrder(fixture, {
      create: {
        market: solUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: decimalToFloat(2000),
        acceptablePrice: expandDecimals(60, 21),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: {
        tokens: [wnt.address, usdc.address, sol.address],
        precisions: [8, 18, 8],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(50, 5)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(50, 5)],
      },
    });

    // SOL/USD GM Market now goes above the pnlToPoolFactor for withdrawals.

    const pricesSolMarket = {
      indexTokenPrice: {
        min: expandDecimals(50, 13),
        max: expandDecimals(50, 13),
      },
      longTokenPrice: {
        min: expandDecimals(5000, 12),
        max: expandDecimals(5000, 12),
      },
      shortTokenPrice: {
        min: expandDecimals(1, 24),
        max: expandDecimals(1, 24),
      },
    };

    const pnlToPoolFactorBefore = await reader.getPnlToPoolFactor(
      dataStore.address,
      solUsdMarket.marketToken,
      pricesSolMarket,
      true,
      true
    );

    expect(pnlToPoolFactorBefore).to.eq(0);

    const initialEthDeposit = expandDecimals(1, 17);
    const initialUsdcDeposit = expandDecimals(500, 6);

    // Get some initial GM token for the ETH/USD market
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: initialEthDeposit, // .1 ETH
        shortTokenAmount: initialUsdcDeposit, // 500 USDC
      },
    });

    // Received 1,000 GM A tokens
    const user0EthUsdGlvBalanceBefore = await getBalanceOf(ethUsdMarket.marketToken, user0.address);

    expect(user0EthUsdGlvBalanceBefore).to.eq(expandDecimals(1000, 18));

    // SOL price has changed such that we are over the withdrawal pnlToPoolFactor for the SOL/USD market
    const pricesSolMarketGain = {
      indexTokenPrice: {
        min: expandDecimals(100, 13), // 100% trader pnl gain
        max: expandDecimals(100, 13),
      },
      longTokenPrice: {
        min: expandDecimals(5000, 12),
        max: expandDecimals(5000, 12),
      },
      shortTokenPrice: {
        min: expandDecimals(1, 24),
        max: expandDecimals(1, 24),
      },
    };

    const pnlToPoolFactorAfter = await reader.getPnlToPoolFactor(
      dataStore.address,
      solUsdMarket.marketToken,
      pricesSolMarketGain,
      true,
      true
    );

    const pnlToPoolFactorForWithdrawals = await dataStore.getUint(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS);
    const pnlToPoolFactorForDeposits = await dataStore.getUint(keys.MAX_PNL_FACTOR_FOR_DEPOSITS);

    expect(pnlToPoolFactorForWithdrawals).to.eq(expandDecimals(30, 28)); // 30% pnlToPoolFactor for withdrawals
    expect(pnlToPoolFactorForDeposits).to.eq(expandDecimals(60, 28)); // 60% pnlToPoolFactor for deposits

    expect(pnlToPoolFactorAfter).to.eq(expandDecimals(40, 28)); // 40% pnlToPoolFactor currently
    expect(pnlToPoolFactorAfter).to.be.gt(pnlToPoolFactorForWithdrawals); // pnlToPoolFactor is greater than the pnlToPoolFactorForWithdrawals
    expect(pnlToPoolFactorAfter).to.be.lt(pnlToPoolFactorForDeposits); // pnlToPoolFactor is less than the pnlToPoolFactorForDeposits

    const glvBalanceBefore = await getBalanceOf(ethUsdGlvAddress, user0.address);

    expect(glvBalanceBefore).to.eq("0");

    // Deposit into GLV
    await handleGlvDeposit(fixture, {
      create: {
        marketTokenAmount: expandDecimals(1000, 18),
        market: ethUsdMarket,
        isMarketTokenDeposit: true,
        initialLongToken: ethers.constants.AddressZero,
        initialShortToken: ethers.constants.AddressZero,
      },
      execute: {
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(100, 5)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(100, 5)],
      },
    });

    // Deposit 1,000 ETH/USD GM for GLV, receive 1,111.11 GLV tokens
    const glvBalance = await getBalanceOf(ethUsdGlvAddress, user0.address);

    expect(glvBalance).to.eq("1111111111111111111111");

    const usdcBalBefore = await usdc.balanceOf(user0.address);
    const wntBalBefore = await wnt.balanceOf(user0.address);

    // Withdraw from GLV all our GLV tokens
    await handleGlvWithdrawal(fixture, {
      create: {
        glvTokenAmount: glvBalance,
      },
      execute: {
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(100, 5)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(100, 5)],
      },
    });

    const usdcBalAfter = await usdc.balanceOf(user0.address);
    const wntBalAfter = await wnt.balanceOf(user0.address);

    expect(usdcBalAfter).to.be.closeTo(usdcBalBefore.add(expandDecimals(500, 6)), "1");
    expect(wntBalAfter).to.be.closeTo(wntBalBefore.add(expandDecimals(1, 17)), "1");
  });

  it("When GM markets in Glv are above PnlToPoolFactor for deposits, no value is extractable", async () => {
    await dataStore.setUint(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, expandDecimals(30, 28));
    await dataStore.setUint(keys.MAX_PNL_FACTOR_FOR_DEPOSITS, expandDecimals(60, 28));

    // This GLV is made up of:
    //  - SOL/USD
    //  - ETH/USD
    //
    // Deposit an initial balance of 10,000 SOL/USD GM tokens
    const glvSolGMBalanceBefore = await getBalanceOf(solUsdMarket.marketToken, ethUsdGlvAddress);

    await handleGlvDeposit(fixture, {
      create: {
        account: user1,
        shortTokenAmount: expandDecimals(5000, 6),
        longTokenAmount: expandDecimals(1, 18),
        market: solUsdMarket,
      },
    });

    // Ensure GM tokens have been deposited into the GLV
    const glvSolGMBalanceAfter = await getBalanceOf(solUsdMarket.marketToken, ethUsdGlvAddress);

    expect(glvSolGMBalanceAfter.sub(glvSolGMBalanceBefore)).to.eq(expandDecimals(10_000, 18));

    const glvEthGMBalanceBefore = await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress);

    // get the same amount GM tokens for the ETH/USD market in GLV as well
    await handleGlvDeposit(fixture, {
      create: {
        account: user1,
        shortTokenAmount: expandDecimals(5000, 6),
        longTokenAmount: expandDecimals(1, 18),
        market: ethUsdMarket,
      },
    });

    const glvEthGMBalanceAfter = await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress);

    expect(glvEthGMBalanceAfter.sub(glvEthGMBalanceBefore)).to.eq(expandDecimals(10_000, 18));

    // Open trader position to get some PnL

    await handleOrder(fixture, {
      create: {
        market: solUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: decimalToFloat(2000),
        acceptablePrice: expandDecimals(60, 21),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: {
        tokens: [wnt.address, usdc.address, sol.address],
        precisions: [8, 18, 8],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(50, 5)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(50, 5)],
      },
    });

    // SOL/USD GM Market now goes above the pnlToPoolFactor for withdrawals.

    const pricesSolMarket = {
      indexTokenPrice: {
        min: expandDecimals(50, 13),
        max: expandDecimals(50, 13),
      },
      longTokenPrice: {
        min: expandDecimals(5000, 12),
        max: expandDecimals(5000, 12),
      },
      shortTokenPrice: {
        min: expandDecimals(1, 24),
        max: expandDecimals(1, 24),
      },
    };

    const pnlToPoolFactorBefore = await reader.getPnlToPoolFactor(
      dataStore.address,
      solUsdMarket.marketToken,
      pricesSolMarket,
      true,
      true
    );

    expect(pnlToPoolFactorBefore).to.eq(0);

    const initialEthDeposit = expandDecimals(1, 17);
    const initialUsdcDeposit = expandDecimals(500, 6);

    // Get some initial GM token for the ETH/USD market
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: initialEthDeposit, // .1 ETH
        shortTokenAmount: initialUsdcDeposit, // 500 USDC
      },
    });

    // Received 1,000 GM A tokens
    const user0EthUsdGlvBalanceBefore = await getBalanceOf(ethUsdMarket.marketToken, user0.address);

    expect(user0EthUsdGlvBalanceBefore).to.eq(expandDecimals(1000, 18));

    // SOL price has changed such that we are over the withdrawal pnlToPoolFactor for the SOL/USD market
    const pricesSolMarketGain = {
      indexTokenPrice: {
        min: expandDecimals(150, 13), // 200% trader pnl gain
        max: expandDecimals(150, 13),
      },
      longTokenPrice: {
        min: expandDecimals(5000, 12),
        max: expandDecimals(5000, 12),
      },
      shortTokenPrice: {
        min: expandDecimals(1, 24),
        max: expandDecimals(1, 24),
      },
    };

    const pnlToPoolFactorAfter = await reader.getPnlToPoolFactor(
      dataStore.address,
      solUsdMarket.marketToken,
      pricesSolMarketGain,
      true,
      true
    );

    const pnlToPoolFactorForWithdrawals = await dataStore.getUint(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS);
    const pnlToPoolFactorForDeposits = await dataStore.getUint(keys.MAX_PNL_FACTOR_FOR_DEPOSITS);

    expect(pnlToPoolFactorForWithdrawals).to.eq(expandDecimals(30, 28)); // 30% pnlToPoolFactor for withdrawals
    expect(pnlToPoolFactorForDeposits).to.eq(expandDecimals(60, 28)); // 60% pnlToPoolFactor for deposits

    expect(pnlToPoolFactorAfter).to.be.gt(pnlToPoolFactorForWithdrawals); // pnlToPoolFactor is greater than the pnlToPoolFactorForWithdrawals
    expect(pnlToPoolFactorAfter).to.be.gt(pnlToPoolFactorForDeposits); // pnlToPoolFactor is greater than the pnlToPoolFactorForDeposits
    expect(pnlToPoolFactorAfter).to.eq(expandDecimals(80, 28)); // 80% pnlToPoolFactor currently

    const glvBalanceBefore = await getBalanceOf(ethUsdGlvAddress, user0.address);

    expect(glvBalanceBefore).to.eq("0");

    // Deposit into GLV
    await handleGlvDeposit(fixture, {
      create: {
        marketTokenAmount: expandDecimals(1000, 18),
        market: ethUsdMarket,
        isMarketTokenDeposit: true,
        initialLongToken: ethers.constants.AddressZero,
        initialShortToken: ethers.constants.AddressZero,
      },
      execute: {
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(100, 5)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(100, 5)],
      },
    });

    // Deposit 1,000 ETH/USD GM for GLV, receive 1,111.11 GLV tokens
    const glvBalance = await getBalanceOf(ethUsdGlvAddress, user0.address);

    expect(glvBalance).to.eq("1111111111111111111111");

    const usdcBalBefore = await usdc.balanceOf(user0.address);
    const wntBalBefore = await wnt.balanceOf(user0.address);

    // Withdraw from GLV all our GLV tokens
    await handleGlvWithdrawal(fixture, {
      create: {
        glvTokenAmount: glvBalance,
      },
      execute: {
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(100, 5)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(100, 5)],
      },
    });

    const usdcBalAfter = await usdc.balanceOf(user0.address);
    const wntBalAfter = await wnt.balanceOf(user0.address);

    expect(usdcBalAfter).to.be.closeTo(usdcBalBefore.add(expandDecimals(500, 6)), "1");
    expect(wntBalAfter).to.be.closeTo(wntBalBefore.add(expandDecimals(1, 17)), "1");
  });
});
