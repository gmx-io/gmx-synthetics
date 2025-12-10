import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { getPositionKeys } from "../../utils/position";
import * as keys from "../../utils/keys";

describe("Reader.PositionValueInUsd", () => {
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

  it("should get positionValueInUsd", async () => {
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(2, 0));
    await dataStore.setUint(
      keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken, false),
      decimalToFloat(2, 0)
    );

    const initialCollateralAmount = expandDecimals(10, 18);

    const params = {
      account: user0,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: initialCollateralAmount,
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
      decimalToFloat(200 * 1000), // sizeDeltaUsd
      ethers.constants.AddressZero,
      true // usePositionSizeAsSizeDeltaUsd
    );

    const price = expandDecimals(5000, 12);
    const expected = initialCollateralAmount
      .mul(price)
      .sub(positionInfo.fees.totalCostAmount.mul(price))
      .add(positionInfo.fees.funding.claimableLongTokenAmount.mul(price))
      .add(positionInfo.fees.funding.claimableShortTokenAmount.mul(expandDecimals(1, 24)))
      .add(positionInfo.executionPriceResult.totalImpactUsd)
      .add(positionInfo.basePnlUsd);

    expect(positionInfo.positionValueInUsd).to.eq(expected);
  });
});
