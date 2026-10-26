import { expect } from "chai";
import { ethers } from "hardhat";

import { contractAt, deployContract } from "../../utils/deploy";
import { handleDeposit } from "../../utils/deposit";
import { errorsContract } from "../../utils/error";
import { getEventDataArray, parseLogs } from "../../utils/event";
import { deployFixture } from "../../utils/fixture";
import { handleGlvDeposit } from "../../utils/glv";
import { hashString } from "../../utils/hash";
import * as keys from "../../utils/keys";
import { expandDecimals, percentageToFloat } from "../../utils/math";
import { getPoolAmount } from "../../utils/market";
import { getOracleParams, TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import { grantRole, revokeRole } from "../../utils/role";

describe("DonationBatcher", () => {
  let fixture, batcher;
  let wallet, user0, user1, user2;
  let roleStore, dataStore, oracle, marketPoolDonationHandler, glvDonationHandler;
  let ethUsdSingleTokenMarket, btcUsdSingleTokenMarket, ethUsdMarket, ethUsdGlvAddress;
  let usdc, wnt, wbtc, sol, gmToken, glvToken;

  const seedAmount = expandDecimals(100_000, 6);
  const poolDonationAmount = expandDecimals(10, 6);
  const glvDonationAmount = expandDecimals(10, 18);
  const factor = percentageToFloat("0.01%");
  const duration = 24 * 60 * 60;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0, user1, user2 } = fixture.accounts);
    ({
      roleStore,
      dataStore,
      oracle,
      marketPoolDonationHandler,
      glvDonationHandler,
      ethUsdSingleTokenMarket,
      btcUsdSingleTokenMarket,
      ethUsdMarket,
      ethUsdGlvAddress,
      usdc,
      wnt,
      wbtc,
      sol,
    } = fixture.contracts);
    batcher = await ethers.getContract("DonationBatcher");
  });

  async function poolCall(market = ethUsdSingleTokenMarket, amount = poolDonationAmount) {
    const isBtcMarket = market.indexToken.toLowerCase() === wbtc.address.toLowerCase();
    const indexTokenPrecision = isBtcMarket ? 20 : 8;
    const indexTokenPrice = isBtcMarket ? expandDecimals(50_000, 2) : expandDecimals(5_000, 4);
    const tokens = [market.indexToken, market.longToken];
    const prices = [indexTokenPrice, expandDecimals(1, 6)];
    const block = await ethers.provider.getBlock("latest");
    const oracleParams = await getOracleParams({
      oracleSalt: fixture.props.oracleSalt,
      signerIndexes: fixture.props.signerIndexes,
      signers: fixture.accounts.signers,
      minOracleBlockNumbers: Array(tokens.length).fill(block.number),
      maxOracleBlockNumbers: Array(tokens.length).fill(block.number),
      oracleTimestamps: Array(tokens.length).fill(block.timestamp),
      blockHashes: Array(tokens.length).fill(block.hash),
      tokenOracleTypes: Array(tokens.length).fill(TOKEN_ORACLE_TYPES.DEFAULT),
      tokens,
      precisions: [indexTokenPrecision, 18],
      minPrices: prices,
      maxPrices: prices,
      dataStreamTokens: [],
      dataStreamData: [],
      priceFeedTokens: [],
    });

    return {
      target: marketPoolDonationHandler.address,
      data: marketPoolDonationHandler.interface.encodeFunctionData("donate", [
        market.marketToken,
        amount,
        oracleParams,
      ]),
    };
  }

  async function glvCall(amount = glvDonationAmount, glv = ethUsdGlvAddress, oracleOverrides: any = {}) {
    const prices = [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];
    const block = await ethers.provider.getBlock("latest");
    const tokens = oracleOverrides.tokens || [wnt.address, usdc.address, sol.address];
    const oracleParams = await getOracleParams({
      oracleSalt: fixture.props.oracleSalt,
      signerIndexes: fixture.props.signerIndexes,
      signers: fixture.accounts.signers,
      minOracleBlockNumbers: Array(tokens.length).fill(block.number),
      maxOracleBlockNumbers: Array(tokens.length).fill(block.number),
      oracleTimestamps: Array(tokens.length).fill(block.timestamp),
      blockHashes: Array(tokens.length).fill(block.hash),
      tokenOracleTypes: Array(tokens.length).fill(TOKEN_ORACLE_TYPES.DEFAULT),
      tokens,
      precisions: [8, 18, 8],
      minPrices: prices,
      maxPrices: prices,
      dataStreamTokens: [],
      dataStreamData: [],
      priceFeedTokens: [],
      ...oracleOverrides,
    });
    return {
      target: glvDonationHandler.address,
      data: glvDonationHandler.interface.encodeFunctionData("donate", [
        glv,
        ethUsdMarket.marketToken,
        amount,
        oracleParams,
      ]),
    };
  }

  async function configureGlv(glv = ethUsdGlvAddress) {
    await glvDonationHandler.setGlvDonationConfig(
      glv,
      ethUsdMarket.marketToken,
      user1.address,
      factor,
      duration,
      expandDecimals(25, 18),
      true
    );
  }

  async function setupDonations() {
    for (const market of [ethUsdSingleTokenMarket, btcUsdSingleTokenMarket]) {
      const prices = [expandDecimals(5000, 4), expandDecimals(50000, 2), expandDecimals(1, 6)];
      await handleDeposit(fixture, {
        create: { market, shortTokenAmount: seedAmount },
        execute: {
          tokens: [wnt.address, fixture.contracts.wbtc.address, usdc.address],
          precisions: [8, 20, 18],
          minPrices: prices,
          maxPrices: prices,
        },
      });
      await marketPoolDonationHandler.setMarketPoolDonationConfig(
        market.marketToken,
        user0.address,
        factor,
        duration,
        expandDecimals(25, 6),
        true
      );
    }
    await usdc.mint(user0.address, expandDecimals(100, 6));
    await usdc.connect(user0).approve(marketPoolDonationHandler.address, ethers.constants.MaxUint256);
    await handleGlvDeposit(fixture, {
      create: { longTokenAmount: expandDecimals(10, 18), shortTokenAmount: expandDecimals(50_000, 6) },
    });
    await handleDeposit(fixture, {
      create: {
        account: user1,
        receiver: user1,
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5_000, 6),
      },
    });
    await configureGlv();
    gmToken = await contractAt("MarketToken", ethUsdMarket.marketToken);
    glvToken = await contractAt("GlvToken", ethUsdGlvAddress);
    await gmToken.connect(user1).approve(glvDonationHandler.address, ethers.constants.MaxUint256);
  }

  async function snapshot() {
    return {
      fundingUsdc: await usdc.balanceOf(user0.address),
      fundingGm: await gmToken.balanceOf(user1.address),
      pools: await Promise.all(
        [ethUsdSingleTokenMarket, btcUsdSingleTokenMarket].map(async (market) => ({
          actual: await usdc.balanceOf(market.marketToken),
          accounted: await getPoolAmount(dataStore, market.marketToken, usdc.address),
          state: await marketPoolDonationHandler.getMarketPoolDonationState(market.marketToken),
        }))
      ),
      glvActual: await gmToken.balanceOf(ethUsdGlvAddress),
      glvRecorded: await glvToken.tokenBalances(ethUsdMarket.marketToken),
      glvState: await glvDonationHandler.getGlvDonationState(ethUsdGlvAddress, ethUsdMarket.marketToken),
      glvSupply: await glvToken.totalSupply(),
      gmSupply: await gmToken.totalSupply(),
      oraclePricesCount: await oracle.getTokensWithPricesCount(),
      reentrancyStatus: await dataStore.getUint(hashString("REENTRANCY_GUARD_STATUS")),
    };
  }

  it("deploys with fixed handlers and only the donation keeper role", async () => {
    expect(await batcher.marketPoolDonationHandler()).eq(marketPoolDonationHandler.address);
    expect(await batcher.glvDonationHandler()).eq(glvDonationHandler.address);
    expect(await batcher.roleStore()).eq(roleStore.address);
    const role = await batcher.DONATION_KEEPER();
    expect(role).eq(await marketPoolDonationHandler.DONATION_KEEPER());
    expect(role).eq(await glvDonationHandler.DONATION_KEEPER());
    expect(await roleStore.hasRole(batcher.address, role)).eq(true);
    expect(await roleStore.hasRole(batcher.address, hashString("CONTROLLER"))).eq(false);
  });

  it("rejects missing, non-contract and duplicate handler addresses", async () => {
    const factory = await ethers.getContractFactory("DonationBatcher");
    for (const [gm, glv, invalid] of [
      [ethers.constants.AddressZero, glvDonationHandler.address, ethers.constants.AddressZero],
      [user1.address, glvDonationHandler.address, user1.address],
      [marketPoolDonationHandler.address, ethers.constants.AddressZero, ethers.constants.AddressZero],
      [marketPoolDonationHandler.address, user1.address, user1.address],
      [marketPoolDonationHandler.address, marketPoolDonationHandler.address, marketPoolDonationHandler.address],
    ]) {
      await expect(factory.deploy(roleStore.address, gm, glv))
        .to.be.revertedWithCustomError(batcher, "InvalidDonationHandler")
        .withArgs(invalid);
    }
  });

  it("rejects unauthorized callers and respects caller role revocation", async () => {
    await expect(batcher.connect(user2).multicall([await poolCall()]))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user2.address, "DONATION_KEEPER");
    await revokeRole(roleStore, wallet.address, "DONATION_KEEPER");
    await expect(batcher.multicall([await poolCall()]))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(wallet.address, "DONATION_KEEPER");
  });

  it("rejects empty batches and arbitrary targets", async () => {
    await expect(batcher.multicall([])).to.be.revertedWithCustomError(batcher, "EmptyDonationBatch");
    for (const target of [user1.address, usdc.address, batcher.address]) {
      await expect(batcher.multicall([{ ...(await poolCall()), target }]))
        .to.be.revertedWithCustomError(batcher, "InvalidDonationTarget")
        .withArgs(target);
    }
  });

  it("rejects short calldata, unknown selectors, configuration calls and mismatched handlers", async () => {
    const configData = marketPoolDonationHandler.interface.encodeFunctionData("setMarketPoolDonationConfig", [
      ethUsdSingleTokenMarket.marketToken,
      user0.address,
      factor,
      duration,
      expandDecimals(25, 6),
      true,
    ]);
    for (const data of ["0x", "0x12", "0x123456", "0x12345678", configData]) {
      await expect(
        batcher.multicall([{ target: marketPoolDonationHandler.address, data }])
      ).to.be.revertedWithCustomError(batcher, "InvalidDonationSelector");
    }
    await expect(
      batcher.multicall([{ ...(await poolCall()), target: glvDonationHandler.address }])
    ).to.be.revertedWithCustomError(batcher, "InvalidDonationSelector");
    const glvConfigData = glvDonationHandler.interface.encodeFunctionData("setGlvDonationConfig", [
      ethUsdGlvAddress,
      ethUsdMarket.marketToken,
      user1.address,
      factor,
      duration,
      expandDecimals(25, 18),
      true,
    ]);
    await expect(
      batcher.multicall([{ target: glvDonationHandler.address, data: glvConfigData }])
    ).to.be.revertedWithCustomError(batcher, "InvalidDonationSelector");
  });

  it("rejects native token value", async () => {
    const data = batcher.interface.encodeFunctionData("multicall", [[await poolCall()]]);
    await expect(wallet.sendTransaction({ to: batcher.address, data, value: 1 })).to.be.reverted;
  });

  it("batches donations to distinct GM pools", async () => {
    await setupDonations();
    const supplies = await Promise.all(
      [ethUsdSingleTokenMarket, btcUsdSingleTokenMarket].map(async (market) =>
        (await contractAt("MarketToken", market.marketToken)).totalSupply()
      )
    );
    await expect(batcher.multicall([await poolCall(), await poolCall(btcUsdSingleTokenMarket)]))
      .to.emit(batcher, "DonationBatchExecuted")
      .withArgs(wallet.address, 2);
    for (const [i, market] of [ethUsdSingleTokenMarket, btcUsdSingleTokenMarket].entries()) {
      expect(await getPoolAmount(dataStore, market.marketToken, usdc.address)).eq(seedAmount.add(poolDonationAmount));
      expect(await usdc.balanceOf(market.marketToken)).eq(seedAmount.add(poolDonationAmount));
      expect(await (await contractAt("MarketToken", market.marketToken)).totalSupply()).eq(supplies[i]);
    }
    expect(await usdc.balanceOf(batcher.address)).eq(0);
    expect(await usdc.allowance(user0.address, batcher.address)).eq(0);
  });

  it("executes interleaved GM and GLV donations in order and clears oracle prices between calls", async () => {
    await setupDonations();
    const before = await snapshot();
    const glv = await glvCall();
    const tx = await batcher.multicall([glv, await poolCall(), glv, await poolCall(btcUsdSingleTokenMarket)]);
    const logs = parseLogs(fixture, await tx.wait());
    expect(
      logs
        .map((log) => log.parsedEventInfo?.eventName)
        .filter((name) => ["MarketPoolDonation", "GlvDonation"].includes(name))
    ).deep.eq(["GlvDonation", "MarketPoolDonation", "GlvDonation", "MarketPoolDonation"]);
    const values = getEventDataArray(logs, "GlvValueUpdated");
    expect(values.length).eq(2);
    expect(values[1].value).eq(values[0].value.add(expandDecimals(10, 30)));
    const after = await snapshot();
    expect(after.glvActual).eq(before.glvActual.add(glvDonationAmount.mul(2)));
    expect(after.glvRecorded).eq(after.glvActual);
    expect(after.fundingGm).eq(before.fundingGm.sub(glvDonationAmount.mul(2)));
    expect(after.fundingUsdc).eq(before.fundingUsdc.sub(poolDonationAmount.mul(2)));
    expect(after.glvSupply).eq(before.glvSupply);
    expect(after.gmSupply).eq(before.gmSupply);
    expect(after.oraclePricesCount).eq(0);
    expect(after.reentrancyStatus).eq(0);
    expect(await gmToken.balanceOf(batcher.address)).eq(0);
    expect(await gmToken.allowance(user1.address, batcher.address)).eq(0);
  });

  it("supports a GLV-only batch donating to distinct GLVs", async () => {
    await setupDonations();
    const { glvFactory, glvShiftHandler } = fixture.contracts;
    const args = [wnt.address, usdc.address, ethers.utils.id("donation-batcher-glv"), "Other GLV", "OGLV"];
    const otherGlv = (await glvFactory.callStatic.createGlv(...args)).glvToken;
    await glvFactory.createGlv(...args);
    await glvShiftHandler.addMarketToGlv(otherGlv, ethUsdMarket.marketToken);
    await handleGlvDeposit(fixture, {
      create: { glv: otherGlv, longTokenAmount: expandDecimals(10, 18), shortTokenAmount: expandDecimals(50_000, 6) },
    });
    await configureGlv(otherGlv);
    const otherToken = await contractAt("GlvToken", otherGlv);
    const supply = await otherToken.totalSupply();
    const balance = await otherToken.tokenBalances(ethUsdMarket.marketToken);
    await batcher.multicall([await glvCall(), await glvCall(glvDonationAmount, otherGlv)]);
    expect(await otherToken.totalSupply()).eq(supply);
    expect(await otherToken.tokenBalances(ethUsdMarket.marketToken)).eq(balance.add(glvDonationAmount));
    expect(await gmToken.balanceOf(otherGlv)).eq(balance.add(glvDonationAmount));
    expect((await glvDonationHandler.getGlvDonationState(otherGlv, ethUsdMarket.marketToken)).donatedAmount).eq(
      glvDonationAmount
    );
    expect((await glvDonationHandler.getGlvDonationState(ethUsdGlvAddress, ethUsdMarket.marketToken)).donatedAmount).eq(
      glvDonationAmount
    );
  });

  it("cannot bypass per-donation limits", async () => {
    await setupDonations();
    const before = await snapshot();
    await expect(batcher.multicall([await poolCall(ethUsdSingleTokenMarket, poolDonationAmount.add(1))]))
      .to.be.revertedWithCustomError(marketPoolDonationHandler, "MaxMarketPoolDonationFactorExceeded")
      .withArgs(ethUsdSingleTokenMarket.marketToken, poolDonationAmount.add(1), poolDonationAmount);
    await expect(batcher.multicall([await glvCall(glvDonationAmount.add(1))])).to.be.revertedWithCustomError(
      glvDonationHandler,
      "MaxGlvDonationFactorExceeded"
    );
    expect(await snapshot()).deep.eq(before);
  });

  it("accumulates repeated donations against the GM quota and rolls back mixed batches on failure", async () => {
    await setupDonations();
    const before = await snapshot();
    await expect(
      batcher.multicall([await poolCall(), await glvCall(), await poolCall(), await poolCall()])
    ).to.be.revertedWithCustomError(marketPoolDonationHandler, "MaxMarketPoolDonationAmountPerPeriodExceeded");
    expect(await snapshot()).deep.eq(before);
    // A successful retry also proves that reverted calls leave no reentrancy / oracle lock behind.
    await batcher.multicall([await poolCall(), await poolCall()]);
    expect(
      (await marketPoolDonationHandler.getMarketPoolDonationState(ethUsdSingleTokenMarket.marketToken)).donatedAmount
    ).eq(poolDonationAmount.mul(2));
  });

  it("accumulates repeated donations against the GLV quota and rolls back earlier GM donations", async () => {
    await setupDonations();
    const before = await snapshot();
    const glv = await glvCall();
    await expect(batcher.multicall([await poolCall(), glv, glv, glv])).to.be.revertedWithCustomError(
      glvDonationHandler,
      "MaxGlvDonationAmountPerPeriodExceeded"
    );
    expect(await snapshot()).deep.eq(before);
  });

  it("rolls back transfers, syncs and quota usage when a later GLV balance cap fails", async () => {
    await setupDonations();
    const before = await snapshot();
    await dataStore.setUint(
      keys.glvMaxMarketTokenBalanceAmountKey(ethUsdGlvAddress, ethUsdMarket.marketToken),
      before.glvRecorded
    );
    await expect(batcher.multicall([await poolCall(), await glvCall()])).to.be.revertedWithCustomError(
      errorsContract,
      "GlvMaxMarketTokenBalanceAmountExceeded"
    );
    expect(await snapshot()).deep.eq(before);
  });

  it("bubbles allowance failures and rolls back previous GLV donations", async () => {
    await setupDonations();
    await usdc.connect(user0).approve(marketPoolDonationHandler.address, 0);
    const before = await snapshot();
    await expect(batcher.multicall([await glvCall(), await poolCall()])).to.be.revertedWith(
      "ERC20: insufficient allowance"
    );
    expect(await snapshot()).deep.eq(before);
  });

  it("rolls back earlier donations when the last GM pool exceeds its balance cap", async () => {
    await setupDonations();
    await dataStore.setUint(
      keys.maxPoolAmountKey(btcUsdSingleTokenMarket.marketToken, usdc.address),
      seedAmount.div(2)
    );
    const before = await snapshot();
    await expect(
      batcher.multicall([await poolCall(), await glvCall(), await poolCall(btcUsdSingleTokenMarket)])
    ).to.be.revertedWithCustomError(errorsContract, "MaxPoolAmountExceeded");
    expect(await snapshot()).deep.eq(before);
  });

  it("rolls back earlier donations when a GLV call is missing required oracle prices", async () => {
    await setupDonations();
    const before = await snapshot();
    const invalidOracleCall = await glvCall(glvDonationAmount, ethUsdGlvAddress, {
      tokens: [wnt.address],
      precisions: [8],
      minPrices: [expandDecimals(5000, 4)],
      maxPrices: [expandDecimals(5000, 4)],
    });
    await expect(
      batcher.multicall([await poolCall(), await glvCall(), invalidOracleCall])
    ).to.be.revertedWithCustomError(errorsContract, "EmptyPrimaryPrice");
    expect(await snapshot()).deep.eq(before);
  });

  it("rolls back previous donations on invalid subsequent calldata or target", async () => {
    await setupDonations();
    const before = await snapshot();
    await expect(
      batcher.multicall([await poolCall(), { target: usdc.address, data: "0x" }])
    ).to.be.revertedWithCustomError(batcher, "InvalidDonationTarget");
    const truncated = {
      target: marketPoolDonationHandler.address,
      data: marketPoolDonationHandler.interface.getSighash("donate"),
    };
    await expect(batcher.multicall([await poolCall(), truncated])).to.be.reverted;
    expect(await snapshot()).deep.eq(before);
  });

  it("cannot donate when the batcher's keeper role is revoked", async () => {
    await setupDonations();
    await revokeRole(roleStore, batcher.address, "DONATION_KEEPER");
    const before = await snapshot();
    for (const call of [await poolCall(), await glvCall()]) {
      await expect(batcher.multicall([call]))
        .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
        .withArgs(batcher.address, "DONATION_KEEPER");
    }
    expect(await snapshot()).deep.eq(before);
  });

  it("blocks reentrant batches even from an authorized downstream contract", async () => {
    const handler = await deployContract("MockReentrantDonationHandler", []);
    const reentrantBatcher = await deployContract("DonationBatcher", [
      roleStore.address,
      handler.address,
      glvDonationHandler.address,
    ]);
    await grantRole(roleStore, handler.address, "DONATION_KEEPER");
    const calls = [{ ...(await poolCall()), target: handler.address }];
    await handler.setCallback(
      reentrantBatcher.address,
      reentrantBatcher.interface.encodeFunctionData("multicall", [calls])
    );
    await expect(reentrantBatcher.multicall(calls)).to.be.revertedWith("ReentrancyGuard: reentrant call");
  });
});
