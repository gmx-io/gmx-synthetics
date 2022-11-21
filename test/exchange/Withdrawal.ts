import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { getBalanceOf, getSupplyOf } from "../../utils/token";
import { getMarketTokenPrice } from "../../utils/market";
import { handleDeposit } from "../../utils/deposit";
import { createWithdrawal, executeWithdrawal, handleWithdrawal } from "../../utils/withdrawal";
import * as keys from "../../utils/keys";

describe("Exchange.Withdrawal", () => {
  const { AddressZero } = ethers.constants;
  const { provider } = ethers;

  let fixture;
  let user0, user1, user2;
  let withdrawalHandler, feeReceiver, reader, dataStore, withdrawalStore, ethUsdMarket, weth, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    ({ withdrawalHandler, feeReceiver, reader, dataStore, withdrawalStore, ethUsdMarket, weth, usdc } =
      fixture.contracts);
  });

  it("createWithdrawal", async () => {
    expect(await withdrawalStore.getWithdrawalCount()).eq(0);

    await createWithdrawal(fixture, {
      account: user0,
      receiver: user1,
      callbackContract: user2,
      market: ethUsdMarket,
      marketTokensLongAmount: expandDecimals(1000, 18),
      marketTokensShortAmount: expandDecimals(500, 18),
      minLongTokenAmount: 100,
      minShortTokenAmount: 50,
      shouldConvertETH: true,
      executionFee: 700,
      callbackGasLimit: 100000,
      gasUsageLabel: "createWithdrawal",
    });

    expect(await withdrawalStore.getWithdrawalCount()).eq(1);

    const block = await provider.getBlock();
    const withdrawalKeys = await withdrawalStore.getWithdrawalKeys(0, 1);
    const withdrawal = await withdrawalStore.get(withdrawalKeys[0]);

    expect(withdrawal.account).eq(user0.address);
    expect(withdrawal.receiver).eq(user1.address);
    expect(withdrawal.callbackContract).eq(user2.address);
    expect(withdrawal.market).eq(ethUsdMarket.marketToken);
    expect(withdrawal.marketTokensLongAmount).eq(expandDecimals(1000, 18));
    expect(withdrawal.marketTokensShortAmount).eq(expandDecimals(500, 18));
    expect(withdrawal.minLongTokenAmount).eq(100);
    expect(withdrawal.minShortTokenAmount).eq(50);
    expect(withdrawal.updatedAtBlock).eq(block.number);
    expect(withdrawal.shouldConvertETH).eq(true);
    expect(withdrawal.executionFee).eq(700);
    expect(withdrawal.callbackGasLimit).eq(100000);
  });

  it("executeWithdrawal", async () => {
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(10 * 5000, 6),
      },
    });

    await createWithdrawal(fixture, {
      receiver: user0,
      market: ethUsdMarket,
      marketTokensLongAmount: expandDecimals(1000, 18),
      marketTokensShortAmount: expandDecimals(500, 18),
      minLongTokenAmount: 100,
      minShortTokenAmount: 50,
      shouldConvertETH: false,
      gasUsageLabel: "createWithdrawal",
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

    expect(withdrawal.account).eq(user0.address);
    expect(await withdrawalStore.getWithdrawalCount()).eq(1);

    await executeWithdrawal(fixture, {
      gasUsageLabel: "executeWithdrawal",
    });

    withdrawal = await withdrawalStore.get(withdrawalKeys[0]);
    expect(withdrawal.account).eq(AddressZero);
    expect(await withdrawalStore.getWithdrawalCount()).eq(0);

    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));

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
    // set price impact to 0.1% for every $50,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 50,000 => 2 * (10 ** -8)
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(2, 8));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
      },
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("49975000000000000000000");
    expect(await weth.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await usdc.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await weth.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "9995000000000000000" // 9.995
    );
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);

    await handleWithdrawal(fixture, {
      create: {
        market: ethUsdMarket,
        marketTokensLongAmount: "49975000000000000000000",
        minLongTokenAmount: 0,
      },
      execute: {
        gasUsageLabel: "executeWithdrawal",
      },
    });

    expect(await getMarketTokenPrice(fixture)).eq(0);

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("0");
    expect(await weth.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await usdc.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq("4998750000001"); // 0.00000499875 ETH
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await weth.balanceOf(user0.address)).eq("9999995001249999999"); // 9.99999500125 ETH
    expect(await usdc.balanceOf(user0.address)).eq(0); // 500

    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(0);
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);

    expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "4998750000001" // 0.00000499875 ETH, 0.02499375 USD
    );
  });

  it("price impact, fees", async () => {
    // 0.05%: 0.0005
    await dataStore.setUint(keys.swapFeeFactorKey(ethUsdMarket.marketToken), decimalToFloat(5, 4));
    // 30%
    await dataStore.setUint(keys.FEE_RECEIVER_WITHDRAWAL_FACTOR, decimalToFloat(3, 1));

    // set price impact to 0.1% for every $50,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 50,000 => 2 * (10 ** -8)
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(2, 8));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
      },
    });

    expect(await getMarketTokenPrice(fixture)).eq("1000500500500500500500500500500"); // 1.0005005

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("49950000000000000000000"); // 49950
    expect(await weth.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await usdc.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await weth.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "9995000000000000000" // 9.995
    );
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);

    expect(await weth.balanceOf(feeReceiver.address)).eq(0);
    expect(await usdc.balanceOf(feeReceiver.address)).eq(0);

    await handleWithdrawal(fixture, {
      create: {
        market: ethUsdMarket,
        marketTokensLongAmount: expandDecimals(49940, 18),
        minLongTokenAmount: 100,
      },
      execute: {
        gasUsageLabel: "executeWithdrawal",
      },
    });

    expect(await weth.balanceOf(feeReceiver.address)).eq("1498949849849849"); // 0.0014989
    expect(await usdc.balanceOf(feeReceiver.address)).eq(0);

    expect(await getMarketTokenPrice(fixture)).eq("2749275325325326000000000000000"); // 2.74927532533

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("10000000000000000000"); // 10
    expect(await getSupplyOf(ethUsdMarket.marketToken)).eq("10000000000000000000"); // 10
    expect(await weth.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await usdc.balanceOf(withdrawalHandler.address)).eq(0);
    expect(await weth.balanceOf(ethUsdMarket.marketToken)).eq("5503549600850903"); // 0.005503549600850903 ETH, ~27 USD
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await weth.balanceOf(user0.address)).eq("9992997500549299248"); // 9.9929975 ETH
    expect(await usdc.balanceOf(user0.address)).eq(0); // 500

    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "5498550650650652"
    ); // 0.005498550650650652, 27.5 USD
    expect(await reader.getPoolAmount(dataStore.address, ethUsdMarket.marketToken, usdc.address)).eq(0);

    expect(await reader.getSwapImpactPoolAmount(dataStore.address, ethUsdMarket.marketToken, weth.address)).eq(
      "4998950200251" // 0.000004998950200251, ~0.025 USD
    );
  });
});
