import { expect } from "chai";

import { usingResult } from "../../../utils/use";
import { scenes } from "../../scenes";
import { deployFixture } from "../../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { getPositionKey } from "../../../utils/position";
import { getPoolAmount, getMarketTokenPriceWithPoolValue } from "../../../utils/market";
import { prices } from "../../../utils/prices";
import { getClaimableCollateralTimeKey } from "../../../utils/collateral";
import * as keys from "../../../utils/keys";

describe("Exchange.DecreasePosition", () => {
  let fixture;
  let user0, user1;
  let exchangeRouter, reader, dataStore, referralStorage, ethUsdMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1 } = fixture.accounts);
    ({ exchangeRouter, reader, dataStore, referralStorage, ethUsdMarket, wnt, usdc } = fixture.contracts);

    await scenes.deposit(fixture);
  });

  it("uncapped price impact", async () => {
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 8));
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 7));
    await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(6_000_000));
      }
    );

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);

    await scenes.increasePosition.long(fixture);

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "799999999999999986"
    ); // 0.799999999999999986

    await scenes.increasePosition.short(fixture);

    // positive price impact: 0.799999999999999986 - 0.399999999999999994 => 0.4 ETH
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "399999999999999994"
    ); // 0.399999999999999994

    const positionKey0 = getPositionKey(user0.address, ethUsdMarket.marketToken, usdc.address, true);

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
        expect(positionInfo.position.numbers.sizeInTokens).eq("39200000000000000014"); // 39.2
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(200_000));
        expect(positionInfo.basePnlUsd).eq("-3999999999999999930000000000000000"); // -4000
      }
    );

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(6_000_000));
      }
    );

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "399999999999999994"
    ); // 0.4 ETH

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq(0);

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(1000, 18));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(1_000_000, 6));

    await scenes.decreasePosition.long(fixture, {
      create: {
        receiver: user1,
        initialCollateralDeltaAmount: 0,
      },
    });

    // the impact pool increased by ~0.008 ETH, 40 USD
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "407999999999999994"
    ); // 0.407999999999999994 ETH

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq(0);

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(1000, 18));
    // 4 USD was paid from the position's collateral for price impact
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(1_000_440, 6));

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
        expect(positionInfo.position.numbers.collateralAmount).eq(expandDecimals(49_560, 6));
        expect(positionInfo.position.numbers.sizeInTokens).eq("35280000000000000012"); // 35.28
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(180_000));
        expect(positionInfo.basePnlUsd).eq("-3599999999999999940000000000000000");
      }
    );

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("1000000000000000000001666666666");
        expect(poolValueInfo.poolValue).eq("6000000000000000000010000000000000000");
      }
    );
  });

  it("capped price impact", async () => {
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 8));
    await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 7));
    await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    await dataStore.setUint(keys.maxPositionImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 4));
    await dataStore.setUint(keys.maxPositionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 3));

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(6_000_000));
      }
    );

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);

    await scenes.increasePosition.long(fixture);

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "799999999999999986"
    ); // 0.799999999999999986

    await scenes.increasePosition.short(fixture);

    // positive price impact: 0.799999999999999986 - 0.779999999999999986 => 0.02 ETH
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "779999999999999986"
    ); // 0.779999999999999986

    const positionKey0 = getPositionKey(user0.address, ethUsdMarket.marketToken, usdc.address, true);

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
        expect(positionInfo.position.numbers.sizeInTokens).eq("39200000000000000014"); // 39.2
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(200_000));
        expect(positionInfo.basePnlUsd).eq("-3999999999999999930000000000000000"); // -4000
      }
    );

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(decimalToFloat(1));
        expect(poolValueInfo.poolValue).eq(decimalToFloat(6_000_000));
      }
    );

    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "779999999999999986"
    ); // 0.779999999999999986 ETH

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq(0);

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(1000, 18));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(1_000_000, 6));

    const timeKey = await getClaimableCollateralTimeKey();

    expect(
      await dataStore.getUint(
        keys.claimableCollateralAmountKey(ethUsdMarket.marketToken, usdc.address, timeKey, user0.address)
      )
    ).eq(0);

    await scenes.decreasePosition.long(fixture, {
      create: {
        receiver: user1,
        initialCollateralDeltaAmount: 0,
      },
    });

    expect(
      await dataStore.getUint(
        keys.claimableCollateralAmountKey(ethUsdMarket.marketToken, usdc.address, timeKey, user0.address)
      )
    ).eq(expandDecimals(20, 6));

    // the impact pool increased by ~0.004 ETH, 20 USD
    expect(await dataStore.getUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(
      "783999999999999986"
    ); // 0.783999999999999986 ETH

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq(0);

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(1000, 18));
    // 2 USD was paid from the position's collateral for price impact
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(1_000_420, 6));

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
        expect(positionInfo.position.numbers.collateralAmount).eq(expandDecimals(49_560, 6));
        expect(positionInfo.position.numbers.sizeInTokens).eq("35280000000000000012"); // 35.28
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(180_000));
        expect(positionInfo.basePnlUsd).eq("-3599999999999999940000000000000000");
      }
    );

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, { prices: prices.ethUsdMarket }),
      ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq("1000000000000000000001666666666");
        expect(poolValueInfo.poolValue).eq("6000000000000000000010000000000000000");
      }
    );

    // allow 80% of collateral to be claimed
    await dataStore.setUint(
      keys.claimableCollateralFactorKey(ethUsdMarket.marketToken, usdc.address, timeKey),
      decimalToFloat(8, 1)
    );

    await exchangeRouter
      .connect(user0)
      .claimCollateral([ethUsdMarket.marketToken], [usdc.address], [timeKey], user1.address);

    expect(await usdc.balanceOf(user1.address)).eq(expandDecimals(16, 6));
  });
});
