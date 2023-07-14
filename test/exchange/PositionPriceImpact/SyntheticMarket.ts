import { expect } from "chai";

import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { handleDeposit } from "../../../utils/deposit";
import { OrderType, getOrderCount, handleOrder } from "../../../utils/order";
import { getExecuteParams } from "../../../utils/exchange";
import { getEventData } from "../../../utils/event";
import { prices } from "../../../utils/prices";
import * as keys from "../../../utils/keys";

describe("Exchange.PositionPriceImpact", () => {
  let fixture;
  let user0;
  let dataStore, solUsdMarket, wnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ dataStore, solUsdMarket, wnt } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: solUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(2000 * 1000, 6),
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [prices.sol, prices.wnt, prices.usdc] }),
      },
    });
  });

  it("price impact", async () => {
    await dataStore.setUint(keys.positionImpactFactorKey(solUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.positionImpactFactorKey(solUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.positionImpactExponentFactorKey(solUsdMarket.marketToken), decimalToFloat(2, 0));

    expect(await getOrderCount(dataStore)).eq(0);

    const params = {
      account: user0,
      market: solUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(60, 21),
      orderType: OrderType.MarketIncrease,
      isLong: true,
    };

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(solUsdMarket.marketToken))).eq(0);

    // increase long position, negative price impact
    await handleOrder(fixture, {
      create: params,
      execute: {
        ...getExecuteParams(fixture, { prices: [prices.sol, prices.wnt, prices.usdc] }),
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("50100200400801603206412"); // 50.1002004008
          expect(positionIncreaseEvent.priceImpactUsd).eq("-399999999999999992588018713340000"); // -400
        },
      },
    });

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(solUsdMarket.marketToken))).eq("8000000000"); // 8 SOL, 400 USD

    // decrease long position, positive price impact
    await handleOrder(fixture, {
      create: {
        ...params,
        orderType: OrderType.MarketDecrease,
        acceptablePrice: expandDecimals(45, 21),
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [prices.sol, prices.wnt, prices.usdc] }),
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionDecreaseEvent = getEventData(logs, "PositionDecrease");
          expect(positionDecreaseEvent.executionPrice).eq("50050100200400801602278"); // 50.05
          expect(positionDecreaseEvent.priceImpactUsd).eq("199999999999999996294009356670000"); // 200
        },
      },
    });

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(solUsdMarket.marketToken))).eq("4000000000"); // 4 SOL, 200 USD
  });
});
