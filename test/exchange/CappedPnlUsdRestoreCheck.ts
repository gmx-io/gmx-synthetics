import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, DecreasePositionSwapType, handleOrder } from "../../utils/order";
import { getPoolAmount } from "../../utils/market";
import { getExecuteParams } from "../../utils/exchange";
import { prices } from "../../utils/prices";
import { getEventData } from "../../utils/event";
import { encodeData } from "../../utils/hash";
import * as keys from "../../utils/keys";

// Check for: the cumulative trader pnl cap restores previously paid pnl at its
// historical USD value, while the tokens that were actually removed from the
// pool are revalued at the current min price. When the payout token falls
// between partial decreases the backing is overstated and the cap pays extra.
//
// Market: SOL index, WETH long token, USDC short token. Long pnl is paid in WETH,
// so SOL can stay at the same price while WETH falls.
describe("capped pnl history restored in USD instead of tokens", () => {
  let fixture;
  let user0, user2;
  let config, dataStore, solUsdMarket, wnt, usdc;

  const setMaxPnlFactor = (pnlFactorType, value) =>
    config.setUint(
      keys.MAX_PNL_FACTOR,
      encodeData(["bytes32", "address", "bool"], [pnlFactorType, solUsdMarket.marketToken, true]),
      value
    );

  const wntPrice = (usd) => ({
    contractName: "wnt",
    precision: 8,
    min: expandDecimals(usd, 4),
    max: expandDecimals(usd, 4),
  });

  const solPrice = (usd) => ({
    contractName: "sol",
    precision: 16,
    min: expandDecimals(usd, 5),
    max: expandDecimals(usd, 5),
  });

  const executeAt = (solUsd, wntUsd) =>
    getExecuteParams(fixture, { prices: [solPrice(solUsd), wntPrice(wntUsd), prices.usdc] });

  const decrease = async (sizeDeltaUsd, solUsd, wntUsd, decreasePositionSwapType = DecreasePositionSwapType.NoSwap) => {
    let event;
    await handleOrder(fixture, {
      create: {
        account: user0,
        receiver: user2,
        market: solUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: 0,
        sizeDeltaUsd,
        acceptablePrice: expandDecimals(99, 21),
        orderType: OrderType.MarketDecrease,
        decreasePositionSwapType,
        isLong: true,
      },
      execute: {
        ...executeAt(solUsd, wntUsd),
        afterExecution: ({ logs }) => {
          event = getEventData(logs, "PositionDecrease");
        },
      },
    });
    return event;
  };

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user2 } = fixture.accounts);
    ({ config, dataStore, solUsdMarket, wnt, usdc } = fixture.contracts);

    // keep the payout exact: no price impact on the SOL market
    await dataStore.setUint(keys.positionImpactFactorKey(solUsdMarket.marketToken, true), 0);
    await dataStore.setUint(keys.positionImpactFactorKey(solUsdMarket.marketToken, false), 0);
    await dataStore.setUint(keys.reserveFactorKey(solUsdMarket.marketToken, true), decimalToFloat(1, 0));
    await dataStore.setUint(keys.openInterestReserveFactorKey(solUsdMarket.marketToken, true), decimalToFloat(1, 0));

    // 400 WETH at $5,000 = $2,000,000 backing the long side
    await handleDeposit(fixture, {
      create: {
        market: solUsdMarket,
        longTokenAmount: expandDecimals(400, 18),
        shortTokenAmount: expandDecimals(2_000_000, 6),
      },
      execute: executeAt(50, 5_000),
    });

    // user0: $1,000,000 long SOL at $50 with USDC collateral
    // at SOL $100 the position has +$1,000,000 of uncapped pnl payable from the WETH pool
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: solUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(200_000, 6),
        sizeDeltaUsd: decimalToFloat(1_000_000),
        acceptablePrice: expandDecimals(51, 21),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: executeAt(50, 5_000),
    });

    // trader cap 25% of the WETH pool; the operational caps must not exceed it
    await setMaxPnlFactor(keys.MAX_PNL_FACTOR_FOR_DEPOSITS, decimalToFloat(25, 2));
    await setMaxPnlFactor(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, decimalToFloat(20, 2));
    await setMaxPnlFactor(keys.MAX_PNL_FACTOR_FOR_TRADERS, decimalToFloat(25, 2));

    expect(await getPoolAmount(dataStore, solUsdMarket.marketToken, wnt.address)).eq(expandDecimals(400, 18));
  });

  it("reference: one-shot close at WETH $4,000 pays 25% of $1,600,000", async () => {
    const event = await decrease(decimalToFloat(1_000_000), 100, 4_000);
    expect(event.uncappedBasePnlUsd).eq(decimalToFloat(1_000_000));
    expect(event.basePnlUsd).eq(decimalToFloat(400_000));
    // 400,000 / 4,000 = 100 WETH
    expect(await wnt.balanceOf(user2.address)).eq(expandDecimals(100, 18));
  });

  it("control: partitioned close at a constant WETH price matches the one-shot close", async () => {
    const first = await decrease(decimalToFloat(500_000), 100, 5_000);
    expect(first.basePnlUsd).eq(decimalToFloat(250_000));
    expect(await wnt.balanceOf(user2.address)).eq(expandDecimals(50, 18));

    const second = await decrease(decimalToFloat(500_000), 100, 5_000);
    expect(second.basePnlUsd).eq(decimalToFloat(250_000));
    // 500,000 total = 25% of 400 WETH at $5,000
    expect(await wnt.balanceOf(user2.address)).eq(expandDecimals(100, 18));
  });

  it("fixed: after WETH falls the second decrease is paid against token-based backing", async () => {
    // first half at WETH $5,000: capped to $250,000, 50 WETH leave the pool
    const first = await decrease(decimalToFloat(500_000), 100, 5_000);
    expect(first.uncappedBasePnlUsd).eq(decimalToFloat(500_000));
    expect(first.basePnlUsd).eq(decimalToFloat(250_000));
    expect(await wnt.balanceOf(user2.address)).eq(expandDecimals(50, 18));
    expect(await getPoolAmount(dataStore, solUsdMarket.marketToken, wnt.address)).eq(expandDecimals(350, 18));

    // WETH falls to $4,000, SOL unchanged at $100
    // backing: (350 + 50) WETH * $4,000 = $1,600,000, cap $400,000, second half pays $150,000
    // before the fix: 350 WETH * $4,000 + $250,000 = $1,650,000, cap $412,500, paid $162,500
    const second = await decrease(decimalToFloat(500_000), 100, 4_000);
    expect(second.uncappedBasePnlUsd).eq(decimalToFloat(500_000));
    expect(second.basePnlUsd).eq(decimalToFloat(150_000));
    // 50 + 37.5 WETH
    expect(await wnt.balanceOf(user2.address)).eq(expandDecimals(87_500, 15));
  });

  it("fixed: a successful profit swap does not restore tokens already returned to the pool", async () => {
    // let the payout swap through the withdrawal check so the swap-back path is exercised
    await dataStore.setUint(
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, solUsdMarket.marketToken, true),
      decimalToFloat(1)
    );
    await dataStore.setUint(keys.swapImpactFactorKey(solUsdMarket.marketToken, true), 0);
    await dataStore.setUint(keys.swapImpactFactorKey(solUsdMarket.marketToken, false), 0);
    await dataStore.setUint(keys.swapFeeFactorKey(solUsdMarket.marketToken, true), 0);
    await dataStore.setUint(keys.swapFeeFactorKey(solUsdMarket.marketToken, false), 0);

    // first half at WETH $5,000 with SwapPnlTokenToCollateralToken: $250,000 capped,
    // 50 WETH leave the pool as pnl and come straight back through the swap
    const first = await decrease(
      decimalToFloat(500_000),
      100,
      5_000,
      DecreasePositionSwapType.SwapPnlTokenToCollateralToken
    );
    expect(first.basePnlUsd).eq(decimalToFloat(250_000));
    expect(await wnt.balanceOf(user2.address)).eq(0);
    expect(await getPoolAmount(dataStore, solUsdMarket.marketToken, wnt.address)).eq(expandDecimals(400, 18));

    // same prices: backing is 400 WETH * $5,000 = $2,000,000, cap $500,000.
    // The 50 WETH already returned through the swap must not be restored again.
    const second = await decrease(decimalToFloat(500_000), 100, 5_000);
    expect(second.basePnlUsd).eq(decimalToFloat(250_000));
    expect(first.basePnlUsd.add(second.basePnlUsd)).eq(decimalToFloat(500_000));
  });
});
