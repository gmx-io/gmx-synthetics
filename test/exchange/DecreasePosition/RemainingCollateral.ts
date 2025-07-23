import { scenes } from "../../scenes";
import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { handleOrder, OrderType } from "../../../utils/order";
import * as keys from "../../../utils/keys";

describe("Exchange.DecreasePosition", () => {
  let fixture;
  let user1;
  let dataStore, ethUsdMarket, wnt, usdc;
  let increaseParams, decreaseParams;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user1 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, wnt, usdc } = fixture.contracts);

    await scenes.deposit(fixture);
  });

  beforeEach(async () => {
    increaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: expandDecimals(50 * 1000, 6), // 50,000 USDC
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000), // 4x leverage -- position size is 40 ETH @ $5,000/ETH
      acceptablePrice: expandDecimals(5001, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    decreaseParams = {
      account: user1,
      market: ethUsdMarket,
      minOutputAmount: 0,
      initialCollateralToken: usdc,
      initialCollateralDeltaAmount: expandDecimals(25 * 1000, 6), // Decreases half collateral
      swapPath: [],
      sizeDeltaUsd: 0, // Doesn't decrease any size
      acceptablePrice: expandDecimals(4999, 12),
      orderType: OrderType.MarketDecrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: increaseParams,
      execute: {}, // order executed at $5,000/ETH
    });
  });

  it("should prevent collateral withdrawal if remaining collateral < MIN_COLLATERAL_USD", async () => {
    // 1. set the min collateral to 30,000 USD
    await dataStore.setUint(keys.MIN_COLLATERAL_USD, expandDecimals(30_000, 30));

    // decreasing collateral to 25,000 USD will be cancelled (remaining collateral < MIN_COLLATERAL_USD)
    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        expectedCancellationReason: "UnableToWithdrawCollateral",
      }, // order executed at $5,000/ETH
    });

    // 2. set the min collateral to 20,000 USD
    await dataStore.setUint(keys.MIN_COLLATERAL_USD, expandDecimals(20_000, 30));

    // decreasing collateral to 25,000 USD will be executed (remaining collateral > MIN_COLLATERAL_USD)
    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {}, // order executed at $5,000/ETH
    });
  });

  it("should prevent collateral withdrawal if remaining collateral + negative PnL < MIN_COLLATERAL_USD", async () => {
    // 1. set the min collateral to 20,000 USD
    await dataStore.setUint(keys.MIN_COLLATERAL_USD, expandDecimals(20_000, 30));

    // decreasing collateral to 25,000 USD will be cancelled (collateral + negative PnL < MIN_COLLATERAL_USD)
    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)], // ETH goes down 20% --> remaining collateral + negative PnL is 15,000 USD
        maxPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
        expectedCancellationReason: "UnableToWithdrawCollateral",
      }, // order executed at $4,000/ETH
    });

    // 2. decreasing collateral to 25,000 USD will be executed (remaining collateral > MIN_COLLATERAL_USD)
    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {}, // order executed at $5,000/ETH
    });
  });

  it("should prevent collateral withdrawal if remaining collateral + positive PnL < MIN_COLLATERAL_USD", async () => {
    // 1. set the min collateral to 30,000 USD
    await dataStore.setUint(keys.MIN_COLLATERAL_USD, expandDecimals(30_000, 30));

    // decreasing collateral to 25,000 USD will be cancelled (remaining collateral < MIN_COLLATERAL_USD)
    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        expectedCancellationReason: "UnableToWithdrawCollateral",
      }, // order executed at $5,000/ETH
    });

    // 2. decreasing collateral to 25,000 USD will be executed (remaining collateral + positive PnL > MIN_COLLATERAL_USD)
    await handleOrder(fixture, {
      create: decreaseParams,
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(6000, 4), expandDecimals(1, 6)], // remaining collateral + positive PnL is 35,000 USD
        maxPrices: [expandDecimals(6000, 4), expandDecimals(1, 6)],
        precisions: [8, 18],
      }, // order executed at $6,000/ETH
    });
  });
});
