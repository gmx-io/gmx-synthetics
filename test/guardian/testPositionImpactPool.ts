import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { decimalToFloat, expandDecimals } from "../../utils/math";
import { getMarketTokenPriceWithPoolValue } from "../../utils/market";
import { handleDeposit } from "../../utils/deposit";
import * as keys from "../../utils/keys";
import { usingResult } from "../../utils/use";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { getPositionImpactPoolWithdrawalPayload } from "../../utils/timelock";
import { grantRole } from "../../utils/role";

describe("Guardian.PositionImpactPool", () => {
  let fixture;
  let user0, user1;
  let dataStore, ethUsdMarket, wnt, usdc, chainlinkPriceFeedProvider, timelockConfig, roleStore;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, wnt, usdc, chainlinkPriceFeedProvider, timelockConfig, roleStore } = fixture.contracts);

    await grantRole(roleStore, user0.address, "TIMELOCK_ADMIN");

    await handleDeposit(fixture, {
      create: {
        account: user1,
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
        shortTokenAmount: expandDecimals(1000 * 5000, 6),
      },
      execute: {
        precisions: [8, 18],
        tokens: [wnt.address, usdc.address],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });
  });

  it("Position impact pool withdrawal", async () => {
    await usingResult(getMarketTokenPriceWithPoolValue(fixture), ([marketTokenPrice, poolValueInfo]) => {
      expect(marketTokenPrice).eq(decimalToFloat(1));
      expect(poolValueInfo.poolValue).eq(decimalToFloat(10_000_000)); // $10,000,000
    });

    await dataStore.setUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken), expandDecimals(400, 18)); // $2,000,000

    // Pool value should be decremented by impact pool value
    await usingResult(getMarketTokenPriceWithPoolValue(fixture), ([marketTokenPrice, poolValueInfo]) => {
      expect(marketTokenPrice).eq(decimalToFloat(8, 1));
      expect(poolValueInfo.poolValue).eq(decimalToFloat(8_000_000)); // $8,000,000
    });

    const oracleParams = {
      tokens: [usdc.address, wnt.address],
      providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
      data: ["0x", "0x"],
    };

    const withdrawalAmount = expandDecimals(1, 18);
    await timelockConfig
      .connect(user0)
      .signalWithdrawFromPositionImpactPool(ethUsdMarket.marketToken, user1.address, withdrawalAmount);

    await time.increase(1 * 24 * 60 * 60 + 10);
    const { target, payload } = await getPositionImpactPoolWithdrawalPayload(
      ethUsdMarket.marketToken,
      user1.address,
      withdrawalAmount
    );
    await timelockConfig.connect(user0).executeAtomicWithOraclePrice(target, payload, oracleParams);

    // Market token price should be unchanged
    await usingResult(getMarketTokenPriceWithPoolValue(fixture), ([marketTokenPrice, poolValueInfo]) => {
      expect(marketTokenPrice).eq(decimalToFloat(8, 1));
      expect(poolValueInfo.poolValue).eq(decimalToFloat(8_000_000)); // $8,000,000
    });
  });
});
