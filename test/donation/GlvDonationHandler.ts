import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";

import { setBytes32IfDifferent } from "../../utils/dataStore";
import { handleDeposit } from "../../utils/deposit";
import { contractAt } from "../../utils/deploy";
import { errorsContract } from "../../utils/error";
import { getEventData, parseLogs } from "../../utils/event";
import { executeWithOracleParams } from "../../utils/exchange";
import { deployFixture } from "../../utils/fixture";
import { handleGlvDeposit, handleGlvWithdrawal } from "../../utils/glv";
import * as keys from "../../utils/keys";
import { expandDecimals, FLOAT_PRECISION, percentageToFloat } from "../../utils/math";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import { grantRole } from "../../utils/role";

describe("GlvDonationHandler", () => {
  let fixture;
  let wallet, user1, user2;
  let dataStore, roleStore, glvDonationHandler, glvReader, oracle, chainlinkDataStreamProvider;
  let ethUsdMarket, btcUsdMarket, solUsdMarket, ethUsdGlvAddress;
  let wnt, usdc, sol;

  const donationAmount = expandDecimals(10, 18);
  const maxDonationFactor = percentageToFloat("0.01%");
  const donationPeriodDuration = 24 * 60 * 60;
  const maxDonationAmountPerPeriod = expandDecimals(25, 18);

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user1, user2 } = fixture.accounts);
    ({
      dataStore,
      roleStore,
      glvDonationHandler,
      glvReader,
      oracle,
      chainlinkDataStreamProvider,
      ethUsdMarket,
      btcUsdMarket,
      solUsdMarket,
      ethUsdGlvAddress,
      wnt,
      usdc,
      sol,
    } = fixture.contracts);

    await grantRole(roleStore, wallet.address, "DONATION_KEEPER");
  });

  async function seedGlv() {
    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(50_000, 6),
      },
    });
  }

  async function seedFundingAccount() {
    await handleDeposit(fixture, {
      create: {
        account: user1,
        receiver: user1,
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5_000, 6),
      },
    });
  }

  async function configureDonation(overrides: any = {}) {
    const glv = overrides.glv || ethUsdGlvAddress;
    const market = overrides.market || ethUsdMarket;
    const fundingAccount = overrides.fundingAccount || user1.address;
    const configuredMaxDonationFactor = overrides.maxDonationFactor ?? maxDonationFactor;
    const configuredDonationPeriodDuration = overrides.donationPeriodDuration ?? donationPeriodDuration;
    const configuredMaxDonationAmountPerPeriod = overrides.maxDonationAmountPerPeriod ?? maxDonationAmountPerPeriod;
    const isEnabled = overrides.isEnabled === undefined ? true : overrides.isEnabled;

    return glvDonationHandler.setGlvDonationConfig(
      glv,
      market.marketToken,
      fundingAccount,
      configuredMaxDonationFactor,
      configuredDonationPeriodDuration,
      configuredMaxDonationAmountPerPeriod,
      isEnabled
    );
  }

  async function donate(overrides: any = {}) {
    const glv = overrides.glv || ethUsdGlvAddress;
    const market = overrides.market || ethUsdMarket;
    const amount = overrides.amount ?? donationAmount;
    const signer = overrides.signer || wallet;
    const tokens = overrides.tokens || [wnt.address, usdc.address, sol.address];
    const precisions = overrides.precisions || [8, 18, 8];
    const minPrices = overrides.minPrices || [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];
    const maxPrices = overrides.maxPrices || minPrices;
    const oracleBlockNumber = await ethers.provider.getBlockNumber();

    return executeWithOracleParams(fixture, {
      args: [glv, market.marketToken, amount],
      oracleBlockNumber,
      tokens,
      precisions,
      minPrices,
      maxPrices,
      dataStreamTokens: [],
      dataStreamData: [],
      priceFeedTokens: [],
      execute: glvDonationHandler.connect(signer).donate,
      simulate: false,
    });
  }

  async function setupDonation() {
    await seedGlv();
    await seedFundingAccount();
    await configureDonation();

    const marketToken = await contractAt("MarketToken", ethUsdMarket.marketToken);
    await marketToken.connect(user1).approve(glvDonationHandler.address, ethers.constants.MaxUint256);
    return marketToken;
  }

  function getMarketPrices(indexPrice: number) {
    return {
      indexTokenPrice: {
        min: expandDecimals(indexPrice, 12),
        max: expandDecimals(indexPrice, 12),
      },
      longTokenPrice: {
        min: expandDecimals(5000, 12),
        max: expandDecimals(5000, 12),
      },
      shortTokenPrice: {
        min: expandDecimals(1, 24),
        max: expandDecimals(1, 24),
      },
      crossCollateralTokens: [],
      crossCollateralPrices: [],
    };
  }

  async function getPoolValue(market, prices, maximize: boolean) {
    const [, info] = await fixture.contracts.reader.getMarketTokenPrice(
      dataStore.address,
      market,
      prices.indexTokenPrice,
      prices.longTokenPrice,
      prices.shortTokenPrice,
      keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
      maximize
    );
    return info.poolValue;
  }

  async function getSignedGlvOracleParams(minPrice = 10000, maxPrice = 10000) {
    await setBytes32IfDifferent(keys.oracleTypeKey(ethUsdGlvAddress), TOKEN_ORACLE_TYPES.DEFAULT, "oracle type");
    await dataStore.setAddress(
      keys.oracleProviderForTokenKey(oracle.address, ethUsdGlvAddress),
      chainlinkDataStreamProvider.address
    );
    return {
      tokens: [wnt.address, usdc.address, sol.address, ethUsdGlvAddress],
      precisions: [8, 18, 8, 8],
      minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4), expandDecimals(minPrice, 0)],
      maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4), expandDecimals(maxPrice, 0)],
    };
  }

  function getSpreadPrices() {
    const prices = getMarketPrices(5000);
    prices.indexTokenPrice.min = prices.longTokenPrice.min = expandDecimals(4999, 12);
    prices.indexTokenPrice.max = prices.longTokenPrice.max = expandDecimals(5001, 12);
    return prices;
  }

  function getSpreadOracleParams() {
    return {
      minPrices: [expandDecimals(4999, 4), expandDecimals(1, 6), expandDecimals(600, 4)],
      maxPrices: [expandDecimals(5001, 4), expandDecimals(1, 6), expandDecimals(600, 4)],
    };
  }

  async function expectDonationRevertWithoutAccountingChanges(market, overrides, errorContract, error, args) {
    const marketToken = await contractAt("MarketToken", market.marketToken);
    const glvToken = await contractAt("GlvToken", ethUsdGlvAddress);
    const fundingBalance = await marketToken.balanceOf(user1.address);
    const actualBalance = await marketToken.balanceOf(ethUsdGlvAddress);
    const recordedBalance = await glvToken.tokenBalances(market.marketToken);
    const supply = await glvToken.totalSupply();
    const state = await glvDonationHandler.getGlvDonationState(ethUsdGlvAddress, market.marketToken);

    await expect(donate({ market, ...overrides }))
      .to.be.revertedWithCustomError(errorContract, error)
      .withArgs(...args);

    expect(await marketToken.balanceOf(user1.address)).eq(fundingBalance);
    expect(await marketToken.balanceOf(ethUsdGlvAddress)).eq(actualBalance);
    expect(await glvToken.tokenBalances(market.marketToken)).eq(recordedBalance);
    expect(await glvToken.totalSupply()).eq(supply);
    const nextState = await glvDonationHandler.getGlvDonationState(ethUsdGlvAddress, market.marketToken);
    expect(nextState.donatedAmount).eq(state.donatedAmount);
  }

  it("uses the minimized holdings value for the donation limit and the maximized value for events", async () => {
    await setupDonation();
    // Pre-donation GLV value: [$99,990, $100,010]; donated GM price: [$0.9999, $1.0001].
    await expectDonationRevertWithoutAccountingChanges(
      ethUsdMarket,
      getSpreadOracleParams(),
      glvDonationHandler,
      "MaxGlvDonationFactorExceeded",
      [ethUsdGlvAddress, ethUsdMarket.marketToken, expandDecimals(10001, 27), expandDecimals(9999, 27)]
    );

    const receipt = await donate({ ...getSpreadOracleParams(), amount: expandDecimals(9, 18) });
    const logs = parseLogs(fixture, receipt);
    const event = getEventData(logs, "GlvDonation");
    const valueEvent = getEventData(logs, "GlvValueUpdated");
    expect(event.maxDonationUsd).eq(expandDecimals(9999, 27)); // $9.999, based on the minimum
    expect(event.donationUsd).eq(expandDecimals(90009, 26)); // $9.0009, based on the maximum
    expect(event.glvValue).eq(expandDecimals(1000190009, 26)); // $100,010 + $9.0009
    expect(event.glvTokenPriceUsed).eq(false);
    expect(valueEvent.value).eq(event.glvValue);
    expect(valueEvent.supply).eq(expandDecimals(100000, 18));

    const [, maxGlvValue] = await glvReader.getGlvTokenPriceForDeposit(
      dataStore.address,
      [ethUsdMarket.marketToken, solUsdMarket.marketToken],
      [getSpreadPrices().indexTokenPrice, getMarketPrices(600).indexTokenPrice],
      getSpreadPrices().longTokenPrice,
      getSpreadPrices().shortTokenPrice,
      ethUsdGlvAddress,
      true
    );
    expect(event.glvValue).eq(maxGlvValue);
  });

  it("uses the signed GLV minimum for the limit while preserving maximum-based event valuation", async () => {
    await setupDonation();
    const oracleParams = await getSignedGlvOracleParams(9999, 10001);

    await expectDonationRevertWithoutAccountingChanges(
      ethUsdMarket,
      oracleParams,
      glvDonationHandler,
      "MaxGlvDonationFactorExceeded",
      [ethUsdGlvAddress, ethUsdMarket.marketToken, expandDecimals(10, 30), expandDecimals(9999, 27)]
    );

    // Exact conservative limit: $9.999. This must remain accepted.
    const receipt = await donate({ ...oracleParams, amount: expandDecimals(9999, 15) });
    const logs = parseLogs(fixture, receipt);
    const event = getEventData(logs, "GlvDonation");
    expect(event.maxDonationUsd).eq(expandDecimals(9999, 27));
    expect(event.donationUsd).eq(event.maxDonationUsd);
    expect(event.glvValue).eq(expandDecimals(100019999, 27)); // $100,010 + $9.999
    expect(event.glvTokenPriceUsed).eq(true);
    expect(getEventData(logs, "GlvValueUpdated").value).eq(event.glvValue);
  });

  for (const useSignedGlvPrice of [false, true]) {
    it(`rejects a negative minimized market value with ${
      useSignedGlvPrice ? "signed" : "holdings-based"
    } GLV pricing`, async () => {
      await setupDonation();
      // Construct a distressed state: impact liabilities produce a -$33 minimum
      // and +$33 maximum. Positive maximum valuation must not mask the negative minimum.
      await dataStore.setUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken), expandDecimals(22, 18));
      expect(await getPoolValue(ethUsdMarket, getSpreadPrices(), false)).eq(expandDecimals(33, 30).mul(-1));
      expect(await getPoolValue(ethUsdMarket, getSpreadPrices(), true)).eq(expandDecimals(33, 30));

      let oracleParams: any = getSpreadOracleParams();
      if (useSignedGlvPrice) {
        oracleParams = await getSignedGlvOracleParams();
        oracleParams.minPrices[0] = expandDecimals(4999, 4);
        oracleParams.maxPrices[0] = expandDecimals(5001, 4);
      }
      await expectDonationRevertWithoutAccountingChanges(
        ethUsdMarket,
        oracleParams,
        errorsContract,
        "GlvNegativeMarketPoolValue",
        [ethUsdGlvAddress, ethUsdMarket.marketToken]
      );
    });
  }

  it("rejects a negative minimized market value when the GLV has no recorded GM balance", async () => {
    await setupDonation();
    await handleDeposit(fixture, {
      create: {
        account: user1,
        receiver: user1,
        market: solUsdMarket,
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
      execute: {
        tokens: [wnt.address, usdc.address, sol.address],
        precisions: [8, 18, 8],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)],
      },
    });
    await configureDonation({ market: solUsdMarket });
    const marketToken = await contractAt("MarketToken", solUsdMarket.marketToken);
    await marketToken.connect(user1).approve(glvDonationHandler.address, ethers.constants.MaxUint256);
    const glvToken = await contractAt("GlvToken", ethUsdGlvAddress);
    expect(await glvToken.tokenBalances(solUsdMarket.marketToken)).eq(0);

    // Approximately $10,000 of index-token impact liabilities against $10,000 of assets.
    await dataStore.setUint(
      keys.positionImpactPoolAmountKey(solUsdMarket.marketToken),
      expandDecimals(10000, 18).div(600)
    );
    const prices = getMarketPrices(600);
    prices.indexTokenPrice.min = expandDecimals(599, 12);
    prices.indexTokenPrice.max = expandDecimals(601, 12);
    expect(await getPoolValue(solUsdMarket, prices, false)).lt(0);
    expect(await getPoolValue(solUsdMarket, prices, true)).gt(0);

    // The aggregate minimum skips the zero-balance market, so the handler must check it separately.
    const [, minGlvValue] = await glvReader.getGlvTokenPriceForDeposit(
      dataStore.address,
      [ethUsdMarket.marketToken, solUsdMarket.marketToken],
      [getMarketPrices(5000).indexTokenPrice, prices.indexTokenPrice],
      prices.longTokenPrice,
      prices.shortTokenPrice,
      ethUsdGlvAddress,
      false
    );
    expect(minGlvValue).eq(expandDecimals(100000, 30));
    await expectDonationRevertWithoutAccountingChanges(
      solUsdMarket,
      {
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(599, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(601, 4)],
      },
      errorsContract,
      "GlvNegativeMarketPoolValue",
      [ethUsdGlvAddress, solUsdMarket.marketToken]
    );
  });

  it("continues using the maximized market value for the USD balance cap with a price spread", async () => {
    await setupDonation();
    const maxBalanceUsd = expandDecimals(1000190009, 26); // Upper post-donation value: $100,019.0009
    await dataStore.setUint(
      keys.glvMaxMarketTokenBalanceUsdKey(ethUsdGlvAddress, ethUsdMarket.marketToken),
      maxBalanceUsd.sub(1)
    );

    await expectDonationRevertWithoutAccountingChanges(
      ethUsdMarket,
      { ...getSpreadOracleParams(), amount: expandDecimals(9, 18) },
      errorsContract,
      "GlvMaxMarketTokenBalanceUsdExceeded",
      [ethUsdGlvAddress, ethUsdMarket.marketToken, maxBalanceUsd.sub(1), maxBalanceUsd]
    );
  });

  it("validates and stores per-GLV-market configuration", async () => {
    await expect(
      glvDonationHandler
        .connect(user2)
        .setGlvDonationConfig(
          ethUsdGlvAddress,
          ethUsdMarket.marketToken,
          user1.address,
          maxDonationFactor,
          donationPeriodDuration,
          maxDonationAmountPerPeriod,
          true
        )
    )
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "CONFIG_KEEPER");

    await expect(configureDonation({ glv: user2.address }))
      .to.be.revertedWithCustomError(errorsContract, "EmptyGlv")
      .withArgs(user2.address);

    await expect(configureDonation({ market: btcUsdMarket }))
      .to.be.revertedWithCustomError(errorsContract, "GlvUnsupportedMarket")
      .withArgs(ethUsdGlvAddress, btcUsdMarket.marketToken);

    await dataStore.setBool(keys.isGlvMarketDisabledKey(ethUsdGlvAddress, ethUsdMarket.marketToken), true);
    await expect(configureDonation())
      .to.be.revertedWithCustomError(errorsContract, "GlvDisabledMarket")
      .withArgs(ethUsdGlvAddress, ethUsdMarket.marketToken);
    await dataStore.setBool(keys.isGlvMarketDisabledKey(ethUsdGlvAddress, ethUsdMarket.marketToken), false);

    await expect(configureDonation({ fundingAccount: ethers.constants.AddressZero }))
      .to.be.revertedWithCustomError(glvDonationHandler, "EmptyGlvDonationFundingAccount")
      .withArgs(ethUsdGlvAddress, ethUsdMarket.marketToken);

    await expect(configureDonation({ maxDonationFactor: 0 }))
      .to.be.revertedWithCustomError(glvDonationHandler, "InvalidMaxGlvDonationFactor")
      .withArgs(ethUsdGlvAddress, ethUsdMarket.marketToken, 0);

    await expect(configureDonation({ maxDonationFactor: FLOAT_PRECISION.add(1) }))
      .to.be.revertedWithCustomError(glvDonationHandler, "InvalidMaxGlvDonationFactor")
      .withArgs(ethUsdGlvAddress, ethUsdMarket.marketToken, FLOAT_PRECISION.add(1));

    await expect(configureDonation({ donationPeriodDuration: 0 }))
      .to.be.revertedWithCustomError(glvDonationHandler, "EmptyGlvDonationPeriodDuration")
      .withArgs(ethUsdGlvAddress, ethUsdMarket.marketToken);

    await expect(configureDonation({ maxDonationAmountPerPeriod: 0 }))
      .to.be.revertedWithCustomError(glvDonationHandler, "EmptyMaxGlvDonationAmountPerPeriod")
      .withArgs(ethUsdGlvAddress, ethUsdMarket.marketToken);

    const tx = await configureDonation();
    const event = getEventData(parseLogs(fixture, await tx.wait()), "SetGlvDonationConfig");
    expect(event.glv).eq(ethUsdGlvAddress);
    expect(event.market).eq(ethUsdMarket.marketToken);
    expect(event.fundingAccount).eq(user1.address);
    expect(event.maxDonationFactor).eq(maxDonationFactor);
    expect(event.donationPeriodDuration).eq(donationPeriodDuration);
    expect(event.maxDonationAmountPerPeriod).eq(maxDonationAmountPerPeriod);
    expect(event.isEnabled).eq(true);

    const config = await glvDonationHandler.getGlvDonationConfig(ethUsdGlvAddress, ethUsdMarket.marketToken);
    expect(config.fundingAccount).eq(user1.address);
    expect(config.isEnabled).eq(true);
    expect(config.maxDonationFactor).eq(maxDonationFactor);
    expect(config.donationPeriodDuration).eq(donationPeriodDuration);
    expect(config.maxDonationAmountPerPeriod).eq(maxDonationAmountPerPeriod);

    await dataStore.setBool(keys.isGlvMarketDisabledKey(ethUsdGlvAddress, ethUsdMarket.marketToken), true);
    await configureDonation({
      fundingAccount: ethers.constants.AddressZero,
      maxDonationFactor: 0,
      donationPeriodDuration: 0,
      maxDonationAmountPerPeriod: 0,
      isEnabled: false,
    });
    const disabledConfig = await glvDonationHandler.getGlvDonationConfig(ethUsdGlvAddress, ethUsdMarket.marketToken);
    expect(disabledConfig.fundingAccount).eq(ethers.constants.AddressZero);
    expect(disabledConfig.isEnabled).eq(false);
  });

  it("restricts execution and requires an existing GLV supply", async () => {
    await seedFundingAccount();
    await configureDonation();

    const marketToken = await contractAt("MarketToken", ethUsdMarket.marketToken);
    await marketToken.connect(user1).approve(glvDonationHandler.address, ethers.constants.MaxUint256);

    await expect(donate({ signer: user2 }))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "DONATION_KEEPER");

    await expect(donate()).to.be.revertedWithCustomError(errorsContract, "EmptyGlvTokenSupply");

    await seedGlv();
    await configureDonation({ isEnabled: false });
    await expect(donate())
      .to.be.revertedWithCustomError(glvDonationHandler, "GlvDonationDisabled")
      .withArgs(ethUsdGlvAddress, ethUsdMarket.marketToken);

    await configureDonation();
    await expect(donate({ amount: 0 })).to.be.revertedWithCustomError(errorsContract, "EmptyAmount");

    await dataStore.setBool(keys.isGlvMarketDisabledKey(ethUsdGlvAddress, ethUsdMarket.marketToken), true);
    await expect(donate())
      .to.be.revertedWithCustomError(errorsContract, "GlvDisabledMarket")
      .withArgs(ethUsdGlvAddress, ethUsdMarket.marketToken);
  });

  for (const afterWithdrawal of [false, true]) {
    it(`rejects bootstrap-only GLV supply ${
      afterWithdrawal ? "after the last holder withdraws" : "after the first deposit"
    }`, async () => {
      const bootstrapReceiver = { address: "0x0000000000000000000000000000000000000001" };
      const bootstrapMin = expandDecimals(1, 18);
      const glvToken = await contractAt("GlvToken", ethUsdGlvAddress);

      await seedFundingAccount();
      const marketToken = await contractAt("MarketToken", ethUsdMarket.marketToken);
      await marketToken.connect(user1).approve(glvDonationHandler.address, ethers.constants.MaxUint256);
      await configureDonation();

      // Exercise the protocol's first-deposit requirement, rather than minting dead GLV directly.
      await dataStore.setUint(keys.minGlvTokensForFirstGlvDepositKey(ethUsdGlvAddress), bootstrapMin);
      await handleGlvDeposit(fixture, {
        create: {
          receiver: bootstrapReceiver,
          longTokenAmount: expandDecimals(1, 17),
          shortTokenAmount: expandDecimals(100, 6),
          minGlvTokens: bootstrapMin,
        },
      });

      const bootstrapSupply = await glvToken.balanceOf(bootstrapReceiver.address);
      expect(await glvToken.totalSupply()).eq(bootstrapSupply);
      expect(bootstrapSupply).to.be.gt(0);

      if (afterWithdrawal) {
        const { user0 } = fixture.accounts;
        await handleGlvDeposit(fixture, {
          create: {
            account: user0,
            longTokenAmount: expandDecimals(1, 18),
            shortTokenAmount: expandDecimals(5_000, 6),
          },
        });
        const liveSupply = await glvToken.balanceOf(user0.address);
        expect(liveSupply).to.be.gt(0);
        await handleGlvWithdrawal(fixture, {
          create: { account: user0, glvTokenAmount: liveSupply },
        });
        expect(await glvToken.balanceOf(user0.address)).eq(0);
        expect(await glvToken.totalSupply()).eq(bootstrapSupply);
        expect(await glvToken.balanceOf(bootstrapReceiver.address)).eq(bootstrapSupply);
      }

      await expectDonationRevertWithoutAccountingChanges(
        ethUsdMarket,
        {},
        glvDonationHandler,
        "EmptyCirculatingGlvTokenSupply",
        []
      );

      await seedGlv();
      expect(await glvToken.totalSupply()).to.be.gt(bootstrapSupply);

      const supplyBefore = await glvToken.totalSupply();
      await donate();
      expect(await glvToken.totalSupply()).eq(supplyBefore);
      expect(await glvToken.balanceOf(bootstrapReceiver.address)).eq(bootstrapSupply);
      expect(
        (await glvDonationHandler.getGlvDonationState(ethUsdGlvAddress, ethUsdMarket.marketToken)).donatedAmount
      ).eq(donationAmount);
    });
  }

  it("donates and syncs GM atomically, lifts GLV price, and leaves GLV supply unchanged", async () => {
    const marketToken = await setupDonation();
    const glvToken = await contractAt("GlvToken", ethUsdGlvAddress);

    const initialGlvSupply = await glvToken.totalSupply();
    const initialMarketTokenSupply = await marketToken.totalSupply();
    const initialGlvBalance = await marketToken.balanceOf(ethUsdGlvAddress);
    const initialRecordedBalance = await glvToken.tokenBalances(ethUsdMarket.marketToken);

    const txReceipt = await donate();
    const logs = parseLogs(fixture, txReceipt);
    const event = getEventData(logs, "GlvDonation");
    const valueEvent = getEventData(logs, "GlvValueUpdated");

    expect(event.glv).eq(ethUsdGlvAddress);
    expect(event.market).eq(ethUsdMarket.marketToken);
    expect(event.fundingAccount).eq(user1.address);
    expect(event.amount).eq(donationAmount);
    expect(event.donationUsd).eq(expandDecimals(10, 30));
    expect(event.balanceIncrease).eq(donationAmount);
    expect(event.balanceIncreaseUsd).eq(expandDecimals(10, 30));
    expect(event.nextMarketTokenBalance).eq(initialRecordedBalance.add(donationAmount));
    expect(event.glvValue).eq(expandDecimals(100_010, 30));
    expect(event.glvSupply).eq(initialGlvSupply);
    expect(event.glvTokenPriceUsed).eq(false);
    expect(valueEvent.value).eq(event.glvValue);
    expect(valueEvent.supply).eq(initialGlvSupply);

    expect(await marketToken.balanceOf(ethUsdGlvAddress)).eq(initialGlvBalance.add(donationAmount));
    expect(await glvToken.tokenBalances(ethUsdMarket.marketToken)).eq(initialRecordedBalance.add(donationAmount));
    expect(await glvToken.totalSupply()).eq(initialGlvSupply);
    expect(await marketToken.totalSupply()).eq(initialMarketTokenSupply);
    expect(await marketToken.balanceOf(glvDonationHandler.address)).eq(0);

    const [price, value, supply] = await glvReader.getGlvTokenPrice(
      dataStore.address,
      [ethUsdMarket.marketToken, solUsdMarket.marketToken],
      [getMarketPrices(5000).indexTokenPrice, getMarketPrices(600).indexTokenPrice],
      getMarketPrices(5000).longTokenPrice,
      getMarketPrices(5000).shortTokenPrice,
      ethUsdGlvAddress,
      true
    );
    expect(price).eq(expandDecimals(10_001, 26));
    expect(value).eq(valueEvent.value);
    expect(supply).eq(initialGlvSupply);
  });

  it("enforces the per-donation factor", async () => {
    const marketToken = await setupDonation();
    const initialFundingBalance = await marketToken.balanceOf(user1.address);

    await expect(donate({ amount: donationAmount.add(1) })).to.be.revertedWithCustomError(
      glvDonationHandler,
      "MaxGlvDonationFactorExceeded"
    );

    expect(await marketToken.balanceOf(user1.address)).eq(initialFundingBalance);
    expect(await marketToken.balanceOf(ethUsdGlvAddress)).eq(expandDecimals(100_000, 18));
  });

  it("enforces the cumulative period cap and resets in the next period", async () => {
    await setupDonation();

    await donate();
    await donate();

    const thirdDonationAmount = expandDecimals(6, 18);
    const stateBefore = await glvDonationHandler.getGlvDonationState(ethUsdGlvAddress, ethUsdMarket.marketToken);
    await expect(donate({ amount: thirdDonationAmount }))
      .to.be.revertedWithCustomError(glvDonationHandler, "MaxGlvDonationAmountPerPeriodExceeded")
      .withArgs(
        ethUsdGlvAddress,
        ethUsdMarket.marketToken,
        stateBefore.periodId,
        donationAmount.mul(2).add(thirdDonationAmount),
        maxDonationAmountPerPeriod
      );

    await time.increase(donationPeriodDuration);
    await donate({ amount: thirdDonationAmount });

    const nextState = await glvDonationHandler.getGlvDonationState(ethUsdGlvAddress, ethUsdMarket.marketToken);
    expect(nextState.periodId).gt(stateBefore.periodId);
    expect(nextState.donatedAmount).eq(thirdDonationAmount);
  });

  it("resets the current quota when the donation period duration changes", async () => {
    await setupDonation();
    await donate();

    await configureDonation();
    expect((await glvDonationHandler.getGlvDonationState(ethUsdGlvAddress, ethUsdMarket.marketToken)).donatedAmount).eq(
      donationAmount
    );

    await configureDonation({ donationPeriodDuration: donationPeriodDuration * 2 });
    expect((await glvDonationHandler.getGlvDonationState(ethUsdGlvAddress, ethUsdMarket.marketToken)).donatedAmount).eq(
      0
    );

    await configureDonation();
    expect((await glvDonationHandler.getGlvDonationState(ethUsdGlvAddress, ethUsdMarket.marketToken)).donatedAmount).eq(
      0
    );

    await donate();
    expect((await glvDonationHandler.getGlvDonationState(ethUsdGlvAddress, ethUsdMarket.marketToken)).donatedAmount).eq(
      donationAmount
    );
  });

  it("reverts amount and USD market-balance cap violations without transferring or syncing", async () => {
    const marketToken = await setupDonation();
    const glvToken = await contractAt("GlvToken", ethUsdGlvAddress);
    const initialFundingBalance = await marketToken.balanceOf(user1.address);
    const initialGlvBalance = await marketToken.balanceOf(ethUsdGlvAddress);
    const initialRecordedBalance = await glvToken.tokenBalances(ethUsdMarket.marketToken);

    await dataStore.setUint(
      keys.glvMaxMarketTokenBalanceAmountKey(ethUsdGlvAddress, ethUsdMarket.marketToken),
      initialRecordedBalance.add(donationAmount).sub(1)
    );
    await expect(donate())
      .to.be.revertedWithCustomError(errorsContract, "GlvMaxMarketTokenBalanceAmountExceeded")
      .withArgs(
        ethUsdGlvAddress,
        ethUsdMarket.marketToken,
        initialRecordedBalance.add(donationAmount).sub(1),
        initialRecordedBalance.add(donationAmount)
      );

    await dataStore.setUint(keys.glvMaxMarketTokenBalanceAmountKey(ethUsdGlvAddress, ethUsdMarket.marketToken), 0);
    await dataStore.setUint(
      keys.glvMaxMarketTokenBalanceUsdKey(ethUsdGlvAddress, ethUsdMarket.marketToken),
      expandDecimals(100_010, 30).sub(1)
    );
    await expect(donate())
      .to.be.revertedWithCustomError(errorsContract, "GlvMaxMarketTokenBalanceUsdExceeded")
      .withArgs(
        ethUsdGlvAddress,
        ethUsdMarket.marketToken,
        expandDecimals(100_010, 30).sub(1),
        expandDecimals(100_010, 30)
      );

    expect(await marketToken.balanceOf(user1.address)).eq(initialFundingBalance);
    expect(await marketToken.balanceOf(ethUsdGlvAddress)).eq(initialGlvBalance);
    expect(await glvToken.tokenBalances(ethUsdMarket.marketToken)).eq(initialRecordedBalance);
    const state = await glvDonationHandler.getGlvDonationState(ethUsdGlvAddress, ethUsdMarket.marketToken);
    expect(state.donatedAmount).eq(0);
  });

  it("includes a pre-existing direct GM transfer when syncing and emitting GLV value", async () => {
    const marketToken = await setupDonation();
    const glvToken = await contractAt("GlvToken", ethUsdGlvAddress);
    const directTransferAmount = expandDecimals(1, 18);
    const initialRecordedBalance = await glvToken.tokenBalances(ethUsdMarket.marketToken);

    await marketToken.connect(user1).transfer(ethUsdGlvAddress, directTransferAmount);
    expect(await marketToken.balanceOf(ethUsdGlvAddress)).eq(initialRecordedBalance.add(directTransferAmount));
    expect(await glvToken.tokenBalances(ethUsdMarket.marketToken)).eq(initialRecordedBalance);

    const txReceipt = await donate();
    const event = getEventData(parseLogs(fixture, txReceipt), "GlvDonation");
    expect(event.amount).eq(donationAmount);
    expect(event.balanceIncrease).eq(donationAmount.add(directTransferAmount));
    expect(event.balanceIncreaseUsd).eq(expandDecimals(11, 30));
    expect(event.glvValue).eq(expandDecimals(100_011, 30));
    expect(await glvToken.tokenBalances(ethUsdMarket.marketToken)).eq(
      initialRecordedBalance.add(directTransferAmount).add(donationAmount)
    );

    const state = await glvDonationHandler.getGlvDonationState(ethUsdGlvAddress, ethUsdMarket.marketToken);
    expect(state.donatedAmount).eq(donationAmount);
  });

  it("emits the post-donation GLV value when a signed GLV token price is supplied", async () => {
    await setupDonation();

    await setBytes32IfDifferent(keys.oracleTypeKey(ethUsdGlvAddress), TOKEN_ORACLE_TYPES.DEFAULT, "oracle type");
    await dataStore.setAddress(
      keys.oracleProviderForTokenKey(oracle.address, ethUsdGlvAddress),
      chainlinkDataStreamProvider.address
    );

    const txReceipt = await donate({
      tokens: [wnt.address, usdc.address, ethUsdGlvAddress],
      precisions: [8, 18, 8],
      minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(1, 4)],
      maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(1, 4)],
    });
    const logs = parseLogs(fixture, txReceipt);
    const event = getEventData(logs, "GlvDonation");
    const valueEvent = getEventData(logs, "GlvValueUpdated");

    expect(event.glvTokenPriceUsed).eq(true);
    expect(event.glvValue).eq(expandDecimals(100_010, 30));
    expect(valueEvent.value).eq(expandDecimals(100_010, 30));
    expect(valueEvent.supply).eq(expandDecimals(100_000, 18));
  });
});
