import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import { OrderType, executeOrder, createOrder, getOrderKeys, getOrderCount } from "../../utils/order";
import { getPositionCount } from "../../utils/position";

import { mine } from "@nomicfoundation/hardhat-network-helpers";

describe("Guardian.FrozenOrder", () => {
  let fixture;
  let user1;
  let reader, dataStore, ethUsdMarket, wnt, usdc, exchangeRouter;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user1 } = fixture.accounts);
    ({ reader, dataStore, ethUsdMarket, wnt, usdc, exchangeRouter } = fixture.contracts);
  });

  it("User can unfreeze a frozen limit increase order by calling updateOrder", async () => {
    // User1 creates a limit increase order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(5100, 12),
      triggerPrice: expandDecimals(5000, 12),
      orderType: OrderType.LimitIncrease,
      isLong: true,
    });
    // Limit order go to future block
    await mine(10);

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    // Execute the order to be frozen
    await executeOrder(fixture, {
      tokens: [wnt.address, usdc.address],
      minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
      precisions: [8, 18],
      expectedFrozenReason: "InsufficientReserve",
    });

    expect(await getOrderCount(dataStore)).eq(1);
    const orderPreUpdate = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order has been frozen
    expect(orderPreUpdate.flags.isFrozen).eq(true);

    // User1 update the order to be filled at a different price points this will unfreeze the order
    await exchangeRouter.connect(user1).updateOrder(
      orderKeys[0],
      decimalToFloat(10_000), // sizeDeltaUsd
      expandDecimals(5200, 12), // acceptablePrice
      expandDecimals(5200, 12), // triggerPrice
      expandDecimals(52000, 6) // minOutputAmount
    );

    const orderPostUpdate = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order has been unfrozen
    expect(orderPostUpdate.flags.isFrozen).eq(false);

    // Check that the order is updated
    expect(orderPostUpdate.numbers.sizeDeltaUsd).eq(decimalToFloat(10_000));
    expect(orderPostUpdate.numbers.acceptablePrice).eq(expandDecimals(5200, 12));
    expect(orderPostUpdate.numbers.triggerPrice).eq(expandDecimals(5200, 12));
    expect(orderPostUpdate.numbers.minOutputAmount).eq(expandDecimals(52000, 6));
  });

  it("User can unfreeze a frozen limit decrease order by calling updateOrder", async () => {
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1000 * 5000, 6),
      },
    });
    // User1 creates a position so we can create a limit decrease order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(5000, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
    });
    await executeOrder(fixture, {});

    // Check that we now have a position
    expect(await getPositionCount(dataStore)).eq(1);

    // User1 creates a limit decrease order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(5100, 12),
      triggerPrice: expandDecimals(5000, 12),
      orderType: OrderType.LimitDecrease,
      isLong: true,
    });
    // Limit order go to future block
    await mine(10);

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    // Execute the order to be frozen
    await executeOrder(fixture, {
      account: user1,
      tokens: [wnt.address, usdc.address],
      minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
      precisions: [8, 18],
      expectedFrozenReason: "OrderNotFulfillableAtAcceptablePrice",
    });

    expect(await getOrderCount(dataStore)).eq(1);
    const orderPreUpdate = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order has been frozen
    expect(orderPreUpdate.flags.isFrozen).eq(true);

    // User1 update the order to be filled at a different price points this will unfreeze the order
    await exchangeRouter.connect(user1).updateOrder(
      orderKeys[0],
      decimalToFloat(10_000), // sizeDeltaUsd
      expandDecimals(5200, 12), // acceptablePrice
      expandDecimals(5200, 12), // triggerPrice
      expandDecimals(52000, 6) // minOutputAmount
    );

    const orderPostUpdate = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order has been unfrozen
    expect(orderPostUpdate.flags.isFrozen).eq(false);

    // Check that the order is updated
    expect(orderPostUpdate.numbers.sizeDeltaUsd).eq(decimalToFloat(10_000));
    expect(orderPostUpdate.numbers.acceptablePrice).eq(expandDecimals(5200, 12));
    expect(orderPostUpdate.numbers.triggerPrice).eq(expandDecimals(5200, 12));
    expect(orderPostUpdate.numbers.minOutputAmount).eq(expandDecimals(52000, 6));
  });

  it("User can unfreeze a frozen stop loss decrease order by calling updateOrder", async () => {
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1000 * 5000, 6),
      },
    });
    // User1 creates a position so we can create a limit decrease order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(5000, 12),
      orderType: OrderType.MarketIncrease,
      isLong: true,
    });
    await executeOrder(fixture, {});

    // Check that we now have a position
    expect(await getPositionCount(dataStore)).eq(1);

    // User1 creates a stop loss decrease order
    await createOrder(fixture, {
      account: user1,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(1, 18),
      sizeDeltaUsd: decimalToFloat(10_000),
      acceptablePrice: expandDecimals(5100, 12),
      triggerPrice: expandDecimals(5000, 12),
      orderType: OrderType.StopLossDecrease,
      isLong: true,
    });
    // Limit order go to future block
    await mine(10);

    const orderKeys = await getOrderKeys(dataStore, 0, 1);

    // Execute the order to be frozen
    await executeOrder(fixture, {
      tokens: [wnt.address, usdc.address],
      minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
      precisions: [8, 18],
      expectedFrozenReason: "OrderNotFulfillableAtAcceptablePrice",
    });

    expect(await getOrderCount(dataStore)).eq(1);
    const orderPreUpdate = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order has been frozen
    expect(orderPreUpdate.flags.isFrozen).eq(true);

    // User1 update the order to be filled at a different price points this will unfreeze the order
    await exchangeRouter.connect(user1).updateOrder(
      orderKeys[0],
      decimalToFloat(10_000), // sizeDeltaUsd
      expandDecimals(5200, 12), // acceptablePrice
      expandDecimals(5200, 12), // triggerPrice
      expandDecimals(52000, 6) // minOutputAmount
    );

    const orderPostUpdate = await reader.getOrder(dataStore.address, orderKeys[0]);

    // Check that the order has been unfrozen
    expect(orderPostUpdate.flags.isFrozen).eq(false);

    // Check that the order is updated
    expect(orderPostUpdate.numbers.sizeDeltaUsd).eq(decimalToFloat(10_000));
    expect(orderPostUpdate.numbers.acceptablePrice).eq(expandDecimals(5200, 12));
    expect(orderPostUpdate.numbers.triggerPrice).eq(expandDecimals(5200, 12));
    expect(orderPostUpdate.numbers.minOutputAmount).eq(expandDecimals(52000, 6));
  });
});
