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
import { scenes } from "../scenes";
import * as keys from "../../utils/keys";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Exchange.DepositCollateral", () => {
  let fixture;
  let user0;
  let reader, dataStore, referralStorage, ethUsdMarket, wnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
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

  // eslint-disable-next-line no-undef
  xit("deposits collateral with pending PnL and fees", async () => {
    // Test precondition:
    // Provide enough collateral to support fees
    await dataStore.setUint(
      keys.collateralSumKey(ethUsdMarket.marketToken, ethUsdMarket.shortToken, true),
      expandDecimals(100_000, 6)
    );

    // Open long position with 50 USD collateral
    await scenes.increasePosition.long(fixture, {
      create: {
        sizeDeltaUsd: decimalToFloat(200),
        initialCollateralDeltaAmount: expandDecimals(50, 6),
      },
    });

    const positionKeys = await getPositionKeys(dataStore, 0, 10);
    await dataStore.setUint(keys.borrowingFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(10, 7));
    await dataStore.setUint(keys.borrowingExponentFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(3));
    await time.increase(14 * 24 * 60 * 60);
    // Generate about 190 USD borrowing fees

    const prices_x2 = {
      indexTokenPrice: {
        min: expandDecimals(10_000, 12),
        max: expandDecimals(10_000, 12),
      },
      longTokenPrice: {
        min: expandDecimals(10_000, 12),
        max: expandDecimals(10_000, 12),
      },
      shortTokenPrice: {
        min: expandDecimals(1, 24),
        max: expandDecimals(1, 24),
      },
    };

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKeys[0],
        prices_x2,
        0, // sizeDeltaUsd
        ethers.constants.AddressZero,
        true // usePositionSizeAsSizeDeltaUsd
      ),
      (positionInfo) => {
        expect(positionInfo.position.numbers.collateralAmount).eq(expandDecimals(50, 6));
        expect(positionInfo.basePnlUsd).eq(expandDecimals(200, 30));

        // 50 USD collateral + 200 PnL USD - 190 USD fees is positive value
      }
    );

    // Reverted here due to InsufficientCollateralAmount
    // fees resulting to the -93 USD collateral delta.
    // while having positive PnL trader cannot deposit collateral due to the high fees generated
    await scenes.increasePosition.long(fixture, {
      create: {
        initialCollateralDeltaAmount: expandDecimals(100, 6),
        sizeDeltaUsd: decimalToFloat(0),
      },
      execute: {
        prices: prices_x2,
      },
    });

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKeys[0],
        prices_x2,
        0, // sizeDeltaUsd
        ethers.constants.AddressZero,
        true // usePositionSizeAsSizeDeltaUsd
      ),
      (positionInfo) => {
        expect(positionInfo.position.numbers.collateralAmount).eq(expandDecimals(150, 6));
        expect(positionInfo.basePnlUsd).eq(expandDecimals(200, 30));
      }
    );
  });
});
