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

describe("Exchange.WithdrawCollateral", () => {
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

  it("withdraws collateral", async () => {
    await handleOrder(fixture, {
      create: {
        account: user0,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(200_000),
        acceptablePrice: expandDecimals(4080, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: expandDecimals(50000, 6),
        orderType: OrderType.MarketIncrease,
        isLong: false,
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.withSpread] }),
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionIncreaseEvent = getEventData(logs, "PositionIncrease");
          expect(positionIncreaseEvent.executionPrice).eq("4989999999999999");
          expect(positionIncreaseEvent.priceImpactUsd).eq("0");
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
      create: {
        account: user0,
        receiver: user1,
        market: ethUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(3, 18),
        swapPath: [],
        sizeDeltaUsd: decimalToFloat(0),
        acceptablePrice: expandDecimals(5001, 12),
        executionFee: expandDecimals(1, 15),
        minOutputAmount: expandDecimals(50000, 6),
        orderType: OrderType.MarketDecrease,
        isLong: false,
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt.withSpread] }),
        gasUsageLabel: "executeOrder",
        afterExecution: ({ logs }) => {
          const positionDecreaseEvent = getEventData(logs, "PositionDecrease");
          expect(positionDecreaseEvent.executionPrice).eq(expandDecimals(5010, 12));
          expect(positionDecreaseEvent.priceImpactUsd).eq("0");
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
        expect(positionInfo.position.numbers.collateralAmount).eq(expandDecimals(7, 18));
      }
    );
  });
});
