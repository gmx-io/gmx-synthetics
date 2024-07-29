import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import {
  createGlvDeposit,
  executeGlvDeposit,
  expectEmptyGlvDeposit,
  expectGlvDeposit,
  getGlvDepositCount,
  getGlvDepositKeys,
  handleGlvDeposit,
} from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { decimalToFloat, expandDecimals } from "../../utils/math";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { increaseTime } from "../../utils/time";
import { printGasUsage } from "../../utils/gas";
import { contractAt } from "../../utils/deploy";
import { handleDeposit } from "../../utils/deposit";
import { expectBalances } from "../../utils/validation";

describe("Glv Deposits", () => {
  const { provider } = ethers;
  const { AddressZero } = ethers.constants;

  let fixture;
  let user0, user1, user2;
  let glvReader, dataStore, ethUsdMarket, btcUsdMarket, solUsdMarket, wbtc, wnt, usdc, sol, glvRouter, ethUsdGlvAddress;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2 } = fixture.accounts);
    ({
      glvReader,
      dataStore,
      ethUsdMarket,
      solUsdMarket,
      btcUsdMarket,
      wbtc,
      wnt,
      usdc,
      sol,
      glvRouter,
      ethUsdGlvAddress,
    } = fixture.contracts);
  });

  describe("create glv deposit, validations", () => {
    let params;
    const badAddress = ethers.constants.AddressZero.slice(0, -1) + "1";

    beforeEach(async () => {
      params = {
        glv: ethUsdGlvAddress,
        receiver: user1,
        callbackContract: user2,
        market: ethUsdMarket,
        initialLongToken: ethUsdMarket.longToken,
        initialShortToken: ethUsdMarket.shortToken,
        longTokenSwapPath: [],
        shortTokenSwapPath: [],
        minGlvTokens: 100,
        shouldUnwrapNativeToken: true,
        executionFee: "0",
        callbackGasLimit: "200000",
        gasUsageLabel: "createGlvDeposit",
      };
    });

    it("InsufficientWntAmount", async () => {
      await expect(
        createGlvDeposit(fixture, { ...params, executionFeeToMint: 0, longTokenAmount: 1, executionFee: 2 })
      ).to.be.revertedWithCustomError(errorsContract, "InsufficientWntAmount");
    });

    it("InsufficientExecutionFee", async () => {
      await dataStore.setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));
      await expect(createGlvDeposit(fixture, { ...params, longTokenAmount: 1, executionFee: 1 }))
        .to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee")
        .withArgs("200000001600000", "1");
    });

    it("EmptyAccount", async () => {
      await expect(
        createGlvDeposit(fixture, { ...params, account: { address: ethers.constants.AddressZero } })
      ).to.be.revertedWithCustomError(errorsContract, "EmptyAccount");
    });

    it("EmptyGlv", async () => {
      await expect(createGlvDeposit(fixture, { ...params, glv: badAddress }))
        .to.be.revertedWithCustomError(errorsContract, "EmptyGlv")
        .withArgs(badAddress);
    });

    it("GlvUnsupportedMarket", async () => {
      await expect(createGlvDeposit(fixture, { ...params, market: btcUsdMarket }))
        .to.be.revertedWithCustomError(errorsContract, "GlvUnsupportedMarket")
        .withArgs(ethUsdGlvAddress, btcUsdMarket.marketToken);
    });

    it("GlvDisabledMarket", async () => {
      await dataStore.setBool(keys.isGlvMarketDisabledKey(ethUsdGlvAddress, ethUsdMarket.marketToken), true);
      await expect(createGlvDeposit(fixture, params))
        .to.be.revertedWithCustomError(errorsContract, "GlvDisabledMarket")
        .withArgs(ethUsdGlvAddress, ethUsdMarket.marketToken);
    });

    // TODO market is not enabled globally
    // TODO validate swaps

    it("InvalidGlvDepositInitialLongToken", async () => {
      // TODO check both isMarketTokenDeposit true/false
      await expect(createGlvDeposit(fixture, { ...params, isMarketTokenDeposit: true }))
        .to.be.revertedWithCustomError(errorsContract, "InvalidGlvDepositInitialLongToken")
        .withArgs(ethUsdMarket.longToken);
    });

    it("InvalidGlvDepositInitialShortToken", async () => {
      await expect(createGlvDeposit(fixture, { ...params, isMarketTokenDeposit: true, initialLongToken: AddressZero }))
        .to.be.revertedWithCustomError(errorsContract, "InvalidGlvDepositInitialShortToken")
        .withArgs(ethUsdMarket.shortToken);
    });

    it("InvalidGlvDepositSwapPath", async () => {
      await expect(
        createGlvDeposit(fixture, {
          ...params,
          initialLongToken: AddressZero,
          initialShortToken: AddressZero,
          longTokenSwapPath: [ethUsdMarket.marketToken],
          shortTokenSwapPath: [ethUsdMarket.marketToken, btcUsdMarket.marketToken],
          isMarketTokenDeposit: true,
        })
      )
        .to.be.revertedWithCustomError(errorsContract, "InvalidGlvDepositSwapPath")
        .withArgs(1, 2);
    });

    it.skip("MaxSwapPathLengthExceeded");
    it.skip("InvalidSwapMarket");
  });

  it("create glv deposit", async () => {
    const params = {
      glv: ethUsdGlvAddress,
      receiver: user1,
      callbackContract: user2,
      market: ethUsdMarket,
      initialLongToken: ethUsdMarket.longToken,
      initialShortToken: ethUsdMarket.shortToken,
      longTokenSwapPath: [btcUsdMarket.marketToken],
      shortTokenSwapPath: [ethUsdMarket.marketToken],
      minGlvTokens: 100,
      longTokenAmount: expandDecimals(10, 18),
      shortTokenAmount: expandDecimals(10 * 5000, 6),
      executionFee: "500",
      shouldUnwrapNativeToken: true,
      callbackGasLimit: "200000",
      gasUsageLabel: "createGlvDeposit",
    };

    await createGlvDeposit(fixture, params);

    const glvDeposit = (await glvReader.getGlvDeposits(dataStore.address, 0, 1))[0];

    expectGlvDeposit(glvDeposit, {
      ...params,
      account: user0.address,
      marketTokenAmount: 0,
      isMarketTokenDeposit: false,
    });
  });

  it("create glv deposit, market tokens", async () => {
    const params = {
      glv: ethUsdGlvAddress,
      receiver: user1,
      callbackContract: user2,
      market: ethUsdMarket,
      initialLongToken: AddressZero,
      initialShortToken: AddressZero,
      longTokenSwapPath: [],
      shortTokenSwapPath: [],
      minGlvTokens: 100,
      marketTokenAmount: expandDecimals(15, 18),
      executionFee: "500",
      shouldUnwrapNativeToken: true,
      callbackGasLimit: "200000",
      gasUsageLabel: "createGlvDeposit",
      isMarketTokenDeposit: true,
    };

    await createGlvDeposit(fixture, params);

    const glvDeposit = (await glvReader.getGlvDeposits(dataStore.address, 0, 1))[0];

    expectGlvDeposit(glvDeposit, {
      ...params,
      account: user0.address,
    });
  });

  it("execute glv deposit", async () => {
    await expectBalances({
      [user0.address]: {
        [ethUsdGlvAddress]: 0,
      },
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: 0,
      },
    });

    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(50_000, 6),
      },
    });

    await expectBalances({
      [user0.address]: {
        [ethUsdGlvAddress]: expandDecimals(100_000, 18),
      },
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(100_000, 18),
      },
    });

    await handleGlvDeposit(fixture, {
      create: {
        market: solUsdMarket,
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5_000, 6),
      },
    });

    await expectBalances({
      [user0.address]: {
        [ethUsdGlvAddress]: expandDecimals(110_000, 18),
      },
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(100_000, 18),
        [solUsdMarket.marketToken]: expandDecimals(10_000, 18),
      },
    });
  });

  it("execute glv deposit with swaps", async () => {
    await handleDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(100, 18),
        shortTokenAmount: expandDecimals(500_000, 6),
      },
    });

    const params = {
      initialLongToken: usdc.address,
      longTokenAmount: expandDecimals(50_000, 6),
      longTokenSwapPath: [ethUsdMarket.marketToken],

      initialShortToken: wnt.address,
      shortTokenAmount: expandDecimals(10, 18),
      shortTokenSwapPath: [ethUsdMarket.marketToken],
    };
    await createGlvDeposit(fixture, params);

    const glvDeposit = (await glvReader.getGlvDeposits(dataStore.address, 0, 1))[0];

    expectGlvDeposit(glvDeposit, params);
    await executeGlvDeposit(fixture);
    await expectBalances({
      [user0.address]: {
        [ethUsdGlvAddress]: expandDecimals(100_000, 18),
      },
    });
  });

  it("execute glv deposit, long token only", async () => {
    const params = {
      longTokenAmount: expandDecimals(1, 18),
      shortTokenAmount: 0,
    };
    await createGlvDeposit(fixture, params);

    const glvDeposit = (await glvReader.getGlvDeposits(dataStore.address, 0, 1))[0];

    expectGlvDeposit(glvDeposit, params);
    await executeGlvDeposit(fixture);
    await expectBalances({
      [user0.address]: {
        [ethUsdGlvAddress]: expandDecimals(5000, 18),
      },
    });
  });

  it("execute glv deposit, short token only", async () => {
    const params = {
      longTokenAmount: 0,
      shortTokenAmount: expandDecimals(1000, 6),
    };
    await createGlvDeposit(fixture, params);

    const glvDeposit = (await glvReader.getGlvDeposits(dataStore.address, 0, 1))[0];

    expectGlvDeposit(glvDeposit, params);
    await executeGlvDeposit(fixture);
    await expectBalances({
      [user0.address]: {
        [ethUsdGlvAddress]: expandDecimals(1000, 18),
      },
    });
  });

  it("execute glv deposit, market tokens", async () => {
    await handleDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
    });
    await handleDeposit(fixture, {
      create: {
        market: solUsdMarket,
        longTokenAmount: expandDecimals(2, 18),
        shortTokenAmount: expandDecimals(10000, 6),
      },
      execute: {
        tokens: [wnt.address, usdc.address, sol.address],
        precisions: [8, 18, 18],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)],
      },
    });

    await expectBalances({
      [user0.address]: {
        [ethUsdMarket.marketToken]: expandDecimals(10_000, 18),
        [solUsdMarket.marketToken]: expandDecimals(20_000, 18),
      },
    });

    await handleGlvDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        marketTokenAmount: expandDecimals(5_000, 18),
        isMarketTokenDeposit: true,
        initialLongToken: AddressZero,
        initialShortToken: AddressZero,
      },
    });

    await expectBalances({
      [user0.address]: {
        [ethUsdGlvAddress]: expandDecimals(5_000, 18),
        [solUsdMarket.marketToken]: expandDecimals(20_000, 18),
      },
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(5_000, 18),
      },
    });

    await handleGlvDeposit(fixture, {
      create: {
        market: solUsdMarket,
        marketTokenAmount: expandDecimals(5_000, 18),
        isMarketTokenDeposit: true,
        initialLongToken: AddressZero,
        initialShortToken: AddressZero,
      },
    });

    await expectBalances({
      [user0.address]: {
        [ethUsdGlvAddress]: expandDecimals(10_000, 18),
        [solUsdMarket.marketToken]: expandDecimals(15_000, 18),
      },
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(5_000, 18),
        [solUsdMarket.marketToken]: expandDecimals(5_000, 18),
      },
    });
  });

  describe("execute glv deposit, validations", () => {
    const minGlvTokensForFirstGlvDeposit = expandDecimals(1000, 18);
    const firstDepositReceiver = { address: "0x0000000000000000000000000000000000000001" };

    it("EmptyAccount", async () => {
      await expect(
        createGlvDeposit(fixture, { account: { address: ethers.constants.AddressZero } })
      ).to.be.revertedWithCustomError(errorsContract, "EmptyAccount");
    });

    it("EmptyReceiver", async () => {
      await expect(
        createGlvDeposit(fixture, { longTokenAmount: 1, receiver: { address: ethers.constants.AddressZero } })
      ).to.be.revertedWithCustomError(errorsContract, "EmptyReceiver");
    });

    it("GlvDepositNotFound", async () => {
      const key = ethers.constants.HashZero.slice(0, -1) + "f";
      await expect(
        executeGlvDeposit(fixture, {
          key,
        })
      )
        .to.be.revertedWithCustomError(errorsContract, "GlvDepositNotFound")
        .withArgs(key);
    });

    it("invalid long token", async () => {
      await handleGlvDeposit(fixture, {
        create: {
          initialLongToken: wbtc.address,
          longTokenAmount: expandDecimals(1, 8),
        },
        execute: {
          expectedCancellationReason: "InvalidSwapOutputToken",
        },
      });
    });

    it("invalid short token", async () => {
      await handleGlvDeposit(fixture, {
        create: {
          initialShortToken: wbtc.address,
          shortTokenAmount: expandDecimals(1, 8),
        },
        execute: {
          expectedCancellationReason: "InvalidSwapOutputToken",
        },
      });
    });

    it("OracleTimestampsAreLargerThanRequestExpirationTime", async () => {
      await createGlvDeposit(fixture, {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      });
      const block = await time.latestBlock();
      await expect(
        executeGlvDeposit(fixture, {
          oracleBlockNumber: block - 1,
        })
      ).to.be.revertedWithCustomError(errorsContract, "OracleTimestampsAreSmallerThanRequired");
      await executeGlvDeposit(fixture, {
        oracleBlockNumber: block,
      });
    });

    it("MinGlvTokens", async () => {
      // deposit 100 USDC, glv token price = $1, glv token amount = 100
      await handleGlvDeposit(fixture, {
        create: {
          shortTokenAmount: expandDecimals(100, 6),
          minGlvTokens: expandDecimals(101, 18),
        },
        execute: {
          expectedCancellationReason: {
            name: "MinGlvTokens",
          },
        },
      });
      await handleGlvDeposit(fixture, {
        create: {
          shortTokenAmount: expandDecimals(100, 6),
          minGlvTokens: expandDecimals(100, 18),
        },
      });
    });

    it("InvalidReceiverForFirstGlvDeposit", async () => {
      await dataStore.setUint(keys.minGlvTokensForFirstGlvDepositKey(ethUsdGlvAddress), minGlvTokensForFirstGlvDeposit);
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(1, 17),
          shortTokenAmount: expandDecimals(100, 6),
        },
        execute: {
          expectedCancellationReason: {
            name: "InvalidReceiverForFirstGlvDeposit",
            args: [user0.address, firstDepositReceiver.address],
          },
        },
      });
    });

    it("InvalidMinGlvTokensForFirstGlvDeposit", async () => {
      await dataStore.setUint(keys.minGlvTokensForFirstGlvDepositKey(ethUsdGlvAddress), minGlvTokensForFirstGlvDeposit);
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(1, 17),
          shortTokenAmount: expandDecimals(100, 6),
          receiver: firstDepositReceiver,
          minGlvTokens: expandDecimals(1, 15),
        },
        execute: {
          expectedCancellationReason: {
            name: "InvalidMinGlvTokensForFirstGlvDeposit",
            args: [expandDecimals(1, 15), minGlvTokensForFirstGlvDeposit],
          },
        },
      });
    });
  });

  it("cancel glv deposit", async () => {
    await dataStore.setUint(keys.REQUEST_EXPIRATION_TIME, 300);

    const params = {
      glv: ethUsdGlvAddress,
      receiver: user1,
      market: ethUsdMarket,
      callbackContract: user2,
      initialLongToken: ethUsdMarket.longToken,
      initialShortToken: ethUsdMarket.shortToken,
      longTokenSwapPath: [],
      shortTokenSwapPath: [],
      minGlvTokens: 100,
      longTokenAmount: expandDecimals(10, 18),
      shortTokenAmount: expandDecimals(10 * 5000, 6),
      executionFee: "500",
      shouldUnwrapNativeToken: false,
      callbackGasLimit: "200000",
      gasUsageLabel: "createGlvDeposit",
    };

    await createGlvDeposit(fixture, params);

    const glvDepositKeys = await getGlvDepositKeys(dataStore, 0, 1);
    let glvDeposit = await glvReader.getGlvDeposit(dataStore.address, glvDepositKeys[0]);

    expectGlvDeposit(glvDeposit, {
      ...params,
      account: user0.address,
      marketTokenAmount: 0,
      shouldUnwrapNativeToken: false,
      isMarketTokenDeposit: false,
    });

    await expect(glvRouter.connect(user1).cancelGlvDeposit(glvDepositKeys[0]))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user1.address, "account for cancelGlvDeposit");

    expect(await getGlvDepositCount(dataStore)).eq(1);

    await expect(glvRouter.connect(user0).cancelGlvDeposit(glvDepositKeys[0])).to.be.revertedWithCustomError(
      errorsContract,
      "RequestNotYetCancellable"
    );

    expect(await getGlvDepositCount(dataStore)).eq(1);

    const refTime = (await ethers.provider.getBlock("latest")).timestamp;
    await increaseTime(refTime, 300);

    expect(await wnt.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);

    const txn = await glvRouter.connect(user0).cancelGlvDeposit(glvDepositKeys[0]);

    expect(await wnt.balanceOf(user0.address)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(user0.address)).eq(expandDecimals(10 * 5000, 6));

    glvDeposit = await glvReader.getGlvDeposit(dataStore.address, glvDepositKeys[0]);

    expectEmptyGlvDeposit(glvDeposit);

    await printGasUsage(provider, txn, "cancelGlvDeposit");
    expect(await getGlvDepositCount(dataStore)).eq(0);

    await expect(glvRouter.connect(user0).cancelGlvDeposit(glvDepositKeys[0])).to.be.revertedWithCustomError(
      errorsContract,
      "EmptyGlvDeposit"
    );
  });

  it("cancel glv deposit, shouldUnwrapNativeToken = true", async () => {
    await dataStore.setUint(keys.REQUEST_EXPIRATION_TIME, 300);

    const params = {
      glv: ethUsdGlvAddress,
      receiver: user1,
      market: ethUsdMarket,
      callbackContract: user2,
      initialLongToken: ethUsdMarket.longToken,
      initialShortToken: ethUsdMarket.shortToken,
      longTokenSwapPath: [],
      shortTokenSwapPath: [],
      minGlvTokens: 100,
      longTokenAmount: expandDecimals(10, 18),
      shortTokenAmount: expandDecimals(10 * 5000, 6),
      executionFee: "500",
      shouldUnwrapNativeToken: true,
      callbackGasLimit: "200000",
      gasUsageLabel: "createGlvDeposit",
    };

    await createGlvDeposit(fixture, params);

    const glvDepositKeys = await getGlvDepositKeys(dataStore, 0, 1);
    let glvDeposit = await glvReader.getGlvDeposit(dataStore.address, glvDepositKeys[0]);

    expectGlvDeposit(glvDeposit, {
      ...params,
      account: user0.address,
      marketTokenAmount: 0,
      isMarketTokenDeposit: false,
    });

    await expect(glvRouter.connect(user1).cancelGlvDeposit(glvDepositKeys[0]))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user1.address, "account for cancelGlvDeposit");

    expect(await getGlvDepositCount(dataStore)).eq(1);

    await expect(glvRouter.connect(user0).cancelGlvDeposit(glvDepositKeys[0])).to.be.revertedWithCustomError(
      errorsContract,
      "RequestNotYetCancellable"
    );

    expect(await getGlvDepositCount(dataStore)).eq(1);

    const refTime = (await ethers.provider.getBlock("latest")).timestamp;
    await increaseTime(refTime, 300);

    expect(await wnt.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(0);
    const balanceBefore = await provider.getBalance(user0.address);

    const txn = await glvRouter.connect(user0).cancelGlvDeposit(glvDepositKeys[0]);

    expect(await wnt.balanceOf(user0.address)).eq(0);
    expect(await usdc.balanceOf(user0.address)).eq(expandDecimals(10 * 5000, 6));
    const balanceAfter = await provider.getBalance(user0.address);
    expect(balanceAfter.sub(balanceBefore)).to.be.closeTo(expandDecimals(10, 18), expandDecimals(1, 15));

    glvDeposit = await glvReader.getGlvDeposit(dataStore.address, glvDepositKeys[0]);

    expectEmptyGlvDeposit(glvDeposit);

    await printGasUsage(provider, txn, "cancelGlvDeposit");
    expect(await getGlvDepositCount(dataStore)).eq(0);

    await expect(glvRouter.connect(user0).cancelGlvDeposit(glvDepositKeys[0])).to.be.revertedWithCustomError(
      errorsContract,
      "EmptyGlvDeposit"
    );
  });

  it("cancel glv deposit, market tokens", async () => {
    await dataStore.setUint(keys.REQUEST_EXPIRATION_TIME, 300);

    const params = {
      glv: ethUsdGlvAddress,
      receiver: user1,
      market: ethUsdMarket,
      callbackContract: user2,
      initialLongToken: AddressZero,
      initialShortToken: AddressZero,
      longTokenSwapPath: [],
      shortTokenSwapPath: [],
      minGlvTokens: 100,
      longTokenAmount: 0,
      shortTokenAmount: 0,
      marketTokenAmount: expandDecimals(15, 18),
      executionFee: "500",
      shouldUnwrapNativeToken: false,
      callbackGasLimit: "200000",
      gasUsageLabel: "createGlvDeposit",
      isMarketTokenDeposit: true,
    };

    await createGlvDeposit(fixture, params);

    const glvDepositKeys = await getGlvDepositKeys(dataStore, 0, 1);
    let glvDeposit = await glvReader.getGlvDeposit(dataStore.address, glvDepositKeys[0]);

    expectGlvDeposit(glvDeposit, {
      ...params,
      account: user0.address,
      initialLongTokenAmount: 0,
      initialShortTokenAmount: 0,
      shouldUnwrapNativeToken: false,
      isMarketTokenDeposit: true,
    });

    await expect(glvRouter.connect(user1).cancelGlvDeposit(glvDepositKeys[0]))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user1.address, "account for cancelGlvDeposit");

    expect(await getGlvDepositCount(dataStore)).eq(1);

    await expect(glvRouter.connect(user0).cancelGlvDeposit(glvDepositKeys[0])).to.be.revertedWithCustomError(
      errorsContract,
      "RequestNotYetCancellable"
    );

    expect(await getGlvDepositCount(dataStore)).eq(1);

    const refTime = (await ethers.provider.getBlock("latest")).timestamp;
    await increaseTime(refTime, 300);

    const market = await contractAt("GlvToken", ethUsdMarket.marketToken);
    expect(await market.balanceOf(user0.address)).eq(0);

    const txn = await glvRouter.connect(user0).cancelGlvDeposit(glvDepositKeys[0]);

    expect(await market.balanceOf(user0.address)).eq(expandDecimals(15, 18));

    glvDeposit = await glvReader.getGlvDeposit(dataStore.address, glvDepositKeys[0]);

    expectEmptyGlvDeposit(glvDeposit);

    await printGasUsage(provider, txn, "cancelGlvDeposit");
    expect(await getGlvDepositCount(dataStore)).eq(0);

    await expect(glvRouter.connect(user0).cancelGlvDeposit(glvDepositKeys[0])).to.be.revertedWithCustomError(
      errorsContract,
      "EmptyGlvDeposit"
    );
  });
});
