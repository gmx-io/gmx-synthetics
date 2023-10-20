import { expect } from "chai";

import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { getBalanceOf } from "../../utils/token";
import { getExecuteParams } from "../../utils/exchange";
import { prices } from "../../utils/prices";

import { grantRole } from "../../utils/role";
import { getDepositCount, executeDeposit } from "../../utils/deposit";

import { errorsContract } from "../../utils/error";

describe("GlpMigrator", () => {
  let fixture;
  let user0;
  let roleStore,
    dataStore,
    eventEmitter,
    depositVault,
    depositHandler,
    externalHandler,
    marketStoreUtils,
    stakedGlp,
    glpVault,
    glpTimelock,
    glpRewardRouter,
    glpMigrator,
    ethUsdMarket,
    btcUsdMarket,
    wnt,
    wbtc,
    usdc;

  const getRedemptionInfo = ({
    token,
    glpAmount,
    minOut,
    receiver,
    externalCallTargets = [],
    externalCallDataList = [],
    refundTokens = [],
    refundReceivers = [],
  }) => {
    if (!receiver) {
      receiver = depositVault.address;
    }

    return {
      token,
      glpAmount,
      minOut,
      receiver,
      externalCallTargets,
      externalCallDataList,
      refundTokens,
      refundReceivers,
    };
  };

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0 } = fixture.accounts);

    ({
      roleStore,
      dataStore,
      eventEmitter,
      depositVault,
      depositHandler,
      marketStoreUtils,
      ethUsdMarket,
      btcUsdMarket,
      wnt,
      usdc,
      wbtc,
    } = fixture.contracts);

    externalHandler = await deployContract("ExternalHandler", []);
    stakedGlp = await deployContract("MintableToken", ["stakedGlp", "sGLP", 18]);
    glpVault = await deployContract("MockGlpVault", []);
    glpTimelock = await deployContract("MockGlpTimelock", []);
    glpRewardRouter = await deployContract("MockGlpRewardRouter", []);
    glpMigrator = await deployContract(
      "GlpMigrator",
      [
        roleStore.address,
        dataStore.address,
        eventEmitter.address,
        depositVault.address,
        depositHandler.address,
        externalHandler.address,
        stakedGlp.address,
        glpVault.address,
        glpTimelock.address,
        glpRewardRouter.address,
        5, // reducedMintBurnFeeBasisPoints
      ],
      {
        libraries: {
          MarketStoreUtils: marketStoreUtils.address,
        },
      }
    );

    await grantRole(roleStore, glpMigrator.address, "CONTROLLER");
  });

  it("initializes", async () => {
    expect(await glpMigrator.roleStore()).eq(roleStore.address);
    expect(await glpMigrator.dataStore()).eq(dataStore.address);
    expect(await glpMigrator.eventEmitter()).eq(eventEmitter.address);
    expect(await glpMigrator.depositVault()).eq(depositVault.address);
    expect(await glpMigrator.depositHandler()).eq(depositHandler.address);
    expect(await glpMigrator.stakedGlp()).eq(stakedGlp.address);
    expect(await glpMigrator.glpVault()).eq(glpVault.address);
    expect(await glpMigrator.glpTimelock()).eq(glpTimelock.address);
    expect(await glpMigrator.glpRewardRouter()).eq(glpRewardRouter.address);
    expect(await glpMigrator.reducedMintBurnFeeBasisPoints()).eq(5);
  });

  it("setReducedMintBurnFeeBasisPoints", async () => {
    await expect(glpMigrator.connect(user0).setReducedMintBurnFeeBasisPoints(20)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );

    await grantRole(roleStore, user0.address, "CONFIG_KEEPER");

    expect(await glpMigrator.reducedMintBurnFeeBasisPoints()).eq(5);
    await glpMigrator.connect(user0).setReducedMintBurnFeeBasisPoints(20);
    expect(await glpMigrator.reducedMintBurnFeeBasisPoints()).eq(20);
  });

  it("migrate", async () => {
    await stakedGlp.mint(user0.address, expandDecimals(12_000, 18));
    await stakedGlp.connect(user0).approve(glpMigrator.address, expandDecimals(12_000, 18));
    await wnt.mint(glpRewardRouter.address, expandDecimals(2, 18));
    await usdc.mint(glpRewardRouter.address, expandDecimals(2000, 6));
    await wbtc.mint(glpRewardRouter.address, expandDecimals(1, 7));

    expect(await getDepositCount(dataStore)).eq(0);

    await expect(
      glpMigrator.connect(user0).migrate(
        expandDecimals(12_000, 18), // 12,000 GLP
        [
          {
            market: ethUsdMarket.marketToken,
            long: getRedemptionInfo({
              token: wnt.address,
              glpAmount: expandDecimals(5000, 18),
              minOut: expandDecimals(1, 18), // 1 ETH
            }),
            short: getRedemptionInfo({
              token: usdc.address,
              glpAmount: expandDecimals(1000, 18),
              minOut: expandDecimals(1000, 6),
            }),
            minMarketTokens: expandDecimals(6000, 18),
            executionFee: "100000000000000",
          },
          {
            market: btcUsdMarket.marketToken,
            long: getRedemptionInfo({
              token: wbtc.address,
              glpAmount: expandDecimals(5000, 18),
              minOut: expandDecimals(1, 7), // 0.1 WBTC
            }),
            short: getRedemptionInfo({
              token: usdc.address,
              glpAmount: expandDecimals(500, 18),
              minOut: expandDecimals(500, 6),
            }),
            minMarketTokens: expandDecimals(5500, 18),
            executionFee: "100000000000000",
          },
        ],
        { value: "200000000000000" }
      )
    ).to.be.revertedWithCustomError(errorsContract, "InvalidGlpAmount");

    await expect(
      glpMigrator.connect(user0).migrate(
        expandDecimals(11_500, 18), // 11,500 GLP
        [
          {
            market: ethUsdMarket.marketToken,
            long: getRedemptionInfo({
              token: wnt.address,
              glpAmount: expandDecimals(5000, 18),
              minOut: expandDecimals(1, 18), // 1 ETH
            }),
            short: getRedemptionInfo({
              token: usdc.address,
              glpAmount: expandDecimals(1000, 18),
              minOut: expandDecimals(1000, 6),
            }),
            minMarketTokens: expandDecimals(6000, 18),
            executionFee: "100000000000000",
          },
          {
            market: btcUsdMarket.marketToken,
            long: getRedemptionInfo({
              token: wnt.address,
              glpAmount: expandDecimals(5000, 18),
              minOut: expandDecimals(1, 7), // 0.1 WBTC
            }),
            short: getRedemptionInfo({
              token: usdc.address,
              glpAmount: expandDecimals(500, 18),
              minOut: expandDecimals(500, 6),
            }),
            minMarketTokens: expandDecimals(5500, 18),
            executionFee: "100000000000000",
          },
        ],
        { value: "210000000000000" }
      )
    ).to.be.revertedWithCustomError(errorsContract, "InvalidExecutionFeeForMigration");

    await glpMigrator.connect(user0).migrate(
      expandDecimals(11_500, 18), // 11,500 GLP
      [
        {
          market: ethUsdMarket.marketToken,
          long: getRedemptionInfo({
            token: wnt.address,
            glpAmount: expandDecimals(5000, 18),
            minOut: expandDecimals(1, 18), // 1 ETH
          }),
          short: getRedemptionInfo({
            token: usdc.address,
            glpAmount: expandDecimals(1000, 18),
            minOut: expandDecimals(1000, 6),
          }),
          minMarketTokens: expandDecimals(6000, 18),
          executionFee: "100000000000000",
        },
        {
          market: btcUsdMarket.marketToken,
          long: getRedemptionInfo({
            token: wbtc.address,
            glpAmount: expandDecimals(5000, 18),
            minOut: expandDecimals(1, 7), // 0.1 WBTC
          }),
          short: getRedemptionInfo({
            token: usdc.address,
            glpAmount: expandDecimals(500, 18),
            minOut: expandDecimals(500, 6),
          }),
          minMarketTokens: expandDecimals(5500, 18),
          executionFee: "100000000000000",
        },
      ],
      { value: "200000000000000" }
    );

    expect(await getDepositCount(dataStore)).eq(2);

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(0);
    expect(await getBalanceOf(btcUsdMarket.marketToken, user0.address)).eq(0);

    await executeDeposit(fixture, {});

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(6000, 18));
    expect(await getBalanceOf(btcUsdMarket.marketToken, user0.address)).eq(0);

    await executeDeposit(fixture, {
      ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wbtc] }),
    });
    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(6000, 18));
    expect(await getBalanceOf(btcUsdMarket.marketToken, user0.address)).eq(expandDecimals(5500, 18));
  });

  it("handles cancellations", async () => {
    await stakedGlp.mint(user0.address, expandDecimals(12_000, 18));
    await stakedGlp.connect(user0).approve(glpMigrator.address, expandDecimals(12_000, 18));
    await wnt.mint(glpRewardRouter.address, expandDecimals(2, 18));
    await usdc.mint(glpRewardRouter.address, expandDecimals(2000, 6));
    await wbtc.mint(glpRewardRouter.address, expandDecimals(1, 7));

    expect(await getDepositCount(dataStore)).eq(0);

    await glpMigrator.connect(user0).migrate(
      expandDecimals(11_500, 18), // 11,500 GLP
      [
        {
          market: ethUsdMarket.marketToken,
          long: getRedemptionInfo({
            token: wnt.address,
            glpAmount: expandDecimals(5000, 18),
            minOut: expandDecimals(1, 18), // 1 ETH
          }),
          short: getRedemptionInfo({
            token: usdc.address,
            glpAmount: expandDecimals(1000, 18),
            minOut: expandDecimals(1000, 6),
          }),
          minMarketTokens: expandDecimals(6000, 18),
          executionFee: "100000000000000",
        },
        {
          market: btcUsdMarket.marketToken,
          long: getRedemptionInfo({
            token: wbtc.address,
            glpAmount: expandDecimals(5000, 18),
            minOut: expandDecimals(1, 7), // 0.1 WBTC
          }),
          short: getRedemptionInfo({
            token: usdc.address,
            glpAmount: expandDecimals(500, 18),
            minOut: expandDecimals(500, 6),
          }),
          minMarketTokens: expandDecimals(6000, 18),
          executionFee: "100000000000000",
        },
      ],
      { value: "200000000000000" }
    );

    expect(await getDepositCount(dataStore)).eq(2);

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(0);
    expect(await getBalanceOf(btcUsdMarket.marketToken, user0.address)).eq(0);

    await executeDeposit(fixture, {});

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(6000, 18));
    expect(await getBalanceOf(btcUsdMarket.marketToken, user0.address)).eq(0);

    expect(await wnt.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);
    expect(await wbtc.balanceOf(user0.address)).eq(0);

    await executeDeposit(fixture, {
      ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wbtc] }),
      expectedCancellationReason: "MinMarketTokens",
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(6000, 18));
    expect(await getBalanceOf(btcUsdMarket.marketToken, user0.address)).eq(0);

    expect(await wnt.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(expandDecimals(500, 6));
    expect(await wbtc.balanceOf(user0.address)).eq(expandDecimals(1, 7));
  });
});
