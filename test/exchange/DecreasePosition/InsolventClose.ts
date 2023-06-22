import { expect } from "chai";

import { usingResult } from "../../../utils/use";
import { scenes } from "../../scenes";
import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { getPositionKey } from "../../../utils/position";
import { getPoolAmount, getMarketTokenPriceWithPoolValue } from "../../../utils/market";
import { prices } from "../../../utils/prices";
import { executeLiquidation } from "../../../utils/liquidation";
import { getClaimableCollateralTimeKey } from "../../../utils/collateral";
import { increaseTime } from "../../../utils/time";
import * as keys from "../../../utils/keys";

describe("Exchange.DecreasePosition.InsolventClose", () => {
  let fixture;
  let user0, user1, user2;
  let reader, dataStore, referralStorage, ethUsdMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2 } = fixture.accounts);
    ({ reader, dataStore, referralStorage, ethUsdMarket, wnt, usdc } = fixture.contracts);

    await scenes.deposit(fixture);
  });

  it("funding fees > collateral", async () => {
    await dataStore.setUint(keys.fundingFactorKey(ethUsdMarket.marketToken), decimalToFloat(1, 10));
    await dataStore.setUint(keys.fundingExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(6_000_000));
      }
    );

    await scenes.increasePosition.long(fixture);
    await scenes.increasePosition.short(fixture, {
      create: {
        sizeDeltaUsd: decimalToFloat(20_000),
      },
    });

    const refTime = (await ethers.provider.getBlock()).timestamp;

    const positionKey0 = getPositionKey(user0.address, ethUsdMarket.marketToken, usdc.address, true);
    const positionKey1 = getPositionKey(user0.address, ethUsdMarket.marketToken, wnt.address, false);

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKey0,
        prices.ethUsdMarket,
        0,
        ethers.constants.AddressZero,
        true
      ),
      (positionInfo) => {
        expect(positionInfo.position.numbers.collateralAmount).eq(expandDecimals(50_000, 6));
        expect(positionInfo.position.numbers.sizeInTokens).eq(expandDecimals(40, 18));
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(200_000));
        expect(positionInfo.basePnlUsd).eq(0);
        expect(positionInfo.fees.funding.fundingFeeAmount).eq(0);
        expect(positionInfo.fees.funding.claimableLongTokenAmount).eq(0);
        expect(positionInfo.fees.funding.claimableShortTokenAmount).eq(0);
      }
    );

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(6_000_000));
      }
    );

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq(0);

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(1000, 18));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(1_000_000, 6));

    await increaseTime(refTime, 10 * 60 * 60);

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKey0,
        prices.ethUsdMarket,
        0,
        ethers.constants.AddressZero,
        true
      ),
      (positionInfo) => {
        expect(positionInfo.position.numbers.collateralAmount).eq(expandDecimals(50_000, 6));
        expect(positionInfo.position.numbers.sizeInTokens).eq(expandDecimals(40, 18));
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(200_000));
        expect(positionInfo.basePnlUsd).eq(0);
        expect(positionInfo.fees.funding.fundingFeeAmount).closeTo("106036363636", "10"); // 106,036.363636
        expect(positionInfo.fees.funding.claimableLongTokenAmount).eq(0);
        expect(positionInfo.fees.funding.claimableShortTokenAmount).eq(0);
      }
    );

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKey1,
        prices.ethUsdMarket,
        0,
        ethers.constants.AddressZero,
        true
      ),
      (positionInfo) => {
        expect(positionInfo.position.numbers.collateralAmount).eq(expandDecimals(10, 18));
        expect(positionInfo.position.numbers.sizeInTokens).eq(expandDecimals(4, 18));
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(20_000));
        expect(positionInfo.basePnlUsd).eq(0);
        expect(positionInfo.fees.funding.fundingFeeAmount).eq(0);
        expect(positionInfo.fees.funding.claimableLongTokenAmount).eq(0);
        expect(positionInfo.fees.funding.claimableShortTokenAmount).closeTo("106036363636", "10"); // 106,036.363636
      }
    );

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(6_000_000));
      }
    );

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket.increased }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("1003213333333333333333333333333");
        expect(poolValueInfo.poolValue).eq("6019280000000000000000000000000000000");
      }
    );

    await scenes.decreasePosition.long.positivePnl(fixture, {
      create: {
        receiver: user1,
        initialCollateralDeltaAmount: 0,
      },
      execute: {
        expectedCancellationReason: "EmptyHoldingAddress",
      },
    });

    await dataStore.setAddress(keys.HOLDING_ADDRESS, user2.address);

    await scenes.decreasePosition.long.positivePnl(fixture, {
      create: {
        receiver: user1,
        initialCollateralDeltaAmount: 0,
      },
      execute: {
        expectedCancellationReason: "InsufficientFundsToPayForCosts",
      },
    });

    await executeLiquidation(fixture, {
      account: user0.address,
      market: ethUsdMarket,
      collateralToken: usdc,
      isLong: true,
      minPrices: [prices.wnt.increased.min, expandDecimals(1, 6)],
      maxPrices: [prices.wnt.increased.max, expandDecimals(1, 6)],
    });

    const timeKey = await getClaimableCollateralTimeKey();

    expect(
      await dataStore.getUint(
        keys.claimableCollateralAmountKey(ethUsdMarket.marketToken, wnt.address, timeKey, user2.address)
      )
    ).eq(0);

    expect(
      await dataStore.getUint(
        keys.claimableCollateralAmountKey(ethUsdMarket.marketToken, usdc.address, timeKey, user2.address)
      )
    ).eq(0);

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq(0);

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(1000, 18));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq("999200000001"); // 999,200.000001

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("999866666666833333333333333333");
        expect(poolValueInfo.poolValue).eq("5999200000001000000000000000000000000");
      }
    );

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket.increased }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("1003213333333500000000000000000");
        expect(poolValueInfo.poolValue).eq("6019280000001000000000000000000000000");
      }
    );
  });

  it("funding fees > collateral, unable to swap", async () => {
    await dataStore.setUint(keys.fundingFactorKey(ethUsdMarket.marketToken), decimalToFloat(1, 10));
    await dataStore.setUint(keys.fundingExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(6_000_000));
      }
    );

    // set a small reserve factor for shorts to cause the decrease position swap to fail
    await dataStore.setUint(keys.reserveFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 2));

    await scenes.increasePosition.long(fixture);
    await scenes.increasePosition.short(fixture, {
      create: {
        sizeDeltaUsd: decimalToFloat(20_000),
      },
    });

    let refTime = (await ethers.provider.getBlock()).timestamp;

    const positionKey0 = getPositionKey(user0.address, ethUsdMarket.marketToken, usdc.address, true);
    const positionKey1 = getPositionKey(user0.address, ethUsdMarket.marketToken, wnt.address, false);

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKey0,
        prices.ethUsdMarket,
        0,
        ethers.constants.AddressZero,
        true
      ),
      (positionInfo) => {
        expect(positionInfo.position.numbers.collateralAmount).eq(expandDecimals(50_000, 6));
        expect(positionInfo.position.numbers.sizeInTokens).eq(expandDecimals(40, 18));
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(200_000));
        expect(positionInfo.basePnlUsd).eq(0);
        expect(positionInfo.fees.funding.fundingFeeAmount).eq(0);
        expect(positionInfo.fees.funding.claimableLongTokenAmount).eq(0);
        expect(positionInfo.fees.funding.claimableShortTokenAmount).eq(0);
      }
    );

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(6_000_000));
      }
    );

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq(0);

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(1000, 18));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(1_000_000, 6));

    await increaseTime(refTime, 10 * 60 * 60);
    refTime = (await ethers.provider.getBlock()).timestamp;

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKey0,
        prices.ethUsdMarket.increased,
        0,
        ethers.constants.AddressZero,
        true
      ),
      (positionInfo) => {
        expect(positionInfo.position.numbers.collateralAmount).eq(expandDecimals(50_000, 6));
        expect(positionInfo.position.numbers.sizeInTokens).eq(expandDecimals(40, 18));
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(200_000));
        expect(positionInfo.basePnlUsd).eq(decimalToFloat(800));
        expect(positionInfo.fees.funding.fundingFeeAmount).closeTo("106036363636", "10"); // 106,036.363636
        expect(positionInfo.fees.funding.claimableLongTokenAmount).eq(0);
        expect(positionInfo.fees.funding.claimableShortTokenAmount).eq(0);
      }
    );

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKey1,
        prices.ethUsdMarket,
        0,
        ethers.constants.AddressZero,
        true
      ),
      (positionInfo) => {
        expect(positionInfo.position.numbers.collateralAmount).eq(expandDecimals(10, 18));
        expect(positionInfo.position.numbers.sizeInTokens).eq(expandDecimals(4, 18));
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(20_000));
        expect(positionInfo.basePnlUsd).eq(0);
        expect(positionInfo.fees.funding.fundingFeeAmount).eq(0);
        expect(positionInfo.fees.funding.claimableLongTokenAmount).eq(0);
        expect(positionInfo.fees.funding.claimableShortTokenAmount).closeTo("106036363636", "10"); // 106,036.363636
      }
    );

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(6_000_000));
      }
    );

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket.increased }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("1003213333333333333333333333333");
        expect(poolValueInfo.poolValue).eq("6019280000000000000000000000000000000");
      }
    );

    await scenes.decreasePosition.long.positivePnl(fixture, {
      create: {
        receiver: user1,
        initialCollateralDeltaAmount: 0,
      },
      execute: {
        expectedCancellationReason: "EmptyHoldingAddress",
      },
    });

    await dataStore.setAddress(keys.HOLDING_ADDRESS, user2.address);

    await scenes.decreasePosition.long.positivePnl(fixture, {
      create: {
        receiver: user1,
        initialCollateralDeltaAmount: 0,
      },
      execute: {
        expectedCancellationReason: "InsufficientFundsToPayForCosts",
      },
    });

    await increaseTime(refTime, 60 * 60);

    await executeLiquidation(fixture, {
      account: user0.address,
      market: ethUsdMarket,
      collateralToken: usdc,
      isLong: true,
      minPrices: [prices.wnt.increased.min, expandDecimals(1, 6)],
      maxPrices: [prices.wnt.increased.max, expandDecimals(1, 6)],
    });

    const timeKey = await getClaimableCollateralTimeKey();

    expect(
      await dataStore.getUint(
        keys.claimableCollateralAmountKey(ethUsdMarket.marketToken, wnt.address, timeKey, user2.address)
      )
    ).eq("159362549800796812"); // 0.159362549800796812 ETH, 800 USD

    expect(
      await dataStore.getUint(
        keys.claimableCollateralAmountKey(ethUsdMarket.marketToken, usdc.address, timeKey, user2.address)
      )
    ).eq(0);

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq(0);

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq("999840637450199203188"); // 999.840637450199203188 ETH
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(1_000_000, 6));

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("999867197875166002656666666666");
        expect(poolValueInfo.poolValue).eq("5999203187250996015940000000000000000");
      }
    );

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket.increased }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("1003213333333333333333960000000");
        expect(poolValueInfo.poolValue).eq("6019280000000000000003760000000000000");
      }
    );
  });
});
