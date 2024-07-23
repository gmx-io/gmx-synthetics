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

describe("Glv", () => {
  const { provider } = ethers;

  let fixture;
  let user0, user1, user2;
  let reader, dataStore, ethUsdMarket, ethUsdGlvAddress, btcUsdMarket;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2 } = fixture.accounts);
    ({ reader, dataStore, ethUsdMarket, ethUsdGlvAddress, btcUsdMarket } = fixture.contracts);
  });

  describe.only("create glv withdrawal, validations", () => {
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

    const glvToken = await contractAt("Glv", ethUsdGlvAddress);
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
    console.log("user glvBalance %s", glvBalance);

    const marketTokenBalance = await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress);
    console.log(
      "glv %s market %s marketTokenBalance %s",
      ethUsdMarket.marketToken,
      ethUsdGlvAddress,
      marketTokenBalance
    );

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
