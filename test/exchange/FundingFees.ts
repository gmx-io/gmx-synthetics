import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { getPositionCount, getAccountPositionCount } from "../../utils/position";
import { expectTokenBalanceIncrease } from "../../utils/token";
import { expectWithinRange } from "../../utils/validation";
import * as keys from "../../utils/keys";

describe("Exchange.FundingFees", () => {
  const { provider } = ethers;
  let fixture;
  let user0, user1, user2;
  let dataStore, ethUsdMarket, exchangeRouter, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, exchangeRouter, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(500 * 1000, 6),
      },
    });
  });

  it("funding fees", async () => {
    await dataStore.setUint(keys.fundingFactorKey(ethUsdMarket.marketToken), decimalToFloat(1, 10));
    await dataStore.setUint(keys.fundingExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(1));

    expect(await dataStore.getUint(keys.fundingUpdatedAtKey(ethUsdMarket.marketToken))).eq(0);

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(10 * 1000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(100 * 1000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    const block = await provider.getBlock();
    expectWithinRange(
      await dataStore.getUint(keys.cumulativeBorrowingFactorUpdatedAtKey(ethUsdMarket.marketToken, true)),
      block.timestamp,
      100
    );

    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, true))).eq(
      decimalToFloat(200 * 1000)
    );
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, true))).eq(0);
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, false))).eq(0);
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, false))).eq(
      decimalToFloat(100 * 1000)
    );

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    expect(await getAccountPositionCount(dataStore, user1.address)).eq(1);
    expect(await getPositionCount(dataStore)).eq(2);

    await time.increase(14 * 24 * 60 * 60);

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(190 * 1000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(80 * 1000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketDecrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, true))).eq(
      decimalToFloat(10 * 1000)
    );
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, true))).eq(0);
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, false))).eq(0);
    expect(await dataStore.getUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, false))).eq(
      decimalToFloat(20 * 1000)
    );

    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, wnt.address, true))).eq(
      "8064019999999995000000000"
    );
    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, wnt.address, false))).eq(
      "-16128039999999990000000000"
    );
    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, usdc.address, true))).eq(
      "-2400000000000"
    );
    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, usdc.address, false))).eq(
      "240000000000"
    );

    expect(
      await dataStore.getUint(keys.claimableFundingAmountKey(ethUsdMarket.marketToken, wnt.address, user1.address))
    ).eq("1612803999999999");

    await expectTokenBalanceIncrease({
      token: wnt,
      account: user2,
      sendTxn: async () => {
        await exchangeRouter.connect(user1).claimFundingFees([ethUsdMarket.marketToken], [wnt.address], user2.address);
      },
      increaseAmount: "1612803999999999",
    });

    await time.increase(14 * 24 * 60 * 60);

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(1, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(10 * 1000),
        acceptablePrice: expandDecimals(5050, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(1000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(20 * 1000),
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, wnt.address, true))).eq(
      "8064019999999995000000000"
    ); // 0.000000008064019999 ETH, 0.00004032009 USD
    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, wnt.address, false))).eq(
      "-16128039999999990000000000"
    ); // -0.000000016128039999 ETH, -0.00008064019 USD
    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, usdc.address, true))).eq(
      "-80642700000000000"
    ); // -0.00008 USD
    expect(await dataStore.getInt(keys.fundingAmountPerSizeKey(ethUsdMarket.marketToken, usdc.address, false))).eq(
      "40320390000000000" // 0.00004 USD
    );
  });
});
