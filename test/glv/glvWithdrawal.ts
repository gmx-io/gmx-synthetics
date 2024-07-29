import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import {
  getGlvWithdrawalCount,
  getGlvWithdrawalKeys,
  handleGlvDeposit,
  createGlvWithdrawal,
  handleGlvWithdrawal,
  executeGlvWithdrawal,
  expectEmptyGlvWithdrawal,
} from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { contractAt } from "../../utils/deploy";
import { expandDecimals } from "../../utils/math";
import { getSupplyOf } from "../../utils/token";
import { handleDeposit } from "../../utils/deposit";
import { errorsContract } from "../../utils/error";
import { increaseTime } from "../../utils/time";
import { printGasUsage } from "../../utils/gas";
import { expectBalances } from "../../utils/validation";

describe("Glv Withdrawals", () => {
  const { provider } = ethers;

  let fixture;
  let user0, user1, user2;
  let glvReader, dataStore, ethUsdMarket, ethUsdGlvAddress, btcUsdMarket, glvRouter, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2 } = fixture.accounts);
    ({ glvReader, dataStore, ethUsdMarket, ethUsdGlvAddress, btcUsdMarket, glvRouter, wnt, usdc } = fixture.contracts);
  });

  describe("create glv withdrawal, validations", () => {
    let params;
    const badAddress = ethers.constants.AddressZero.slice(0, -1) + "1";

    beforeEach(async () => {
      params = {
        account: user0,
        receiver: user1,
        callbackContract: user2,
        glv: ethUsdGlvAddress,
        market: ethUsdMarket,
        minLongTokenAmount: 100,
        minShortTokenAmount: 50,
        shouldUnwrapNativeToken: true,
        executionFee: 700,
        callbackGasLimit: 100000,
        gasUsageLabel: "createGlvWithdrawal",
      };
    });

    it.skip("InsufficientWntAmount");
    it.skip("InsufficientExecutionFee");
    it.skip("DisabledMarket");
    it.skip("MaxSwapPathLengthExceeded");
    it.skip("InvalidSwapMarket");

    it("EmptyAccount", async () => {
      await expect(
        createGlvWithdrawal(fixture, { ...params, account: { address: ethers.constants.AddressZero } })
      ).to.be.revertedWithCustomError(errorsContract, "EmptyAccount");
    });

    it("EmptyReceiver", async () => {
      await expect(
        createGlvWithdrawal(fixture, { ...params, receiver: { address: ethers.constants.AddressZero } })
      ).to.be.revertedWithCustomError(errorsContract, "EmptyReceiver");
    });

    it("EmptyGlv", async () => {
      await expect(createGlvWithdrawal(fixture, { ...params, glv: badAddress }))
        .to.be.revertedWithCustomError(errorsContract, "EmptyGlv")
        .withArgs(badAddress);
    });

    it("GlvUnsupportedMarket", async () => {
      await expect(createGlvWithdrawal(fixture, { ...params, market: btcUsdMarket }))
        .to.be.revertedWithCustomError(errorsContract, "GlvUnsupportedMarket")
        .withArgs(ethUsdGlvAddress, btcUsdMarket.marketToken);
    });

    it("EmptyGlvWithdrawalAmount", async () => {
      await expect(createGlvWithdrawal(fixture, { ...params, glvTokenAmount: 0 })).to.be.revertedWithCustomError(
        errorsContract,
        "EmptyGlvWithdrawalAmount"
      );
    });

    it("MaxCallbackGasLimitExceeded", async () => {
      await expect(
        createGlvWithdrawal(fixture, {
          ...params,
          callbackGasLimit: 1_000_000_000,
          glvTokenAmount: expandDecimals(1, 18),
        })
      )
        .to.be.revertedWithCustomError(errorsContract, "MaxCallbackGasLimitExceeded")
        .withArgs(1_000_000_000, 2_000_000);
    });
  });

  it("create glv withdrawal", async () => {
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(10 * 5000, 6),
      },
    });

    const glvToken = await contractAt("GlvToken", ethUsdGlvAddress);
    const glvTokenAmount = expandDecimals(1000, 18);
    await glvToken.mint(user0.address, glvTokenAmount);

    await createGlvWithdrawal(fixture, {
      account: user0,
      receiver: user1,
      callbackContract: user2,
      glv: ethUsdGlvAddress,
      market: ethUsdMarket,
      glvTokenAmount,
      minLongTokenAmount: 100,
      minShortTokenAmount: 50,
      shouldUnwrapNativeToken: true,
      executionFee: 700,
      callbackGasLimit: 100000,
      gasUsageLabel: "createGlvWithdrawal",
    });

    expect(await getGlvWithdrawalCount(dataStore)).eq(1);

    const glvWithdrawalKeys = await getGlvWithdrawalKeys(dataStore, 0, 1);
    const glvWithdrawal = await glvReader.getGlvWithdrawal(dataStore.address, glvWithdrawalKeys[0]);

    expect(glvWithdrawal.addresses.account).eq(user0.address);
    expect(glvWithdrawal.addresses.receiver).eq(user1.address);
    expect(glvWithdrawal.addresses.callbackContract).eq(user2.address);
    expect(glvWithdrawal.addresses.market).eq(ethUsdMarket.marketToken);
    expect(glvWithdrawal.numbers.glvTokenAmount).eq(expandDecimals(1000, 18));
    expect(glvWithdrawal.numbers.minLongTokenAmount).eq(100);
    expect(glvWithdrawal.numbers.minShortTokenAmount).eq(50);
    expect(glvWithdrawal.numbers.executionFee).eq(700);
    expect(glvWithdrawal.numbers.callbackGasLimit).eq(100000);
    expect(glvWithdrawal.flags.shouldUnwrapNativeToken).eq(true);
  });

  it("cancel glv withdrawal", async () => {
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(10 * 5000, 6),
      },
    });

    const glvToken = await contractAt("GlvToken", ethUsdGlvAddress);
    const glvTokenAmount = expandDecimals(1000, 18);
    await glvToken.mint(user0.address, glvTokenAmount);

    await createGlvWithdrawal(fixture, {
      account: user0,
      receiver: user1,
      callbackContract: user2,
      glv: ethUsdGlvAddress,
      market: ethUsdMarket,
      glvTokenAmount,
      minLongTokenAmount: 100,
      minShortTokenAmount: 50,
      shouldUnwrapNativeToken: true,
      executionFee: 700,
      callbackGasLimit: 100000,
      gasUsageLabel: "createGlvWithdrawal",
    });

    expect(await getGlvWithdrawalCount(dataStore)).eq(1);

    const glvWithdrawalKeys = await getGlvWithdrawalKeys(dataStore, 0, 1);
    const glvWithdrawalKey = glvWithdrawalKeys[0];
    let glvWithdrawal = await glvReader.getGlvWithdrawal(dataStore.address, glvWithdrawalKey);

    expect(glvWithdrawal.addresses.account).eq(user0.address);
    expect(glvWithdrawal.addresses.receiver).eq(user1.address);
    expect(glvWithdrawal.addresses.callbackContract).eq(user2.address);
    expect(glvWithdrawal.addresses.market).eq(ethUsdMarket.marketToken);
    expect(glvWithdrawal.numbers.glvTokenAmount).eq(expandDecimals(1000, 18));
    expect(glvWithdrawal.numbers.minLongTokenAmount).eq(100);
    expect(glvWithdrawal.numbers.minShortTokenAmount).eq(50);
    expect(glvWithdrawal.numbers.executionFee).eq(700);
    expect(glvWithdrawal.numbers.callbackGasLimit).eq(100000);
    expect(glvWithdrawal.flags.shouldUnwrapNativeToken).eq(true);

    await expect(glvRouter.connect(user1).cancelGlvWithdrawal(glvWithdrawalKey))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user1.address, "account for cancelGlvWithdrawal");

    expect(await getGlvWithdrawalCount(dataStore)).eq(1);

    await expect(glvRouter.connect(user0).cancelGlvWithdrawal(glvWithdrawalKey)).to.be.revertedWithCustomError(
      errorsContract,
      "RequestNotYetCancellable"
    );

    expect(await getGlvWithdrawalCount(dataStore)).eq(1);

    const refTime = (await ethers.provider.getBlock("latest")).timestamp;
    await increaseTime(refTime, 300);

    expect(await glvToken.balanceOf(user0.address)).eq(0);

    const txn = await glvRouter.connect(user0).cancelGlvWithdrawal(glvWithdrawalKey);

    expect(await glvToken.balanceOf(user0.address)).eq(expandDecimals(1000, 18));

    glvWithdrawal = await glvReader.getGlvWithdrawal(dataStore.address, glvWithdrawalKey);

    expectEmptyGlvWithdrawal(glvWithdrawal);

    await printGasUsage(provider, txn, "cancelGlvWithdrawal");
    expect(await getGlvWithdrawalCount(dataStore)).eq(0);

    await expect(glvRouter.connect(user0).cancelGlvWithdrawal(glvWithdrawalKey)).to.be.revertedWithCustomError(
      errorsContract,
      "EmptyGlvWithdrawal"
    );
  });

  describe("execute glv withdrawal, validations", () => {
    it.skip("EmptyGlvWithdrawal");

    it("OracleTimestampsAreLargerThanRequestExpirationTime", async () => {
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(1, 18),
          shortTokenAmount: expandDecimals(5_000, 6),
        },
      });

      await createGlvWithdrawal(fixture, {
        glvTokenAmount: expandDecimals(1, 18),
      });
      const block = await time.latestBlock();
      await expect(
        executeGlvWithdrawal(fixture, {
          oracleBlockNumber: block - 1,
        })
      ).to.be.revertedWithCustomError(errorsContract, "OracleTimestampsAreSmallerThanRequired");
      await executeGlvWithdrawal(fixture, {
        oracleBlockNumber: block,
      });
    });
  });

  it("execute glv withdrawal", async () => {
    await expectBalances({
      [user0.address]: {
        [wnt.address]: 0,
        [usdc.address]: 0,
      },
    });

    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5_000, 6),
      },
    });

    expect(await getSupplyOf(ethUsdGlvAddress)).to.be.eq(expandDecimals(10_000, 18));

    await expectBalances({
      [user0.address]: {
        [ethUsdGlvAddress]: expandDecimals(10_000, 18),
      },
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(10_000, 18),
      },
    });

    await handleGlvWithdrawal(fixture, {
      create: {
        glvTokenAmount: expandDecimals(1000, 18),
      },
    });

    expect(await getSupplyOf(ethUsdGlvAddress)).to.be.eq(expandDecimals(9000, 18));

    expectBalances({
      [user0.address]: {
        [wnt.address]: expandDecimals(1, 17),
        [usdc.address]: expandDecimals(500, 6),
        [ethUsdGlvAddress]: expandDecimals(9000, 18),
      },
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(9000, 18),
      },
    });

    await handleGlvWithdrawal(fixture, {
      create: {
        glvTokenAmount: expandDecimals(9000, 18),
      },
    });

    expect(await getSupplyOf(ethUsdGlvAddress)).to.be.eq(0);
    expectBalances({
      [user0.address]: {
        [wnt.address]: expandDecimals(1, 18),
        [usdc.address]: expandDecimals(5000, 6),
        [ethUsdGlvAddress]: 0,
      },
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: 0,
      },
    });
  });

  it("execute glv withdrawal, shouldUnwrapNativeToken = true", async () => {
    await expectBalances({
      [user0.address]: {
        [wnt.address]: 0,
        [usdc.address]: 0,
      },
    });

    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5_000, 6),
      },
    });

    expect(await getSupplyOf(ethUsdGlvAddress)).to.be.eq(expandDecimals(10_000, 18));
    await expectBalances({
      [user0.address]: {
        [ethUsdGlvAddress]: expandDecimals(10_000, 18),
      },
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(10_000, 18),
      },
    });

    let balanceBefore = await provider.getBalance(user0.address);
    await handleGlvWithdrawal(fixture, {
      create: {
        glvTokenAmount: expandDecimals(1000, 18),
        shouldUnwrapNativeToken: true,
      },
    });
    let balanceAfter = await provider.getBalance(user0.address);

    expect(balanceAfter.sub(balanceBefore)).to.be.closeTo(expandDecimals(1, 17), expandDecimals(1, 15));
    expect(await getSupplyOf(ethUsdGlvAddress)).to.be.eq(expandDecimals(9000, 18));

    await expectBalances({
      [user0.address]: {
        [ethUsdGlvAddress]: expandDecimals(9000, 18),
        [wnt.address]: 0,
        [usdc.address]: expandDecimals(500, 6),
      },
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(9000, 18),
      },
    });

    balanceBefore = await provider.getBalance(user0.address);
    await handleGlvWithdrawal(fixture, {
      create: {
        glvTokenAmount: expandDecimals(9000, 18),
        shouldUnwrapNativeToken: true,
      },
    });
    balanceAfter = await provider.getBalance(user0.address);

    expect(balanceAfter.sub(balanceBefore)).to.be.closeTo(expandDecimals(9, 17), expandDecimals(1, 15));
    expect(await getSupplyOf(ethUsdGlvAddress)).to.be.eq(0);

    await expectBalances({
      [user0.address]: {
        [ethUsdGlvAddress]: 0,
        [wnt.address]: 0,
        [usdc.address]: expandDecimals(5000, 6),
      },
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: 0,
      },
    });
  });
});
