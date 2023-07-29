import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { getBalanceOf, getSupplyOf } from "../../utils/token";
import { getPoolAmount } from "../../utils/market";
import { handleDeposit } from "../../utils/deposit";
import { getWithdrawalCount, handleWithdrawal } from "../../utils/withdrawal";
import { BigNumber } from "ethers";
import { errorsContract } from "../../utils/error";

describe("Guardian.Withdrawal", () => {
  let fixture;
  let user0, user1;
  let dataStore, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, ethUsdSpotOnlyMarket, wnt, usdc } = fixture.contracts);
  });

  it("Withdraw market tokens for different market fails", async () => {
    // User0 obtains market tokens in ethUsdMarket
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(10 * 5000, 6),
      },
    });
    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(100 * 1000, 18));

    // User1 deposits liquidity into ethUsdSpotOnlyMarket
    await handleDeposit(fixture, {
      create: {
        account: user1,
        market: ethUsdSpotOnlyMarket,
        longTokenAmount: expandDecimals(50, 18),
        shortTokenAmount: expandDecimals(10 * 5000, 6),
      },
    });

    expect(await wnt.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    // Withdraw from proper market
    await handleWithdrawal(fixture, {
      create: {
        market: ethUsdMarket,
        marketTokenAmount: expandDecimals(100 * 1000, 18),
      },
    });

    // Get back the 10 ETH and 50_000 USDC initially deposited
    expect(await wnt.balanceOf(user0.address)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(user0.address)).eq(expandDecimals(50000, 6));
  });

  it("User tries to withdraw with 0 market tokens", async () => {
    expect(await wnt.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    // User0 attempts withdraw 0 market token amount
    await expect(
      handleWithdrawal(fixture, {
        create: {
          market: ethUsdSpotOnlyMarket,
          marketTokenAmount: 0,
        },
      })
    ).to.be.revertedWithCustomError(errorsContract, "EmptyWithdrawalAmount");
    // No tokens were gained
    expect(await wnt.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);
    expect(await getWithdrawalCount(dataStore)).eq(0);
  });

  it("Deposit one token but get both back on withdraw", async () => {
    // User0 deposits ONLY long token
    await handleDeposit(fixture, {
      create: {
        market: ethUsdSpotOnlyMarket,
        longTokenAmount: expandDecimals(10, 18),
      },
    });

    // User1 adds liquidity for both tokens
    await handleDeposit(fixture, {
      create: {
        account: user1,
        market: ethUsdSpotOnlyMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(50_000, 6),
      },
    });

    // At this point, there is $100,000 worth of long tokens, and $50,000 worth of short tokens.
    // When User0 withdraws all their tokens, they should get ~33% of the long tokens and ~33% of short tokens

    expect(await getBalanceOf(ethUsdSpotOnlyMarket.marketToken, user0.address)).eq(expandDecimals(50000, 18));
    expect(await getBalanceOf(ethUsdSpotOnlyMarket.marketToken, user1.address)).eq(expandDecimals(100000, 18)); // Twice as much deposited
    expect(await getSupplyOf(ethUsdSpotOnlyMarket.marketToken)).eq(expandDecimals(150000, 18));
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(expandDecimals(20, 18));
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(
      expandDecimals(50_000, 6)
    );

    // User0 owns 1/3 of the $150,000 pool
    // User0 withdraws 60%
    // 1/3 * $150,000 * 0.6 = $30,000
    await handleWithdrawal(fixture, {
      create: {
        market: ethUsdSpotOnlyMarket,
        marketTokenAmount: expandDecimals(30000, 18),
      },
    });
    // Long tokens have twice value of short tokens so withdraw will be 2:1
    // $30,000 = $20,000 (in long token) + $10,000 (in short token)
    const wntBalAfterWithdraw1 = expandDecimals(4, 18);
    const usdcBalAfterWithdraw1 = expandDecimals(10_000, 6);
    expect(await wnt.balanceOf(user0.address)).eq(wntBalAfterWithdraw1);
    expect(await usdc.balanceOf(user0.address)).eq(usdcBalAfterWithdraw1);

    // Expect pool amount is properly decremented
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq(
      expandDecimals(20 - 4, 18)
    );
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq(
      expandDecimals(50_000 - 10_000, 6)
    );
    // Expect market token supply is properly decremented
    expect(await getSupplyOf(ethUsdSpotOnlyMarket.marketToken)).eq(expandDecimals(120000, 18));
    expect(await getBalanceOf(ethUsdSpotOnlyMarket.marketToken, user0.address)).eq(expandDecimals(20000, 18));

    // User0 withdraws the rest of their market tokens
    await handleWithdrawal(fixture, {
      create: {
        market: ethUsdSpotOnlyMarket,
        marketTokenAmount: expandDecimals(20000, 18),
      },
    });
    // Current pool state is $80,000 (16 * $5,000) worth of long tokens and $40,000 worth of short tokens
    // User0 is owed 1/6 * $120,000 = $20,000
    // $13,333.3333 from long tokens and $6,666.6666 from short tokens
    expect(await wnt.balanceOf(user0.address)).eq(BigNumber.from("2666666666666666666").add(wntBalAfterWithdraw1));
    expect(await usdc.balanceOf(user0.address)).eq(BigNumber.from("6666666666").add(usdcBalAfterWithdraw1));

    // Expect pool amount is properly decremented
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, wnt.address)).eq("13333333333333333334"); // 2/3 * 20 ETH
    expect(await getPoolAmount(dataStore, ethUsdSpotOnlyMarket.marketToken, usdc.address)).eq("33333333334"); // 2/3 * 50,000 USDC
    // Expect market token supply is properly decremented
    expect(await getSupplyOf(ethUsdSpotOnlyMarket.marketToken)).eq(expandDecimals(100000, 18));
    expect(await getBalanceOf(ethUsdSpotOnlyMarket.marketToken, user0.address)).eq(0);
  });
});
