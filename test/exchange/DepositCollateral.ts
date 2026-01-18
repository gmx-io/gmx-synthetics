import { expect } from "chai";

import { usingResult } from "../../utils/use";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { getPositionKeys } from "../../utils/position";
import { getExecuteParams } from "../../utils/exchange";
import { getEventData } from "../../utils/event";
import { prices } from "../../utils/prices";
import * as keys from "../../utils/keys";

describe("Exchange.DepositCollateral", () => {
  let fixture;
  let user0, user1;
  let reader, dataStore, referralStorage, ethUsdMarket, wnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ reader, dataStore, referralStorage, ethUsdMarket, wnt } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1000 * 1000, 6),
      },
    });
  });

  it("deposits collateral", async () => {
    const params = {
      account: user0,
      market: ethUsdMarket,
      initialCollateralToken: wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(0),
      acceptablePrice: expandDecimals(5001, 12),
      executionFee: expandDecimals(1, 15),
      minOutputAmount: expandDecimals(50000, 6),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    };

    await handleOrder(fixture, {
      create: { ...params, sizeDeltaUsd: decimalToFloat(0) },
      execute: {
        ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.withSpread] }),
        gasUsageLabel: "executeOrder",
        expectedCancellationReason: "InvalidPositionSizeValues",
      },
    });

    await handleOrder(fixture, {
      create: { ...params, sizeDeltaUsd: decimalToFloat(200_000), acceptablePrice: expandDecimals(5020, 12) },
      execute: {
        ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.withSpread] }),
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq(expandDecimals(5010, 12));
          expect(positionIncreaseEvent.pendingPriceImpactUsd).eq("0");
        },
      },
    });

    const positionKeys = await getPositionKeys(dataStore, 0, 10);
    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKeys[0],
        prices.ethUsdMarket,
        0, // sizeDeltaUsd
        ethers.constants.AddressZero,
        true // usePositionSizeAsSizeDeltaUsd
      ),
      (positionInfo) => {
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(200_000));
        expect(positionInfo.position.numbers.collateralAmount).eq(expandDecimals(10, 18));
      }
    );

    await handleOrder(fixture, {
      create: { ...params, sizeDeltaUsd: decimalToFloat(0) },
      execute: {
        ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.withSpread] }),
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq(expandDecimals(5010, 12));
          expect(positionIncreaseEvent.pendingPriceImpactUsd).eq("0");
        },
      },
    });

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKeys[0],
        prices.ethUsdMarket,
        0, // sizeDeltaUsd
        ethers.constants.AddressZero,
        true // usePositionSizeAsSizeDeltaUsd
      ),
      (positionInfo) => {
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(200_000));
        expect(positionInfo.position.numbers.collateralAmount).eq(expandDecimals(20, 18));
      }
    );
  });

  it("cancels collateral deposit if fees exceed collateral with pending pnl", async () => {
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(1, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(5020, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.withSpread] }),
        gasUsageLabel: "executeOrder",
      },
    });

    await handleOrder(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(5020, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.withSpread] }),
        gasUsageLabel: "executeOrder",
      },
    });

    const positionKeys = await getPositionKeys(dataStore, 0, 10);

    const increasedEthUsdMarketPrices = {
      ...prices.ethUsdMarket,
      indexTokenPrice: {
        min: expandDecimals(7500, 12),
        max: expandDecimals(7500, 12),
      },
      longTokenPrice: {
        min: expandDecimals(7500, 12),
        max: expandDecimals(7500, 12),
      },
    };

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKeys[0],
        increasedEthUsdMarketPrices,
        0, // sizeDeltaUsd
        ethers.constants.AddressZero,
        true // usePositionSizeAsSizeDeltaUsd
      ),
      (positionInfo) => {
        expect(positionInfo.basePnlUsd).gt(0);
      }
    );

    await dataStore.setUint(keys.cumulativeBorrowingFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 2));

    const { timestamp } = await ethers.provider.getBlock();
    await dataStore.setUint(keys.cumulativeBorrowingFactorUpdatedAtKey(ethUsdMarket.marketToken, true), timestamp);

    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(1, 17), // 0.1 WNT
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(0),
        acceptablePrice: expandDecimals(8000, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: 0,
        orderType: OrderType.MarketIncrease,
        isLong: true,
        shouldUnwrapNativeToken: false,
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.increased.byFiftyPercent] }),
        gasUsageLabel: "executeOrder",
        expectedCancellationReason: "InsufficientCollateralAmount",
      },
    });
  });
});
