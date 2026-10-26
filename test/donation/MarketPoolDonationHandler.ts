import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";

import { contractAt, deployContract } from "../../utils/deploy";
import { handleDeposit } from "../../utils/deposit";
import { handleWithdrawal } from "../../utils/withdrawal";
import { errorsContract } from "../../utils/error";
import { getEventData, getEventDataArray, parseLogs } from "../../utils/event";
import { executeWithOracleParams } from "../../utils/exchange";
import { deployFixture } from "../../utils/fixture";
import * as keys from "../../utils/keys";
import { applyFactor, decimalToFloat, expandDecimals, FLOAT_PRECISION, percentageToFloat } from "../../utils/math";
import {
  DEFAULT_MARKET_TYPE,
  getMarketTokenPrice,
  getMarketTokenPriceWithPoolValue,
  getPoolAmount,
} from "../../utils/market";

describe("MarketPoolDonationHandler", () => {
  let fixture;
  let user0, user1;
  let dataStore, marketPoolDonationHandler, marketFactory, oracle, chainlinkDataStreamProvider;
  let ethUsdMarket, ethUsdSingleTokenMarket, btcUsdSingleTokenMarket;
  let wnt, wbtc, usdc;

  const seedAmount = expandDecimals(100_000, 6);
  const donationAmount = expandDecimals(10, 6);
  const maxDonationFactor = percentageToFloat("0.01%");
  const donationPeriodDuration = 24 * 60 * 60;
  const maxDonationAmountPerPeriod = expandDecimals(25, 6);

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({
      dataStore,
      marketPoolDonationHandler,
      marketFactory,
      oracle,
      chainlinkDataStreamProvider,
      ethUsdMarket,
      ethUsdSingleTokenMarket,
      btcUsdSingleTokenMarket,
      wnt,
      wbtc,
      usdc,
    } = fixture.contracts);
  });

  async function seedSingleTokenMarket() {
    await handleDeposit(fixture, {
      create: {
        market: ethUsdSingleTokenMarket,
        shortTokenAmount: seedAmount,
      },
    });
  }

  async function configureDonation(overrides: any = {}) {
    const market = overrides.market || ethUsdSingleTokenMarket;
    const fundingAccount = overrides.fundingAccount || user0.address;
    const configuredMaxDonationFactor = overrides.maxDonationFactor ?? maxDonationFactor;
    const configuredDonationPeriodDuration = overrides.donationPeriodDuration ?? donationPeriodDuration;
    const configuredMaxDonationAmountPerPeriod = overrides.maxDonationAmountPerPeriod ?? maxDonationAmountPerPeriod;
    const isEnabled = overrides.isEnabled === undefined ? true : overrides.isEnabled;

    return marketPoolDonationHandler.setMarketPoolDonationConfig(
      market.marketToken,
      fundingAccount,
      configuredMaxDonationFactor,
      configuredDonationPeriodDuration,
      configuredMaxDonationAmountPerPeriod,
      isEnabled
    );
  }

  async function donate(overrides: any = {}) {
    const market = overrides.market || ethUsdSingleTokenMarket;
    const amount = overrides.amount ?? donationAmount;
    const signer = overrides.signer || fixture.accounts.wallet;
    const isBtcMarket = market.indexToken.toLowerCase() === wbtc.address.toLowerCase();
    const indexTokenPrecision = isBtcMarket ? 20 : 8;
    const indexTokenPrice = isBtcMarket ? expandDecimals(50_000, 2) : expandDecimals(5_000, 4);
    const oracleBlockNumber = await ethers.provider.getBlockNumber();

    return executeWithOracleParams(fixture, {
      args: [market.marketToken, amount],
      oracleBlockNumber,
      tokens: overrides.tokens || [market.indexToken, market.longToken],
      precisions: overrides.precisions || [indexTokenPrecision, 18],
      minPrices: overrides.minPrices || [indexTokenPrice, expandDecimals(1, 6)],
      maxPrices: overrides.maxPrices || [indexTokenPrice, expandDecimals(1, 6)],
      dataStreamTokens: [],
      dataStreamData: [],
      priceFeedTokens: [],
      execute: marketPoolDonationHandler.connect(signer).donate,
      simulate: false,
    });
  }

  async function setupNetEquityDonation() {
    await seedSingleTokenMarket();
    await configureDonation({
      maxDonationFactor: percentageToFloat("0.5%"),
      maxDonationAmountPerPeriod: expandDecimals(1000, 6),
    });
    await usdc.mint(user0.address, expandDecimals(1000, 6));
    await usdc.connect(user0).approve(marketPoolDonationHandler.address, ethers.constants.MaxUint256);
    return contractAt("MarketToken", ethUsdSingleTokenMarket.marketToken);
  }

  async function getWithdrawalValue() {
    return getMarketTokenPriceWithPoolValue(fixture, {
      market: ethUsdSingleTokenMarket,
      pnlFactorType: keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
      maximize: false,
      prices: { longTokenPrice: { min: expandDecimals(1, 24), max: expandDecimals(1, 24) } },
    });
  }

  for (const capped of [false, true]) {
    it(`caps donations against net withdrawal equity with ${capped ? "capped" : "uncapped"} trader PnL`, async () => {
      const marketToken = await setupNetEquityDonation();
      const market = ethUsdSingleTokenMarket.marketToken;
      // $100k gross liquidity, $10k impact-pool liability, and either $20k uncapped
      // long PnL or $100k long PnL capped to 60% of the $50k long-side pool.
      await dataStore.setUint(keys.positionImpactPoolAmountKey(market), expandDecimals(2, 18));
      await dataStore.setUint(
        keys.openInterestKey(market, usdc.address, true),
        expandDecimals(capped ? 100_000 : 10_000, 30)
      );
      await dataStore.setUint(
        keys.openInterestInTokensKey(market, usdc.address, true),
        expandDecimals(capped ? 40 : 6, 18)
      );
      await dataStore.setUint(
        keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, market, true),
        percentageToFloat("60%")
      );
      // Use distinct factors to ensure the cap follows withdrawal valuation.
      for (const factorType of [keys.MAX_PNL_FACTOR_FOR_TRADERS, keys.MAX_PNL_FACTOR_FOR_DEPOSITS]) {
        await dataStore.setUint(keys.maxPnlFactorKey(factorType, market, true), percentageToFloat("90%"));
      }

      const [, before] = await getWithdrawalValue();
      expect(before.poolValue).eq(expandDecimals(capped ? 60_000 : 70_000, 30));
      const maxAmount = expandDecimals(capped ? 300 : 350, 6);
      const supplyBefore = await marketToken.totalSupply();
      await expect(donate({ amount: maxAmount.add(1) }))
        .to.be.revertedWithCustomError(marketPoolDonationHandler, "MaxMarketPoolDonationFactorExceeded")
        .withArgs(market, maxAmount.add(1), maxAmount);
      expect(await usdc.balanceOf(user0.address)).eq(expandDecimals(1000, 6));
      expect(await getPoolAmount(dataStore, market, usdc.address)).eq(seedAmount);
      expect((await marketPoolDonationHandler.getMarketPoolDonationState(market)).donatedAmount).eq(0);

      const receipt = await donate({ amount: maxAmount });
      const event = getEventData(parseLogs(fixture, receipt), "MarketPoolDonation");
      expect(event.maxDonationAmount).eq(maxAmount);
      expect(event.amount).eq(maxAmount);
      expect(await marketToken.totalSupply()).eq(supplyBefore);
      const [, after] = await getWithdrawalValue();
      // A binding PnL cap absorbs 30% of this single-token donation.
      expect(after.poolValue.sub(before.poolValue)).eq(expandDecimals(capped ? 210 : 350, 30));
    });
  }

  it("uses minimum net equity, maximum donation-token price and rounds the token cap down", async () => {
    await setupNetEquityDonation();
    const market = ethUsdSingleTokenMarket.marketToken;
    await dataStore.setUint(keys.positionImpactPoolAmountKey(market), expandDecimals(2, 18));
    const prices = {
      minPrices: [expandDecimals(4900, 4), expandDecimals(99, 4)],
      maxPrices: [expandDecimals(5100, 4), expandDecimals(101, 4)],
    };
    // Min equity: 100,000 * $0.99 - 2 * $5,100 = $88,800.
    // Max amount: floor(($88,800 * 0.5%) / $1.01), in USDC base units.
    const maxDonationUsd = expandDecimals(444, 30);
    const tokenPriceMax = expandDecimals(101, 22);
    const maxAmount = maxDonationUsd.div(tokenPriceMax);
    expect(maxAmount.mul(tokenPriceMax)).lte(maxDonationUsd);
    expect(maxAmount.add(1).mul(tokenPriceMax)).gt(maxDonationUsd);
    await expect(donate({ ...prices, amount: maxAmount.add(1) }))
      .to.be.revertedWithCustomError(marketPoolDonationHandler, "MaxMarketPoolDonationFactorExceeded")
      .withArgs(market, maxAmount.add(1), maxAmount);

    const receipt = await donate({ ...prices, amount: maxAmount });
    const event = getEventData(parseLogs(fixture, receipt), "MarketPoolDonation");
    expect(event.maxDonationAmount).eq(maxAmount);
    expect(await getPoolAmount(dataStore, market, usdc.address)).eq(seedAmount.add(maxAmount));
  });

  for (const impactAmount of [20, 21]) {
    it(`rejects ${
      impactAmount === 20 ? "zero" : "negative"
    } net equity without changing balances or borrowing state`, async () => {
      const marketToken = await setupNetEquityDonation();
      const market = ethUsdSingleTokenMarket.marketToken;
      await dataStore.setUint(keys.positionImpactPoolAmountKey(market), expandDecimals(impactAmount, 18));
      const supplyBefore = await marketToken.totalSupply();
      const borrowingUpdatedAt = await Promise.all(
        [true, false].map((isLong) => dataStore.getUint(keys.cumulativeBorrowingFactorUpdatedAtKey(market, isLong)))
      );
      const poolValue = expandDecimals(100_000 - impactAmount * 5000, 30);
      await expect(donate({ amount: 1 }))
        .to.be.revertedWithCustomError(marketPoolDonationHandler, "InvalidMarketPoolDonationPoolValue")
        .withArgs(market, poolValue);
      expect(await usdc.balanceOf(user0.address)).eq(expandDecimals(1000, 6));
      expect(await usdc.balanceOf(market)).eq(seedAmount);
      expect(await getPoolAmount(dataStore, market, usdc.address)).eq(seedAmount);
      expect(await marketToken.totalSupply()).eq(supplyBefore);
      expect((await marketPoolDonationHandler.getMarketPoolDonationState(market)).donatedAmount).eq(0);
      for (const [index, isLong] of [true, false].entries()) {
        expect(await dataStore.getUint(keys.cumulativeBorrowingFactorUpdatedAtKey(market, isLong))).eq(
          borrowingUpdatedAt[index]
        );
      }
    });
  }

  it("requires both index-token and pool-token oracle prices", async () => {
    await setupNetEquityDonation();
    const market = ethUsdSingleTokenMarket;
    for (const includeIndex of [true, false]) {
      const price = includeIndex ? expandDecimals(5000, 4) : expandDecimals(1, 6);
      await expect(
        donate({
          tokens: [includeIndex ? market.indexToken : market.longToken],
          precisions: [includeIndex ? 8 : 18],
          minPrices: [price],
          maxPrices: [price],
        })
      ).to.be.revertedWithCustomError(errorsContract, "EmptyPrimaryPrice");
    }
    expect(await usdc.balanceOf(user0.address)).eq(expandDecimals(1000, 6));
    expect(await getPoolAmount(dataStore, market.marketToken, usdc.address)).eq(seedAmount);
    expect((await marketPoolDonationHandler.getMarketPoolDonationState(market.marketToken)).donatedAmount).eq(0);
  });

  it("rejects positive equity too small to allow one base unit of donation", async () => {
    await setupNetEquityDonation();
    const market = ethUsdSingleTokenMarket.marketToken;
    await dataStore.setUint(keys.positionImpactPoolAmountKey(market), expandDecimals(20, 18).sub(1));
    const [, value] = await getWithdrawalValue();
    expect(value.poolValue).gt(0);
    await expect(donate({ amount: 1 }))
      .to.be.revertedWithCustomError(marketPoolDonationHandler, "MaxMarketPoolDonationFactorExceeded")
      .withArgs(market, 1, 0);
  });

  for (const scenario of [
    { factor: "0.5%", fee: "4%", grossAmount: 505_000_000, netAmount: 55_000_000, output: 964_800_000 },
    { factor: "0.01%", fee: "0.04%", grossAmount: 10_100_000, netAmount: 1_100_000, output: 999_699_960 },
  ]) {
    it(`prevents the gross-cap round-trip profit with a ${scenario.factor} cap and ${scenario.fee} exit fee`, async () => {
      const marketToken = await setupNetEquityDonation();
      const market = ethUsdSingleTokenMarket.marketToken;
      await configureDonation({
        maxDonationFactor: percentageToFloat(scenario.factor),
        maxDonationAmountPerPeriod: expandDecimals(1000, 6),
      });
      // Construct $100k gross liquidity and $10k net equity without trader PnL.
      // Keep the normal deposit/withdrawal PnL, reserve and lending guards enabled.
      await dataStore.setUint(keys.positionImpactPoolAmountKey(market), expandDecimals(18, 18));
      await dataStore.setUint(keys.withdrawalFeeFactorKey(market, false), percentageToFloat(scenario.fee));
      await handleDeposit(fixture, {
        create: { market: ethUsdSingleTokenMarket, account: user1, shortTokenAmount: expandDecimals(1000, 6) },
      });
      const minted = await marketToken.balanceOf(user1.address);
      expect(minted).eq(expandDecimals(10_000, 18));
      const [priceBefore, before] = await getWithdrawalValue();
      expect(before.poolValue).eq(expandDecimals(11_000, 30));
      expect(await getPoolAmount(dataStore, market, usdc.address)).eq(expandDecimals(101_000, 6));

      // Apply the factor to $11k net equity, not $101k gross liquidity.
      const maxAmount = expandDecimals(scenario.netAmount, 0);
      await expect(donate({ amount: expandDecimals(scenario.grossAmount, 0) }))
        .to.be.revertedWithCustomError(marketPoolDonationHandler, "MaxMarketPoolDonationFactorExceeded")
        .withArgs(market, expandDecimals(scenario.grossAmount, 0), maxAmount);
      await donate({ amount: maxAmount });
      const [priceAfter, after] = await getWithdrawalValue();
      expect(after.poolValue).eq(before.poolValue.add(maxAmount.mul(expandDecimals(1, 24))));
      expect(priceAfter).eq(priceBefore.add(applyFactor(priceBefore, percentageToFloat(scenario.factor))));

      const balanceBefore = await usdc.balanceOf(user1.address);
      await handleWithdrawal(fixture, {
        create: { market: ethUsdSingleTokenMarket, account: user1, marketTokenAmount: minted },
      });
      const received = (await usdc.balanceOf(user1.address)).sub(balanceBefore);
      expect(received).eq(scenario.output);
      expect(received).lt(expandDecimals(1000, 6));
      expect(await marketToken.balanceOf(user1.address)).eq(0);
    });
  }

  it("validates and stores per-market configuration", async () => {
    await expect(
      marketPoolDonationHandler
        .connect(user1)
        .setMarketPoolDonationConfig(
          ethUsdSingleTokenMarket.marketToken,
          user0.address,
          maxDonationFactor,
          donationPeriodDuration,
          maxDonationAmountPerPeriod,
          true
        )
    )
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user1.address, "CONFIG_KEEPER");

    await expect(
      marketPoolDonationHandler.setMarketPoolDonationConfig(
        user1.address,
        user0.address,
        maxDonationFactor,
        donationPeriodDuration,
        maxDonationAmountPerPeriod,
        true
      )
    )
      .to.be.revertedWithCustomError(errorsContract, "MarketNotFound")
      .withArgs(user1.address);

    await expect(
      marketPoolDonationHandler.setMarketPoolDonationConfig(
        ethUsdMarket.marketToken,
        user0.address,
        maxDonationFactor,
        donationPeriodDuration,
        maxDonationAmountPerPeriod,
        true
      )
    )
      .to.be.revertedWithCustomError(marketPoolDonationHandler, "InvalidMarketPoolDonationMarket")
      .withArgs(ethUsdMarket.marketToken, ethUsdMarket.longToken, ethUsdMarket.shortToken);

    const virtualMarketId = ethers.utils.id("single-token-virtual-market");
    await dataStore.setBytes32(keys.virtualMarketIdKey(ethUsdSingleTokenMarket.marketToken), virtualMarketId);
    await expect(configureDonation())
      .to.be.revertedWithCustomError(marketPoolDonationHandler, "MarketPoolDonationVirtualInventoryNotSupported")
      .withArgs(ethUsdSingleTokenMarket.marketToken, virtualMarketId);
    await dataStore.setBytes32(keys.virtualMarketIdKey(ethUsdSingleTokenMarket.marketToken), ethers.constants.HashZero);

    await expect(
      marketPoolDonationHandler.setMarketPoolDonationConfig(
        ethUsdSingleTokenMarket.marketToken,
        ethers.constants.AddressZero,
        maxDonationFactor,
        donationPeriodDuration,
        maxDonationAmountPerPeriod,
        true
      )
    )
      .to.be.revertedWithCustomError(marketPoolDonationHandler, "EmptyMarketPoolDonationFundingAccount")
      .withArgs(ethUsdSingleTokenMarket.marketToken);

    await expect(
      marketPoolDonationHandler.setMarketPoolDonationConfig(
        ethUsdSingleTokenMarket.marketToken,
        user0.address,
        0,
        donationPeriodDuration,
        maxDonationAmountPerPeriod,
        true
      )
    )
      .to.be.revertedWithCustomError(marketPoolDonationHandler, "InvalidMaxMarketPoolDonationFactor")
      .withArgs(ethUsdSingleTokenMarket.marketToken, 0);

    await expect(
      marketPoolDonationHandler.setMarketPoolDonationConfig(
        ethUsdSingleTokenMarket.marketToken,
        user0.address,
        FLOAT_PRECISION.add(1),
        donationPeriodDuration,
        maxDonationAmountPerPeriod,
        true
      )
    )
      .to.be.revertedWithCustomError(marketPoolDonationHandler, "InvalidMaxMarketPoolDonationFactor")
      .withArgs(ethUsdSingleTokenMarket.marketToken, FLOAT_PRECISION.add(1));

    await expect(
      marketPoolDonationHandler.setMarketPoolDonationConfig(
        ethUsdSingleTokenMarket.marketToken,
        user0.address,
        maxDonationFactor,
        0,
        maxDonationAmountPerPeriod,
        true
      )
    )
      .to.be.revertedWithCustomError(marketPoolDonationHandler, "EmptyMarketPoolDonationPeriodDuration")
      .withArgs(ethUsdSingleTokenMarket.marketToken);

    await expect(
      marketPoolDonationHandler.setMarketPoolDonationConfig(
        ethUsdSingleTokenMarket.marketToken,
        user0.address,
        maxDonationFactor,
        donationPeriodDuration,
        0,
        true
      )
    )
      .to.be.revertedWithCustomError(marketPoolDonationHandler, "EmptyMaxMarketPoolDonationAmountPerPeriod")
      .withArgs(ethUsdSingleTokenMarket.marketToken);

    const tx = await configureDonation();
    const event = getEventData(parseLogs(fixture, await tx.wait()), "SetMarketPoolDonationConfig");
    expect(event.market).eq(ethUsdSingleTokenMarket.marketToken);
    expect(event.fundingAccount).eq(user0.address);
    expect(event.token).eq(usdc.address);
    expect(event.maxDonationFactor).eq(maxDonationFactor);
    expect(event.donationPeriodDuration).eq(donationPeriodDuration);
    expect(event.maxDonationAmountPerPeriod).eq(maxDonationAmountPerPeriod);
    expect(event.isEnabled).eq(true);

    const config = await marketPoolDonationHandler.getMarketPoolDonationConfig(ethUsdSingleTokenMarket.marketToken);
    expect(config.fundingAccount).eq(user0.address);
    expect(config.isEnabled).eq(true);
    expect(config.maxDonationFactor).eq(maxDonationFactor);
    expect(config.donationPeriodDuration).eq(donationPeriodDuration);
    expect(config.maxDonationAmountPerPeriod).eq(maxDonationAmountPerPeriod);

    await configureDonation({
      fundingAccount: ethers.constants.AddressZero,
      maxDonationFactor: 0,
      donationPeriodDuration: 0,
      maxDonationAmountPerPeriod: 0,
      isEnabled: false,
    });
    const disabledConfig = await marketPoolDonationHandler.getMarketPoolDonationConfig(
      ethUsdSingleTokenMarket.marketToken
    );
    expect(disabledConfig.fundingAccount).eq(ethers.constants.AddressZero);
    expect(disabledConfig.isEnabled).eq(false);
    expect(disabledConfig.maxDonationFactor).eq(0);
    expect(disabledConfig.donationPeriodDuration).eq(0);
    expect(disabledConfig.maxDonationAmountPerPeriod).eq(0);
  });

  it("does not enable donations for a disabled market", async () => {
    await dataStore.setBool(keys.isMarketDisabledKey(ethUsdSingleTokenMarket.marketToken), true);

    await expect(configureDonation())
      .to.be.revertedWithCustomError(errorsContract, "DisabledMarket")
      .withArgs(ethUsdSingleTokenMarket.marketToken);

    await configureDonation({
      fundingAccount: ethers.constants.AddressZero,
      maxDonationFactor: 0,
      donationPeriodDuration: 0,
      maxDonationAmountPerPeriod: 0,
      isEnabled: false,
    });

    const config = await marketPoolDonationHandler.getMarketPoolDonationConfig(ethUsdSingleTokenMarket.marketToken);
    expect(config.isEnabled).eq(false);
  });

  it("restricts donation execution and validates runtime state", async () => {
    await seedSingleTokenMarket();

    await expect(donate({ signer: user1 }))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user1.address, "DONATION_KEEPER");

    await expect(donate())
      .to.be.revertedWithCustomError(marketPoolDonationHandler, "MarketPoolDonationDisabled")
      .withArgs(ethUsdSingleTokenMarket.marketToken);

    await configureDonation();

    await expect(donate({ amount: 0 })).to.be.revertedWithCustomError(errorsContract, "EmptyAmount");

    await expect(donate({ amount: donationAmount.add(1) }))
      .to.be.revertedWithCustomError(marketPoolDonationHandler, "MaxMarketPoolDonationFactorExceeded")
      .withArgs(ethUsdSingleTokenMarket.marketToken, donationAmount.add(1), donationAmount);

    await dataStore.setBool(keys.isMarketDisabledKey(ethUsdSingleTokenMarket.marketToken), true);
    await expect(donate())
      .to.be.revertedWithCustomError(errorsContract, "DisabledMarket")
      .withArgs(ethUsdSingleTokenMarket.marketToken);
  });

  it("does not allow a donation before GM supply exists", async () => {
    await configureDonation({ market: btcUsdSingleTokenMarket });
    await usdc.mint(user0.address, donationAmount);
    await usdc.connect(user0).approve(marketPoolDonationHandler.address, donationAmount);

    await expect(donate({ market: btcUsdSingleTokenMarket })).to.be.revertedWithCustomError(
      marketPoolDonationHandler,
      "EmptyCirculatingMarketTokenSupply"
    );

    expect(await usdc.balanceOf(user0.address)).eq(donationAmount);
    expect(await usdc.balanceOf(btcUsdSingleTokenMarket.marketToken)).eq(0);
    expect(await getPoolAmount(dataStore, btcUsdSingleTokenMarket.marketToken, usdc.address)).eq(0);
    expect(
      (await marketPoolDonationHandler.getMarketPoolDonationState(btcUsdSingleTokenMarket.marketToken)).donatedAmount
    ).eq(0);
  });

  for (const afterWithdrawal of [false, true]) {
    it(`rejects bootstrap-only supply ${
      afterWithdrawal ? "after the last LP withdraws" : "after the first deposit"
    } and resumes with live LPs`, async () => {
      const market = ethUsdSingleTokenMarket.marketToken;
      const marketToken = await contractAt("MarketToken", market);
      const bootstrapReceiver = { address: "0x0000000000000000000000000000000000000001" };
      const bootstrapSupply = expandDecimals(100_000, 18);

      // Exercise the protocol's first-deposit requirement, rather than minting dead GM directly.
      await dataStore.setUint(keys.minMarketTokensForFirstDeposit(market), bootstrapSupply);
      await handleDeposit(fixture, {
        create: {
          market: ethUsdSingleTokenMarket,
          receiver: bootstrapReceiver,
          shortTokenAmount: seedAmount,
          minMarketTokens: bootstrapSupply,
        },
      });
      await configureDonation();
      await usdc.mint(user0.address, donationAmount);
      await usdc.connect(user0).approve(marketPoolDonationHandler.address, donationAmount);

      if (afterWithdrawal) {
        await handleDeposit(fixture, {
          create: { market: ethUsdSingleTokenMarket, account: user1, shortTokenAmount: seedAmount },
        });
        const liveSupply = await marketToken.balanceOf(user1.address);
        expect(liveSupply).eq(bootstrapSupply);
        await handleWithdrawal(fixture, {
          create: { market: ethUsdSingleTokenMarket, account: user1, marketTokenAmount: liveSupply },
        });
        expect(await marketToken.balanceOf(user1.address)).eq(0);
        expect(await usdc.balanceOf(user1.address)).eq(seedAmount);
      }

      expect(await marketToken.totalSupply()).eq(bootstrapSupply);
      expect(await marketToken.balanceOf(bootstrapReceiver.address)).eq(bootstrapSupply);
      expect(await getPoolAmount(dataStore, market, usdc.address)).eq(seedAmount);
      // The attempted donation is within the 1 bp cap, so the supply check must reject it.
      expect(applyFactor(seedAmount, maxDonationFactor)).eq(donationAmount);

      const borrowingKeys = [true, false].flatMap((isLong) => [
        keys.cumulativeBorrowingFactorKey(market, isLong),
        keys.cumulativeBorrowingFactorUpdatedAtKey(market, isLong),
      ]);
      const borrowingBefore = await Promise.all(borrowingKeys.map((key) => dataStore.getUint(key)));
      await time.increase(60);
      await expect(donate()).to.be.revertedWithCustomError(
        marketPoolDonationHandler,
        "EmptyCirculatingMarketTokenSupply"
      );

      expect(await usdc.balanceOf(user0.address)).eq(donationAmount);
      expect(await usdc.allowance(user0.address, marketPoolDonationHandler.address)).eq(donationAmount);
      expect(await usdc.balanceOf(market)).eq(seedAmount);
      expect(await getPoolAmount(dataStore, market, usdc.address)).eq(seedAmount);
      expect(await marketToken.totalSupply()).eq(bootstrapSupply);
      expect(await marketToken.balanceOf(bootstrapReceiver.address)).eq(bootstrapSupply);
      expect((await marketPoolDonationHandler.getMarketPoolDonationState(market)).donatedAmount).eq(0);
      for (let i = 0; i < borrowingKeys.length; i++) {
        expect(await dataStore.getUint(borrowingKeys[i])).eq(borrowingBefore[i]);
      }

      await handleDeposit(fixture, {
        create: { market: ethUsdSingleTokenMarket, account: user1, shortTokenAmount: seedAmount },
      });
      const supplyBefore = await marketToken.totalSupply();
      const [priceBefore] = await getWithdrawalValue();
      expect(supplyBefore).eq(bootstrapSupply.mul(2));

      await donate();

      expect(await usdc.balanceOf(user0.address)).eq(0);
      expect(await usdc.balanceOf(market)).eq(seedAmount.mul(2).add(donationAmount));
      expect(await getPoolAmount(dataStore, market, usdc.address)).eq(seedAmount.mul(2).add(donationAmount));
      expect(await marketToken.totalSupply()).eq(supplyBefore);
      expect(await marketToken.balanceOf(bootstrapReceiver.address)).eq(bootstrapSupply);
      expect(await marketToken.balanceOf(user1.address)).eq(bootstrapSupply);
      expect((await marketPoolDonationHandler.getMarketPoolDonationState(market)).donatedAmount).eq(donationAmount);
      const [priceAfter] = await getWithdrawalValue();
      expect(priceAfter).gt(priceBefore);
    });
  }

  it("increases the GM price without minting GM and supports repeated donations", async () => {
    await seedSingleTokenMarket();
    await configureDonation();

    const marketToken = await contractAt("MarketToken", ethUsdSingleTokenMarket.marketToken);
    const initialSupply = await marketToken.totalSupply();
    const initialPoolAmount = await getPoolAmount(dataStore, ethUsdSingleTokenMarket.marketToken, usdc.address);
    const initialMarketBalance = await usdc.balanceOf(ethUsdSingleTokenMarket.marketToken);
    const initialPrice = await getMarketTokenPrice(fixture, {
      market: ethUsdSingleTokenMarket,
      prices: {
        longTokenPrice: {
          min: expandDecimals(1, 6 + 18),
          max: expandDecimals(1, 6 + 18),
        },
      },
    });

    expect(initialSupply).eq(expandDecimals(100_000, 18));
    expect(initialPoolAmount).eq(seedAmount);
    expect(initialMarketBalance).eq(seedAmount);
    expect(initialPrice).eq(expandDecimals(1, 30));

    await usdc.mint(user0.address, donationAmount.mul(2));
    await usdc.connect(user0).approve(marketPoolDonationHandler.address, donationAmount.mul(2));

    await donate();
    const receipt = await donate();
    const logs = parseLogs(fixture, receipt);
    const event = getEventData(logs, "MarketPoolDonation");
    const poolAmountEvent = getEventData(logs, "PoolAmountUpdated");

    expect(event.market).eq(ethUsdSingleTokenMarket.marketToken);
    expect(event.fundingAccount).eq(user0.address);
    expect(event.token).eq(usdc.address);
    expect(event.amount).eq(donationAmount);
    expect(event.nextPoolAmount).eq(seedAmount.add(donationAmount.mul(2)));
    expect(event.marketTokenSupply).eq(initialSupply);
    expect(event.maxDonationAmount).eq(applyFactor(seedAmount.add(donationAmount), maxDonationFactor));
    expect(event.donatedAmountInPeriod).eq(donationAmount.mul(2));
    expect(poolAmountEvent.market).eq(ethUsdSingleTokenMarket.marketToken);
    expect(poolAmountEvent.token).eq(usdc.address);
    expect(poolAmountEvent.delta).eq(donationAmount);
    expect(poolAmountEvent.nextValue).eq(seedAmount.add(donationAmount.mul(2)));

    expect(await getPoolAmount(dataStore, ethUsdSingleTokenMarket.marketToken, usdc.address)).eq(
      initialPoolAmount.add(donationAmount.mul(2))
    );
    expect(await usdc.balanceOf(ethUsdSingleTokenMarket.marketToken)).eq(
      initialMarketBalance.add(donationAmount.mul(2))
    );
    expect(await marketToken.totalSupply()).eq(initialSupply);
    expect(await marketToken.balanceOf(user0.address)).eq(initialSupply);
    expect(await usdc.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(marketPoolDonationHandler.address)).eq(0);

    const finalPrice = await getMarketTokenPrice(fixture, {
      market: ethUsdSingleTokenMarket,
      prices: {
        longTokenPrice: {
          min: expandDecimals(1, 6 + 18),
          max: expandDecimals(1, 6 + 18),
        },
      },
    });
    expect(finalPrice).eq(expandDecimals(10_002, 26));

    const state = await marketPoolDonationHandler.getMarketPoolDonationState(ethUsdSingleTokenMarket.marketToken);
    expect(state.periodId).eq(event.periodId);
    expect(state.donatedAmount).eq(donationAmount.mul(2));
  });

  it("checkpoints borrowing using the pre-donation pool liquidity", async () => {
    await seedSingleTokenMarket();
    await configureDonation();
    await usdc.mint(user0.address, donationAmount);
    await usdc.connect(user0).approve(marketPoolDonationHandler.address, donationAmount);

    const market = ethUsdSingleTokenMarket.marketToken;
    const borrowingFactor = decimalToFloat(1, 8);
    const openInterestUsd = decimalToFloat(10_000);
    const openInterestInTokens = expandDecimals(2, 18);

    for (const isLong of [true, false]) {
      await dataStore.setUint(keys.optimalUsageFactorKey(market, isLong), 0);
      await dataStore.setUint(keys.borrowingExponentFactorKey(market, isLong), decimalToFloat(1));
      await dataStore.setUint(keys.borrowingFactorKey(market, isLong), borrowingFactor);
      await dataStore.setUint(keys.maxBorrowingFactorPerSecondKey(market, isLong), borrowingFactor);
      await dataStore.setUint(keys.openInterestReserveFactorKey(market, isLong), FLOAT_PRECISION);
      await dataStore.setUint(keys.openInterestKey(market, usdc.address, isLong), openInterestUsd);
      await dataStore.setUint(keys.openInterestInTokensKey(market, usdc.address, isLong), openInterestInTokens);
    }

    const initialBlock = await ethers.provider.getBlock("latest");
    const longUpdatedAtKey = keys.cumulativeBorrowingFactorUpdatedAtKey(market, true);
    const shortUpdatedAtKey = keys.cumulativeBorrowingFactorUpdatedAtKey(market, false);
    await dataStore.setUint(longUpdatedAtKey, initialBlock.timestamp);
    await dataStore.setUint(shortUpdatedAtKey, initialBlock.timestamp);

    await time.increase(60 * 60);

    const receipt = await donate();
    const donationBlock = await ethers.provider.getBlock(receipt.blockNumber);
    const elapsed = donationBlock.timestamp - initialBlock.timestamp;

    // A single-token market divides the 100,000 token pool equally between the
    // long and short borrowing calculations. With 10,000 USD reserved on each
    // side, pre-donation utilization is exactly 20%.
    const expectedDelta = applyFactor(borrowingFactor, percentageToFloat("20%")).mul(elapsed);
    expect(await dataStore.getUint(keys.cumulativeBorrowingFactorKey(market, true))).eq(expectedDelta);
    expect(await dataStore.getUint(keys.cumulativeBorrowingFactorKey(market, false))).eq(expectedDelta);
    expect(await dataStore.getUint(longUpdatedAtKey)).eq(donationBlock.timestamp);
    expect(await dataStore.getUint(shortUpdatedAtKey)).eq(donationBlock.timestamp);

    const borrowingEvents = getEventDataArray(parseLogs(fixture, receipt), "CumulativeBorrowingFactorUpdated");
    expect(borrowingEvents).length(2);
    expect(borrowingEvents.map((event) => event.isLong)).deep.eq([true, false]);
  });

  it("enforces the cumulative period cap and resets usage in the next period", async () => {
    await seedSingleTokenMarket();
    await configureDonation();

    const thirdDonationAmount = expandDecimals(6, 6);
    await usdc.mint(user0.address, donationAmount.mul(2).add(thirdDonationAmount));
    await usdc
      .connect(user0)
      .approve(marketPoolDonationHandler.address, donationAmount.mul(2).add(thirdDonationAmount));

    await donate();
    await donate();

    const stateBefore = await marketPoolDonationHandler.getMarketPoolDonationState(ethUsdSingleTokenMarket.marketToken);
    await expect(donate({ amount: thirdDonationAmount }))
      .to.be.revertedWithCustomError(marketPoolDonationHandler, "MaxMarketPoolDonationAmountPerPeriodExceeded")
      .withArgs(
        ethUsdSingleTokenMarket.marketToken,
        stateBefore.periodId,
        donationAmount.mul(2).add(thirdDonationAmount),
        maxDonationAmountPerPeriod
      );

    const stateAfterRevert = await marketPoolDonationHandler.getMarketPoolDonationState(
      ethUsdSingleTokenMarket.marketToken
    );
    expect(stateAfterRevert.periodId).eq(stateBefore.periodId);
    expect(stateAfterRevert.donatedAmount).eq(donationAmount.mul(2));

    await time.increase(donationPeriodDuration);

    const resetState = await marketPoolDonationHandler.getMarketPoolDonationState(ethUsdSingleTokenMarket.marketToken);
    expect(resetState.periodId).gt(stateBefore.periodId);
    expect(resetState.donatedAmount).eq(0);

    await donate({ amount: thirdDonationAmount });

    const stateInNextPeriod = await marketPoolDonationHandler.getMarketPoolDonationState(
      ethUsdSingleTokenMarket.marketToken
    );
    expect(stateInNextPeriod.periodId).eq(resetState.periodId);
    expect(stateInNextPeriod.donatedAmount).eq(thirdDonationAmount);
  });

  it("resets the current quota when the donation period duration changes", async () => {
    await seedSingleTokenMarket();
    await configureDonation();

    await usdc.mint(user0.address, donationAmount.mul(2));
    await usdc.connect(user0).approve(marketPoolDonationHandler.address, donationAmount.mul(2));
    await donate();

    await configureDonation();
    expect(
      (await marketPoolDonationHandler.getMarketPoolDonationState(ethUsdSingleTokenMarket.marketToken)).donatedAmount
    ).eq(donationAmount);

    await configureDonation({ donationPeriodDuration: donationPeriodDuration * 2 });
    expect(
      (await marketPoolDonationHandler.getMarketPoolDonationState(ethUsdSingleTokenMarket.marketToken)).donatedAmount
    ).eq(0);

    await configureDonation();
    expect(
      (await marketPoolDonationHandler.getMarketPoolDonationState(ethUsdSingleTokenMarket.marketToken)).donatedAmount
    ).eq(0);

    await donate();
    expect(
      (await marketPoolDonationHandler.getMarketPoolDonationState(ethUsdSingleTokenMarket.marketToken)).donatedAmount
    ).eq(donationAmount);
  });

  it("reverts the transfer and accounting update when the pool cap is exceeded", async () => {
    await seedSingleTokenMarket();
    await configureDonation();
    await usdc.mint(user0.address, donationAmount);
    await usdc.connect(user0).approve(marketPoolDonationHandler.address, donationAmount);

    const initialPoolAmount = await getPoolAmount(dataStore, ethUsdSingleTokenMarket.marketToken, usdc.address);
    const initialMarketBalance = await usdc.balanceOf(ethUsdSingleTokenMarket.marketToken);
    const initialLongBorrowingUpdatedAt = await dataStore.getUint(
      keys.cumulativeBorrowingFactorUpdatedAtKey(ethUsdSingleTokenMarket.marketToken, true)
    );
    const initialShortBorrowingUpdatedAt = await dataStore.getUint(
      keys.cumulativeBorrowingFactorUpdatedAtKey(ethUsdSingleTokenMarket.marketToken, false)
    );
    const maxPoolAmount = initialPoolAmount.div(2);
    await dataStore.setUint(keys.maxPoolAmountKey(ethUsdSingleTokenMarket.marketToken, usdc.address), maxPoolAmount);

    await expect(donate())
      .to.be.revertedWithCustomError(errorsContract, "MaxPoolAmountExceeded")
      .withArgs(initialPoolAmount.add(donationAmount).div(2), maxPoolAmount);

    expect(await getPoolAmount(dataStore, ethUsdSingleTokenMarket.marketToken, usdc.address)).eq(initialPoolAmount);
    expect(await usdc.balanceOf(ethUsdSingleTokenMarket.marketToken)).eq(initialMarketBalance);
    expect(await usdc.balanceOf(user0.address)).eq(donationAmount);
    expect(
      await dataStore.getUint(keys.cumulativeBorrowingFactorUpdatedAtKey(ethUsdSingleTokenMarket.marketToken, true))
    ).eq(initialLongBorrowingUpdatedAt);
    expect(
      await dataStore.getUint(keys.cumulativeBorrowingFactorUpdatedAtKey(ethUsdSingleTokenMarket.marketToken, false))
    ).eq(initialShortBorrowingUpdatedAt);
    expect(
      (await marketPoolDonationHandler.getMarketPoolDonationState(ethUsdSingleTokenMarket.marketToken)).donatedAmount
    ).eq(0);
  });

  it("rejects fee-on-transfer tokens and rolls the transfer back", async () => {
    const feeToken = await deployContract("MockFeeOnTransferToken", ["Fee Token", "FEE", 6, 100]);
    const market = await marketFactory.callStatic.createMarket(
      wnt.address,
      feeToken.address,
      feeToken.address,
      DEFAULT_MARKET_TYPE
    );
    await marketFactory.createMarket(wnt.address, feeToken.address, feeToken.address, DEFAULT_MARKET_TYPE);

    await dataStore.setAddress(
      keys.oracleProviderForTokenKey(oracle.address, feeToken.address),
      chainlinkDataStreamProvider.address
    );

    const marketToken = await contractAt("MarketToken", market.marketToken);
    await feeToken.mint(market.marketToken, seedAmount);
    await dataStore.setUint(keys.poolAmountKey(market.marketToken, feeToken.address), seedAmount);
    await dataStore.setUint(keys.maxPoolAmountKey(market.marketToken, feeToken.address), seedAmount.mul(10));
    await marketToken.mint(user1.address, expandDecimals(100_000, 18));

    await configureDonation({ market });
    await feeToken.mint(user0.address, donationAmount);
    await feeToken.connect(user0).approve(marketPoolDonationHandler.address, donationAmount);

    const receivedAmount = donationAmount.mul(9_900).div(10_000);
    await expect(donate({ market }))
      .to.be.revertedWithCustomError(marketPoolDonationHandler, "UnexpectedMarketPoolDonationReceivedAmount")
      .withArgs(market.marketToken, feeToken.address, donationAmount, receivedAmount);

    expect(await feeToken.balanceOf(user0.address)).eq(donationAmount);
    expect(await feeToken.balanceOf(market.marketToken)).eq(seedAmount);
    expect(await getPoolAmount(dataStore, market.marketToken, feeToken.address)).eq(seedAmount);
    expect(await marketToken.totalSupply()).eq(expandDecimals(100_000, 18));
    expect((await marketPoolDonationHandler.getMarketPoolDonationState(market.marketToken)).donatedAmount).eq(0);
  });
});
