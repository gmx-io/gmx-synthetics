import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { getPoolAmount } from "../../utils/market";
import { getExecuteParams } from "../../utils/exchange";
import { prices } from "../../utils/prices";
import { getEventData } from "../../utils/event";
import { encodeData } from "../../utils/hash";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

// Regression tests for: a capital-neutral swap into the pnl-token side raises the
// MAX_PNL_FACTOR_FOR_TRADERS payout cap while the swap's max pnl validation
// nets third-party losses that settle in the other collateral token and
// judges the growing side against the looser MAX_PNL_FACTOR_FOR_DEPOSITS
//
// the fix validates both sides of a swap against MAX_PNL_FACTOR_FOR_WITHDRAWALS
// using the positive pnl liability (MarketUtils.validateMaxPositivePnl)
describe("capital-neutral swap raises the trader pnl payout cap", () => {
  let fixture;
  let user0, user1, user2, user3;
  let config, reader, dataStore, ethUsdMarket, wnt, usdc, wethPriceFeed;

  const setMaxPnlFactor = (pnlFactorType, value) =>
    config.setUint(
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [pnlFactorType, ethUsdMarket.marketToken, true]),
      value
    );

  const wntPrice = (usd) => ({
    contractName: "wnt",
    precision: 8,
    min: expandDecimals(usd, 4),
    max: expandDecimals(usd, 4),
  });

  const marketPricesAt = (wntUsd) => ({
    indexTokenPrice: { min: expandDecimals(wntUsd, 12), max: expandDecimals(wntUsd, 12) },
    longTokenPrice: { min: expandDecimals(wntUsd, 12), max: expandDecimals(wntUsd, 12) },
    shortTokenPrice: { min: expandDecimals(1, 24), max: expandDecimals(1, 24) },
  });

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({ config, reader, dataStore, ethUsdMarket, wnt, usdc, wethPriceFeed } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(200, 18), // 200 WNT
        shortTokenAmount: expandDecimals(2_000_000, 6),
      },
    });

    // profitable long: user0, WNT collateral, opened at $5,000
    // at $10,000 it has +$300,000 of pnl payable from the WNT pool
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(30, 18),
        sizeDeltaUsd: decimalToFloat(300_000),
        acceptablePrice: expandDecimals(5005, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
    });

    // losing long: user3, USDC collateral, opened at $12,500
    // at $10,000 it has -$80,000 of pnl that settles into the USDC pool
    await wethPriceFeed.setAnswer(expandDecimals(12_500, 8));
    await handleOrder(fixture, {
      create: {
        account: user3,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(100_000, 6),
        sizeDeltaUsd: decimalToFloat(400_000),
        acceptablePrice: expandDecimals(12_600, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: getExecuteParams(fixture, { prices: [wntPrice(12_500), prices.usdc] }),
    });

    await wethPriceFeed.setAnswer(expandDecimals(10_000, 8));

    // Lower both operational caps before lowering the trader cap.
    await setMaxPnlFactor(keys.MAX_PNL_FACTOR_FOR_DEPOSITS, decimalToFloat(10, 2));
    await setMaxPnlFactor(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, decimalToFloat(8, 2));
    await setMaxPnlFactor(keys.MAX_PNL_FACTOR_FOR_TRADERS, decimalToFloat(10, 2));
  });

  it("control: without a swap the profitable close pays only the capped pnl", async () => {
    // positive pnl liability against the WNT pool is $300,000 (15% of $2,000,000),
    // so the trader payout is capped at 10% of the pool: $200,000
    await handleOrder(fixture, {
      create: {
        account: user0,
        receiver: user2,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(300_000),
        acceptablePrice: expandDecimals(9990, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [wntPrice(10_000), prices.usdc] }),
        afterExecution: ({ logs }) => {
          const positionDecreaseEvent = getEventData(logs, "PositionDecrease");
          expect(positionDecreaseEvent.basePnlUsd).eq(decimalToFloat(200_000));
          expect(positionDecreaseEvent.uncappedBasePnlUsd).eq(decimalToFloat(300_000));
        },
      },
    });

    // 30 WNT collateral + 20 WNT of capped pnl
    expect(await wnt.balanceOf(user2.address)).eq(expandDecimals(50, 18));
  });

  it("regression: a WNT -> USDC swap into the capped side is blocked and cannot uncap the payout", async () => {
    // the netted long pnl factor is (300,000 - 80,000) / 2,000,000 = 11%, but the
    // positive pnl liability payable from the WNT pool is 300,000 / 2,000,000 = 15%
    const nettedFactor = await reader.getPnlToPoolFactor(
      dataStore.address,
      ethUsdMarket.marketToken,
      marketPricesAt(10_000),
      true,
      true
    );
    expect(nettedFactor).eq(decimalToFloat(11, 2));

    // a swap that shrinks the long pool is checked against the 8% withdrawal
    // ceiling and is rejected
    await handleOrder(fixture, {
      create: {
        account: user1,
        receiver: user1,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(10_000, 6),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [wntPrice(10_000), prices.usdc] }),
        expectedCancellationReason: "PnlFactorExceededForLongs",
      },
    });

    // growing the long pool would raise the MAX_PNL_FACTOR_FOR_TRADERS payout cap
    // without adding net capital, so the swap-in is now also checked against the
    // withdrawal ceiling, not the looser deposit ceiling, and is rejected
    await handleOrder(fixture, {
      create: {
        account: user1,
        receiver: user1,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(110, 18),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [wntPrice(10_000), prices.usdc] }),
        expectedCancellationReason: "PnlFactorExceededForLongs",
      },
    });

    // the pool is unchanged, so the payout cap is unchanged and the close still
    // pays the capped $200,000
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(200, 18));

    await handleOrder(fixture, {
      create: {
        account: user0,
        receiver: user2,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd: decimalToFloat(300_000),
        acceptablePrice: expandDecimals(9990, 12),
        orderType: OrderType.MarketDecrease,
        isLong: true,
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [wntPrice(10_000), prices.usdc] }),
        afterExecution: ({ logs }) => {
          const positionDecreaseEvent = getEventData(logs, "PositionDecrease");
          expect(positionDecreaseEvent.basePnlUsd).eq(decimalToFloat(200_000));
          expect(positionDecreaseEvent.uncappedBasePnlUsd).eq(decimalToFloat(300_000));
        },
      },
    });

    // 30 WNT collateral + 20 WNT of capped pnl, same as the no-swap control
    expect(await wnt.balanceOf(user2.address)).eq(expandDecimals(50, 18));
  });

  it("regression: cross-bucket losses cannot net down the positive pnl liability in the swap check", async () => {
    // Config cannot loosen the swap gate beyond the capped trader payout threshold.
    await expect(setMaxPnlFactor(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, decimalToFloat(16, 2)))
      .to.be.revertedWithCustomError(errorsContract, "ConfigValueExceedsAllowedRange")
      .withArgs(keys.MAX_PNL_FACTOR, decimalToFloat(16, 2));

    // raise the withdrawal ceiling to 12%: above the netted 11% factor, below the
    // 15% positive liability. the swap is only blocked because the check uses the
    // positive payout-token liability instead of netting the USDC-collateralized loss
    await setMaxPnlFactor(keys.MAX_PNL_FACTOR_FOR_TRADERS, decimalToFloat(12, 2));
    await setMaxPnlFactor(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, decimalToFloat(12, 2));

    await handleOrder(fixture, {
      create: {
        account: user1,
        receiver: user1,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(110, 18),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [wntPrice(10_000), prices.usdc] }),
        expectedCancellationReason: "PnlFactorExceededForLongs",
      },
    });

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(200, 18));

    // At a 16% ceiling, above the 15% positive liability, the swap-in executes.
    // The trader cap must be raised first, so payouts are already uncapped.
    await setMaxPnlFactor(keys.MAX_PNL_FACTOR_FOR_TRADERS, decimalToFloat(16, 2));
    await setMaxPnlFactor(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, decimalToFloat(16, 2));

    await handleOrder(fixture, {
      create: {
        account: user1,
        receiver: user1,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(110, 18),
        acceptablePrice: 0,
        orderType: OrderType.MarketSwap,
        swapPath: [ethUsdMarket.marketToken],
      },
      execute: getExecuteParams(fixture, { prices: [wntPrice(10_000), prices.usdc] }),
    });

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(310, 18));
  });
});
