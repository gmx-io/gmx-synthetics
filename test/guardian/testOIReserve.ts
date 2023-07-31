import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { grantRole } from "../../utils/role";
import * as keys from "../../utils/keys";
import { encodeData } from "../../utils/hash";

describe("Guardian.OIReserve", () => {
  let fixture;
  let wallet, user0;
  let roleStore, dataStore, ethUsdMarket, solUsdMarket, wnt, usdc, config;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0 } = fixture.accounts);
    ({ roleStore, dataStore, ethUsdMarket, solUsdMarket, wnt, usdc, config } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(5_000_000, 6),
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: solUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
      execute: {
        tokens: [solUsdMarket.indexToken, wnt.address, usdc.address],
        precisions: [8, 8, 18],
        minPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });
  });

  it("test OI Reserve", async () => {
    await grantRole(roleStore, wallet.address, "CONFIG_KEEPER");

    // Set OI Reserve through config
    await config
      .connect(wallet)
      .setUint(
        keys.OPEN_INTEREST_RESERVE_FACTOR,
        encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]),
        decimalToFloat(5, 1)
      ); // 50%
    await config
      .connect(wallet)
      .setUint(
        keys.OPEN_INTEREST_RESERVE_FACTOR,
        encodeData(["address", "bool"], [ethUsdMarket.marketToken, false]),
        decimalToFloat(5, 1)
      ); // 50%

    const oiReserveKey = keys.openInterestReserveFactorKey(ethUsdMarket.marketToken, true);

    // Read OI Reserve
    const oiReserveFactor = await dataStore.getUint(oiReserveKey);

    await expect(oiReserveFactor).to.eq(expandDecimals(5, 29));

    // Read normal reserve
    const normalReserveFactorKey = keys.reserveFactorKey(ethUsdMarket.marketToken, true);

    const normalReserveFactor = await dataStore.getUint(normalReserveFactorKey);

    await expect(normalReserveFactor).to.eq(expandDecimals(5, 29));

    // Open position fails due to normal reserve
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(1_000_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(2_500_001), // 1 USDC too much
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        expectedCancellationReason: "InsufficientReserve",
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(1_000_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(2_500_001), // 1 USDC too much
        acceptablePrice: expandDecimals(5001, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        expectedCancellationReason: "InsufficientReserve",
      },
    });

    // Raise normal reserve value through config
    await config
      .connect(wallet)
      .setUint(
        keys.RESERVE_FACTOR,
        encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]),
        decimalToFloat(6, 1)
      ); // 60%
    await config
      .connect(wallet)
      .setUint(
        keys.RESERVE_FACTOR,
        encodeData(["address", "bool"], [ethUsdMarket.marketToken, false]),
        decimalToFloat(6, 1)
      ); // 60%
    expect(await dataStore.getUint(normalReserveFactorKey)).to.eq(expandDecimals(6, 29));

    // now fails due to oi reserve
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(1_000_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(2_500_001), // 1 USDC too much
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        expectedCancellationReason: "InsufficientReserveForOpenInterest",
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(1_000_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(2_500_001), // 1 USDC too much
        acceptablePrice: expandDecimals(5001, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        expectedCancellationReason: "InsufficientReserveForOpenInterest",
      },
    });

    // Raise oi reserve value through config
    await config
      .connect(wallet)
      .setUint(
        keys.OPEN_INTEREST_RESERVE_FACTOR,
        encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]),
        decimalToFloat(51, 2)
      ); // 51%
    await config
      .connect(wallet)
      .setUint(
        keys.OPEN_INTEREST_RESERVE_FACTOR,
        encodeData(["address", "bool"], [ethUsdMarket.marketToken, false]),
        decimalToFloat(51, 2)
      ); // 51%

    // Open position now passes
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(1_000_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(2_500_001), // 1 USDC too much
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(1_000_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(2_500_001), // 1 USDC too much
        acceptablePrice: expandDecimals(5001, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    // Cannot open above the new cap of 51% * 5_000_000 = 2,550,000
    // E.g. can open $49,999 more size

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(1_000_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(49_999), // 1 USDC too much
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(1_000_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(49_999), // 1 USDC too much
        acceptablePrice: expandDecimals(5001, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(1_000_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(1), // 1 USDC too much
        acceptablePrice: expandDecimals(4950, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: false,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        expectedCancellationReason: "InsufficientReserveForOpenInterest",
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: usdc,
        initialCollateralDeltaAmount: expandDecimals(1_000_000, 6),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(1), // 1 USDC too much
        acceptablePrice: expandDecimals(5001, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        expectedCancellationReason: "InsufficientReserveForOpenInterest",
      },
    });
  });
});
