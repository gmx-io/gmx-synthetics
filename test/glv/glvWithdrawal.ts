import { expect } from "chai";
import { ethers } from "hardhat";

import {
  getGlvWithdrawalCount,
  getGlvWithdrawalKeys,
  handleGlvDeposit,
  createGlvWithdrawal,
  executeGlvWithdrawal,
} from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { contractAt } from "../../utils/deploy";
import { expandDecimals } from "../../utils/math";
import { getBalanceOf } from "../../utils/token";
import { handleDeposit } from "../../utils/deposit";
import { errorsContract } from "../../utils/error";
import { increaseTime } from "../../utils/time";
import { printGasUsage } from "../../utils/gas";

describe("Glv", () => {
  const { provider } = ethers;
  const { AddressZero } = ethers.constants;

  let fixture;
  let user0, user1, user2;
  let reader, dataStore, ethUsdMarket, ethUsdGlvAddress, btcUsdMarket, glvRouter;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2 } = fixture.accounts);
    ({ reader, dataStore, ethUsdMarket, ethUsdGlvAddress, btcUsdMarket, glvRouter } = fixture.contracts);
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

    it.skip("DisabledMarket");
    it.skip("MaxSwapPathLengthExceeded");
    it.skip("InvalidSwapMarket");
    it.skip("InsufficientWntAmount");

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
    it.skip("InsufficientExecutionFee");
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

    const block = await provider.getBlock("latest");
    const glvWithdrawalKeys = await getGlvWithdrawalKeys(dataStore, 0, 1);
    const glvWithdrawal = await reader.getGlvWithdrawal(dataStore.address, glvWithdrawalKeys[0]);

    expect(glvWithdrawal.addresses.account).eq(user0.address);
    expect(glvWithdrawal.addresses.receiver).eq(user1.address);
    expect(glvWithdrawal.addresses.callbackContract).eq(user2.address);
    expect(glvWithdrawal.addresses.market).eq(ethUsdMarket.marketToken);
    expect(glvWithdrawal.numbers.glvTokenAmount).eq(expandDecimals(1000, 18));
    expect(glvWithdrawal.numbers.minLongTokenAmount).eq(100);
    expect(glvWithdrawal.numbers.minShortTokenAmount).eq(50);
    expect(glvWithdrawal.numbers.updatedAtBlock).eq(block.number);
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

    const block = await provider.getBlock("latest");
    const glvWithdrawalKeys = await getGlvWithdrawalKeys(dataStore, 0, 1);
    const glvWithdrawalKey = glvWithdrawalKeys[0];
    let glvWithdrawal = await reader.getGlvWithdrawal(dataStore.address, glvWithdrawalKey);

    expect(glvWithdrawal.addresses.account).eq(user0.address);
    expect(glvWithdrawal.addresses.receiver).eq(user1.address);
    expect(glvWithdrawal.addresses.callbackContract).eq(user2.address);
    expect(glvWithdrawal.addresses.market).eq(ethUsdMarket.marketToken);
    expect(glvWithdrawal.numbers.glvTokenAmount).eq(expandDecimals(1000, 18));
    expect(glvWithdrawal.numbers.minLongTokenAmount).eq(100);
    expect(glvWithdrawal.numbers.minShortTokenAmount).eq(50);
    expect(glvWithdrawal.numbers.updatedAtBlock).eq(block.number);
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

    glvWithdrawal = await reader.getGlvWithdrawal(dataStore.address, glvWithdrawalKey);

    expect(glvWithdrawal.addresses.account).eq(AddressZero);
    expect(glvWithdrawal.addresses.receiver).eq(AddressZero);
    expect(glvWithdrawal.addresses.callbackContract).eq(AddressZero);
    expect(glvWithdrawal.addresses.market).eq(AddressZero);
    expect(glvWithdrawal.numbers.glvTokenAmount).eq(0);
    expect(glvWithdrawal.numbers.minLongTokenAmount).eq(0);
    expect(glvWithdrawal.numbers.minShortTokenAmount).eq(0);
    expect(glvWithdrawal.numbers.updatedAtBlock).eq(0);
    expect(glvWithdrawal.numbers.executionFee).eq(0);
    expect(glvWithdrawal.numbers.callbackGasLimit).eq(0);
    expect(glvWithdrawal.flags.shouldUnwrapNativeToken).eq(false);

    await printGasUsage(provider, txn, "cancelGlvWithdrawal");
    expect(await getGlvWithdrawalCount(dataStore)).eq(0);

    await expect(glvRouter.connect(user0).cancelGlvWithdrawal(glvWithdrawalKey)).to.be.revertedWithCustomError(
      errorsContract,
      "EmptyGlvWithdrawal"
    );
  });

  it.skip("cancel glv withdrawal, market tokens");

  it("execute glv withdrawal", async () => {
    await handleGlvDeposit(fixture, {
      create: {
        glv: ethUsdGlvAddress,
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(10 * 5000, 6),
      },
    });

    const glvBalance = await getBalanceOf(ethUsdGlvAddress, user0.address);

    await createGlvWithdrawal(fixture, {
      glv: ethUsdGlvAddress,
      market: ethUsdMarket,
      glvTokenAmount: glvBalance,
    });

    const glvWithdrawalKeys = await getGlvWithdrawalKeys(dataStore, 0, 10);
    const glvWithdrawal = await reader.getGlvWithdrawal(dataStore.address, glvWithdrawalKeys[0]);

    expect(glvWithdrawal.addresses.account).eq(user0.address);
    expect(await getGlvWithdrawalCount(dataStore)).eq(1);

    await executeGlvWithdrawal(fixture, {
      gasUsageLabel: "executeGlvWithdrawal",
      glv: ethUsdGlvAddress,
    });
  });
});
