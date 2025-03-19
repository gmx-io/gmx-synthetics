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
import { errorsContract } from "../../utils/error";

describe("Guardian.PositionImpactPool", () => {
  let fixture;
  let user0, user1;
  let dataStore, ethUsdMarket, solUsdMarket, sol, wnt, usdc, chainlinkPriceFeedProvider, timelockConfig, roleStore;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, solUsdMarket, sol, wnt, usdc, chainlinkPriceFeedProvider, timelockConfig, roleStore } =
      fixture.contracts);

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
    const usdcStartingBalance = await usdc.balanceOf(user1.address);
    const wntStartingBalance = await wnt.balanceOf(user1.address);
    expect(usdcStartingBalance).to.eq(0);
    expect(wntStartingBalance).to.eq(0);

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

    await expect(
      timelockConfig
        .connect(user1)
        .signalWithdrawFromPositionImpactPool(ethUsdMarket.marketToken, user1.address, withdrawalAmount)
    )
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user1.address, "TIMELOCK_ADMIN");

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

    // user should receive funds
    const usdcFinishBalance = await usdc.balanceOf(user1.address);
    const wntFinishBalance = await wnt.balanceOf(user1.address);
    expect(usdcFinishBalance).to.eq(decimalToFloat(2.5, 6)); // 2.5 USDC
    expect(wntFinishBalance).to.eq(decimalToFloat(0.5, 18)); // 0.5 ETH
  });

  it("should fail when withdrawing zero amount", async function () {
    await expect(
      timelockConfig.connect(user0).signalWithdrawFromPositionImpactPool(ethUsdMarket.marketToken, user1.address, 0)
    ).to.be.revertedWithCustomError(errorsContract, "InvalidWithdrawalAmount");
  });

  it("should fail when withdrawing more than available", async function () {
    const largeAmount = expandDecimals(1000, 18); // 1000 ETH

    await timelockConfig
      .connect(user0)
      .signalWithdrawFromPositionImpactPool(ethUsdMarket.marketToken, user1.address, largeAmount);

    await time.increase(1 * 24 * 60 * 60 + 10);
    const { target, payload } = await getPositionImpactPoolWithdrawalPayload(
      ethUsdMarket.marketToken,
      user1.address,
      largeAmount
    );
    const oracleParams = {
      tokens: [usdc.address, wnt.address],
      providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
      data: ["0x", "0x"],
    };
    await expect(
      timelockConfig.connect(user0).executeAtomicWithOraclePrice(target, payload, oracleParams)
    ).to.be.revertedWith("TimelockController: underlying transaction reverted");
  });
});
