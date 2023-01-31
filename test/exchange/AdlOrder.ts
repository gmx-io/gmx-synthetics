import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { getIsAdlEnabled, updateAdlState, executeAdl } from "../../utils/adl";
import { grantRole } from "../../utils/role";
import * as keys from "../../utils/keys";

describe("Exchange.AdlOrder", () => {
  let fixture;
  let wallet, user0;
  let roleStore, dataStore, ethUsdMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0 } = fixture.accounts);
    ({ roleStore, dataStore, ethUsdMarket, wnt, usdc } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });
  });

  it("updateAdlState", async () => {
    await handleOrder(fixture, {
      create: {
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(100, 18),
        sizeDeltaUsd: decimalToFloat(2000 * 1000),
        acceptablePrice: expandDecimals(5001, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: {
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    const maxPnlFactorForAdlKey = keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_ADL, ethUsdMarket.marketToken, true);
    const minPnlFactorAfterAdlKey = keys.maxPnlFactorKey(keys.MIN_PNL_FACTOR_AFTER_ADL, ethUsdMarket.marketToken, true);

    await dataStore.setUint(maxPnlFactorForAdlKey, decimalToFloat(10, 2)); // 10%
    await dataStore.setUint(minPnlFactorAfterAdlKey, decimalToFloat(2, 2)); // 2%
    await grantRole(roleStore, wallet.address, "ADL_KEEPER");

    await updateAdlState(fixture, {
      market: ethUsdMarket,
      isLong: true,
      tokens: [wnt.address, usdc.address],
      minPrices: [expandDecimals(10000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(10000, 4), expandDecimals(1, 6)],
      gasUsageLabel: "updateAdlState",
    });

    expect(await getIsAdlEnabled(dataStore, ethUsdMarket.marketToken, true)).eq(true);

    await executeAdl(fixture, {
      account: user0.address,
      market: ethUsdMarket,
      collateralToken: wnt,
      isLong: true,
      sizeDeltaUsd: decimalToFloat(100 * 1000),
      tokens: [wnt.address, usdc.address],
      minPrices: [expandDecimals(10000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(10000, 4), expandDecimals(1, 6)],
      gasUsageLabel: "executeAdl",
    });
  });
});
