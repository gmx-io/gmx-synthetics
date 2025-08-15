import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { getPositionKeys } from "../../utils/position";
import * as keys from "../../utils/keys";

describe("Reader.PendingImpactAmount", () => {
  let fixture;
  let user0;
  let reader, dataStore, referralStorage;
  let ethUsdMarket, wnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ reader, dataStore, referralStorage, ethUsdMarket, wnt } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1000 * 5000, 6),
      },
    });
  });

  it("should update the pendingImpactAmount", async () => {
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    const params = {
      account: user0,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(5050, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    // increase long position, negative price impact
    await handleOrder(fixture, {
      create: params,
      execute: {},
    });

    const positionKeys = await getPositionKeys(dataStore, 0, 10);

    const prices = {
      indexTokenPrice: {
        min: expandDecimals(5000, 12),
        max: expandDecimals(5000, 12),
      },
      longTokenPrice: {
        min: expandDecimals(5000, 12),
        max: expandDecimals(5000, 12),
      },
      shortTokenPrice: {
        min: expandDecimals(1, 24),
        max: expandDecimals(1, 24),
      },
    };

    const positionInfo = await reader.getPositionInfo(
      dataStore.address,
      referralStorage.address,
      positionKeys[positionKeys.length - 1],
      prices,
      0, // sizeDeltaUsd
      ethers.constants.AddressZero,
      true // usePositionSizeAsSizeDeltaUsd
    );

    const executionPriceResult = positionInfo.executionPriceResult;

    // These assertions were failing before the fix and pass after the fix
    expect(positionInfo.position.numbers.pendingImpactAmount).lt(0); // negative price impact
    expect(executionPriceResult.proportionalPendingImpactUsd).lt(0); // negative price impact

    // The totalImpactUsd should be the sum of priceImpactUsd and proportionalPendingImpactUsd
    expect(executionPriceResult.totalImpactUsd).to.eq(
      executionPriceResult.priceImpactUsd.add(executionPriceResult.proportionalPendingImpactUsd)
    );
  });
});
