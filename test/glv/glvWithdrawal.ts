import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import * as keys from "../../utils/keys";
import {
  getGlvWithdrawalCount,
  getGlvWithdrawalKeys,
  handleGlvDeposit,
  createGlvWithdrawal,
  handleGlvWithdrawal,
  executeGlvWithdrawal,
  expectEmptyGlvWithdrawal,
  getGlvAddress,
  expectGlvWithdrawal,
} from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { contractAt, deployContract } from "../../utils/deploy";
import { decimalToFloat, expandDecimals } from "../../utils/math";
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
  let glvReader,
    dataStore,
    ethUsdMarket,
    ethUsdGlvAddress,
    btcUsdMarket,
    glvRouter,
    wnt,
    usdc,
    glvFactory,
    glvVault,
    roleStore,
    glvHandler,
    ethUsdSingleTokenMarket2;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2 } = fixture.accounts);

    ({
      glvReader,
      dataStore,
      ethUsdMarket,
      ethUsdGlvAddress,
      btcUsdMarket,
      glvRouter,
      wnt,
      usdc,
      glvFactory,
      glvVault,
      roleStore,
      glvHandler,
      ethUsdSingleTokenMarket2,
    } = fixture.contracts);
  });

  let ethUsdSingleTokenGlvAddress: string;
  beforeEach(async () => {
    const glvType = ethers.constants.HashZero;

    ethUsdSingleTokenGlvAddress = getGlvAddress(
      wnt.address,
      wnt.address,
      glvType,
      "Glv name",
      "Glv symbol",
      glvFactory.address,
      roleStore.address,
      dataStore.address
    );
    await glvFactory.createGlv(wnt.address, wnt.address, glvType, "Glv name", "Glv symbol");

    const marketListKey = keys.glvSupportedMarketListKey(ethUsdSingleTokenGlvAddress);
    const marketListCount = await dataStore.getAddressCount(marketListKey);
    expect(marketListCount.toNumber()).eq(0);

    await glvHandler.addMarketToGlv(ethUsdSingleTokenGlvAddress, ethUsdSingleTokenMarket2.marketToken);
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

    it("InsufficientWntAmountForExecutionFee", async () => {
      await expect(
        createGlvWithdrawal(fixture, { ...params, executionFeeToMint: 0, glvTokenAmount: 1, executionFee: 2 })
      ).to.be.revertedWithCustomError(errorsContract, "InsufficientWntAmountForExecutionFee");
    });

    it("InsufficientExecutionFee", async () => {
      await dataStore.setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));
      await expect(createGlvWithdrawal(fixture, { ...params, glvTokenAmount: 1, executionFee: 1 }))
        .to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee")
        .withArgs("100000000800000", "1");
    });

    it("EmptyAccount", async () => {
      await expect(
        createGlvWithdrawal(fixture, {
          ...params,
          account: { address: ethers.constants.AddressZero },
          useGlvHandler: true,
        })
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

    it.skip("MaxSwapPathLengthExceeded");
    it.skip("InvalidSwapMarket");
  });

  it("create glv withdrawal", async () => {
    const glvToken = await contractAt("GlvToken", ethUsdGlvAddress);
    const glvTokenAmount = expandDecimals(1000, 18);
    await glvToken.mint(user0.address, glvTokenAmount);

    const params = {
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
      executionFeeToMint: 800,
      callbackGasLimit: 100000,
      gasUsageLabel: "createGlvWithdrawal",
    };
    await createGlvWithdrawal(fixture, params);

    expect(await getGlvWithdrawalCount(dataStore)).eq(1);

    const glvWithdrawalKeys = await getGlvWithdrawalKeys(dataStore, 0, 1);
    const glvWithdrawal = await glvReader.getGlvWithdrawal(dataStore.address, glvWithdrawalKeys[0]);

    // execution fee should be 800 because 800e-18 WETH was sent
    expectGlvWithdrawal(glvWithdrawal, { ...params, executionFee: 800 });
  });

  it("create glv withdrawal, disabled market", async () => {
    await dataStore.setBool(keys.isGlvMarketDisabledKey(ethUsdGlvAddress, ethUsdMarket.marketToken), true);
    const glvToken = await contractAt("GlvToken", ethUsdGlvAddress);
    const glvTokenAmount = expandDecimals(1000, 18);
    await glvToken.mint(user0.address, glvTokenAmount);

    const params = {
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
    };
    await createGlvWithdrawal(fixture, params);

    expect(await getGlvWithdrawalCount(dataStore)).eq(1);

    const glvWithdrawalKeys = await getGlvWithdrawalKeys(dataStore, 0, 1);
    const glvWithdrawal = await glvReader.getGlvWithdrawal(dataStore.address, glvWithdrawalKeys[0]);

    expectGlvWithdrawal(glvWithdrawal, params);
  });

  it("create glv withdrawal, single asset", async () => {
    const glvToken = await contractAt("GlvToken", ethUsdGlvAddress);
    const glvTokenAmount = expandDecimals(1000, 18);
    await glvToken.mint(user0.address, glvTokenAmount);

    const params = {
      glv: ethUsdSingleTokenGlvAddress,
      market: ethUsdSingleTokenMarket2,
      account: user0,
      receiver: user1,
      callbackContract: user2,
      glvTokenAmount,
      minLongTokenAmount: 100,
      minShortTokenAmount: 0,
      shouldUnwrapNativeToken: true,
      executionFee: 700,
      callbackGasLimit: 100000,
      gasUsageLabel: "createGlvWithdrawal",
    };
    await createGlvWithdrawal(fixture, params);

    expect(await getGlvWithdrawalCount(dataStore)).eq(1);

    const glvWithdrawalKeys = await getGlvWithdrawalKeys(dataStore, 0, 1);
    const glvWithdrawal = await glvReader.getGlvWithdrawal(dataStore.address, glvWithdrawalKeys[0]);

    expectGlvWithdrawal(glvWithdrawal, params);
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

    const params = {
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
    };
    await createGlvWithdrawal(fixture, params);

    expect(await getGlvWithdrawalCount(dataStore)).eq(1);

    const glvWithdrawalKeys = await getGlvWithdrawalKeys(dataStore, 0, 1);
    const glvWithdrawalKey = glvWithdrawalKeys[0];
    let glvWithdrawal = await glvReader.getGlvWithdrawal(dataStore.address, glvWithdrawalKey);

    expectGlvWithdrawal(glvWithdrawal, params);

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

    const refundReceiverBalanceBefore = await ethers.provider.getBalance(user1.address);

    const txn = await glvRouter.connect(user0).cancelGlvWithdrawal(glvWithdrawalKey);

    const refundReceiverBalanceAfter = await ethers.provider.getBalance(user1.address);
    const refund = refundReceiverBalanceAfter.sub(refundReceiverBalanceBefore);
    expect(refund).to.eq(params.executionFee);

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
    it("GlvWithdrawalNotFound", async () => {
      const key = ethers.constants.HashZero.slice(0, -1) + "f";
      await expect(executeGlvWithdrawal(fixture, { key }))
        .to.be.revertedWithCustomError(errorsContract, "GlvWithdrawalNotFound")
        .withArgs(key);
    });

    it("min token amount", async () => {
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(1, 18),
          shortTokenAmount: expandDecimals(5000, 6),
        },
      });

      await handleGlvWithdrawal(fixture, {
        create: {
          glvTokenAmount: expandDecimals(999, 18),
          minLongTokenAmount: expandDecimals(1, 17),
        },
        execute: {
          expectedCancellationReason: "InsufficientOutputAmount",
        },
      });
      await handleGlvWithdrawal(fixture, {
        create: {
          glvTokenAmount: expandDecimals(1000, 18),
          minLongTokenAmount: expandDecimals(1, 17),
        },
      });

      await handleGlvWithdrawal(fixture, {
        create: {
          glvTokenAmount: expandDecimals(999, 18),
          minShortTokenAmount: expandDecimals(500, 6),
        },
        execute: {
          expectedCancellationReason: "InsufficientOutputAmount",
        },
      });
      await handleGlvWithdrawal(fixture, {
        create: {
          glvTokenAmount: expandDecimals(1000, 18),
          minShortTokenAmount: expandDecimals(500, 6),
        },
      });
    });

    it("OracleTimestampsAreSmallerThanRequired", async () => {
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
      await time.increase(60);
      await dataStore.setUint(keys.REQUEST_EXPIRATION_TIME, 60);
      expect(await dataStore.getUint(keys.REQUEST_EXPIRATION_TIME)).to.be.eq(60);

      await expect(executeGlvWithdrawal(fixture)).to.be.revertedWithCustomError(
        errorsContract,
        "OracleTimestampsAreLargerThanRequestExpirationTime"
      );

      await dataStore.setUint(keys.REQUEST_EXPIRATION_TIME, 300);
      expect(await dataStore.getUint(keys.REQUEST_EXPIRATION_TIME)).to.be.eq(300);
      await executeGlvWithdrawal(fixture);
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

  it("execute glv withdrawal, GM tokens sent directly to GLV vault does not affect withdrawn amount", async () => {
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

    await createGlvWithdrawal(fixture, {
      glvTokenAmount: expandDecimals(1000, 18),
      market: ethUsdMarket,
    });
    await expectBalances({
      [glvVault.address]: {
        [ethUsdMarket.marketToken]: 0,
      },
    });

    const _marketToken = await contractAt("MintableToken", ethUsdMarket.marketToken);
    await _marketToken.mint(glvVault.address, expandDecimals(100_000, 18));
    await expectBalances({
      [glvVault.address]: {
        [ethUsdMarket.marketToken]: expandDecimals(100_000, 18),
      },
    });

    await executeGlvWithdrawal(fixture);

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
  });

  it("execute glv deposit with callback", async () => {
    const mockCallbackReceiver = await deployContract("MockCallbackReceiver", []);
    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
      },
    });

    const params = {
      glvTokenAmount: expandDecimals(100, 18),
      callbackContract: mockCallbackReceiver,
      callbackGasLimit: 0,
    };
    expect(await mockCallbackReceiver.glvWithdrawalExecutionCalled()).to.be.eq(0);

    await handleGlvWithdrawal(fixture, { create: params });
    expect(await mockCallbackReceiver.glvWithdrawalExecutionCalled()).to.be.eq(0);
    expect(await mockCallbackReceiver.glvWithdrawalCancellationCalled()).to.be.eq(0);

    await handleGlvWithdrawal(fixture, { create: { ...params, callbackGasLimit: 1_000_000 } });
    expect(await mockCallbackReceiver.glvWithdrawalExecutionCalled()).to.be.eq(1);
    expect(await mockCallbackReceiver.glvWithdrawalCancellationCalled()).to.be.eq(0);

    await handleGlvWithdrawal(fixture, {
      create: { ...params, minLongTokenAmount: expandDecimals(1, 18), callbackGasLimit: 1_000_000 },
      execute: {
        expectedCancellationReason: "InsufficientOutputAmount",
      },
    });
    expect(await mockCallbackReceiver.glvWithdrawalExecutionCalled()).to.be.eq(1);
    expect(await mockCallbackReceiver.glvWithdrawalCancellationCalled()).to.be.eq(1);

    // should be some deployed contract
    const badCallbackReceiver = { address: ethUsdMarket.marketToken };
    await handleGlvWithdrawal(fixture, {
      create: { ...params, callbackContract: badCallbackReceiver, callbackGasLimit: 1_000_000 },
    });
  });

  it("execute glv deposit, single asset", async () => {
    await handleGlvDeposit(fixture, {
      create: {
        glv: ethUsdSingleTokenGlvAddress,
        market: ethUsdSingleTokenMarket2,
        longTokenAmount: expandDecimals(10, 18),
        initialShortToken: wnt.address,
      },
    });
    await expectBalances({
      [user0.address]: {
        [wnt.address]: 0,
        [ethUsdSingleTokenGlvAddress]: expandDecimals(50_000, 18),
      },
    });

    const params = {
      glv: ethUsdSingleTokenGlvAddress,
      market: ethUsdSingleTokenMarket2,
      glvTokenAmount: expandDecimals(5000, 18),
    };
    await handleGlvWithdrawal(fixture, { create: params });
    await expectBalances({
      [user0.address]: {
        [wnt.address]: expandDecimals(1, 18),
        [ethUsdSingleTokenGlvAddress]: expandDecimals(45_000, 18),
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

  it("simulate execute glv withdrawal", async () => {
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

    await createGlvWithdrawal(fixture, {
      glvTokenAmount: expandDecimals(1000, 18),
    });

    expect(await getSupplyOf(ethUsdGlvAddress)).to.be.eq(expandDecimals(10_000, 18));
    expectBalances({
      [user0.address]: {
        [wnt.address]: 0,
        [usdc.address]: 0,
        [ethUsdGlvAddress]: expandDecimals(9000, 18),
      },
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(10_000, 18),
      },
    });

    await executeGlvWithdrawal(fixture, {
      simulate: true,
    });

    // no change
    expect(await getSupplyOf(ethUsdGlvAddress)).to.be.eq(expandDecimals(10_000, 18));
    expectBalances({
      [user0.address]: {
        [wnt.address]: 0,
        [usdc.address]: 0,
        [ethUsdGlvAddress]: expandDecimals(9000, 18),
      },
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(10_000, 18),
      },
    });

    await executeGlvWithdrawal(fixture);

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
  });
});
