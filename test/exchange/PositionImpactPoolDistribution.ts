import { expect } from "chai";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";

import { usingResult } from "../../utils/use";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { getMarketTokenPriceWithPoolValue } from "../../utils/market";
import { grantRole } from "../../utils/role";
import { getBalanceOf } from "../../utils/token";
import * as keys from "../../utils/keys";

describe("Exchange.PositionImpactPoolDistribution", () => {
  let fixture;
  let wallet, user1;
  let config, dataStore, roleStore, ethUsdMarket;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user1 } = fixture.accounts);
    ({ config, dataStore, roleStore, ethUsdMarket } = fixture.contracts);

    await grantRole(roleStore, wallet.address, "CONFIG_KEEPER");

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(5_000_000, 6),
      },
    });
  });

  it("allows distribution of the position impact pool", async () => {
    await usingResult(getMarketTokenPriceWithPoolValue(fixture), ([marketTokenPrice, poolValueInfo]) => {
      expect(marketTokenPrice).eq(decimalToFloat(1));
      expect(poolValueInfo.poolValue).eq(decimalToFloat(10_000_000));
    });

    await dataStore.setUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken), expandDecimals(400, 18));

    await usingResult(getMarketTokenPriceWithPoolValue(fixture), ([marketTokenPrice, poolValueInfo]) => {
      expect(marketTokenPrice).eq(decimalToFloat(8, 1));
      expect(poolValueInfo.poolValue).eq(decimalToFloat(8_000_000));
    });

    await time.increase(5 * 24 * 60 * 60);
    await mine(1);

    await usingResult(getMarketTokenPriceWithPoolValue(fixture), ([marketTokenPrice, poolValueInfo]) => {
      expect(marketTokenPrice).eq(decimalToFloat(8, 1));
      expect(poolValueInfo.poolValue).eq(decimalToFloat(8_000_000));
    });

    await config.setPositionImpactDistributionRate(
      ethUsdMarket.marketToken,
      expandDecimals(200, 18), // minPositionImpactPoolAmount
      expandDecimals(2, 43) // positionImpactPoolDistributionRate, 0.00002 ETH per second, 200 ETH for 10,000,000 seconds
    );

    await time.increase(5_000_000);
    await mine(1);

    await usingResult(getMarketTokenPriceWithPoolValue(fixture), ([marketTokenPrice, poolValueInfo]) => {
      expect(marketTokenPrice).eq("850000010000000000000000000000"); // 0.85000001 USD
      expect(poolValueInfo.poolValue).eq("8500000100000000000000000000000000000"); // 8500000.1
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq(0);

    await handleDeposit(fixture, {
      create: {
        receiver: user1,
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(850_000, 6),
      },
    });

    // 850,000 / 0.85000001, 999,999.988235
    // there is a small difference due to the some amount of position impact pool being distributed between calls
    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq("999999941176474048442703"); // 999,999.941176474048442703

    await time.increase(5_000_000);
    await mine(1);

    await usingResult(getMarketTokenPriceWithPoolValue(fixture), ([marketTokenPrice, poolValueInfo]) => {
      expect(marketTokenPrice).eq("895454550243072179514856713104"); // 0.89545455024 USD
      expect(poolValueInfo.poolValue).eq("9850000000000000000000000000000000000"); // 9,850,000
    });

    await time.increase(5_000_000);
    await mine(1);

    await usingResult(getMarketTokenPriceWithPoolValue(fixture), ([marketTokenPrice, poolValueInfo]) => {
      expect(marketTokenPrice).eq("895454550243072179514856713104"); // 0.89545455024 USD
      expect(poolValueInfo.poolValue).eq("9850000000000000000000000000000000000"); // 9,850,000
    });
  });
});
