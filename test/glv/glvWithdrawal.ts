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
import { contractAt, deployContract } from "../../utils/deploy";
import { bigNumberify, expandDecimals, decimalToFloat } from "../../utils/math";
import { getBalanceOf, getSupplyOf } from "../../utils/token";
import { getClaimableFeeAmount } from "../../utils/fee";
import { handleDeposit } from "../../utils/deposit";

describe("Glv", () => {
  const { provider } = ethers;

  let fixture;
  let user0, user1, user2, user3;
  let reader,
    dataStore,
    roleStore,
    depositVault,
    depositHandler,
    depositStoreUtils,
    ethUsdMarket,
    ethUsdSpotOnlyMarket,
    ethUsdSingleTokenMarket2,
    btcUsdMarket,
    solUsdMarket,
    wnt,
    sol,
    usdc,
    wbtc,
    glvFactory,
    glvHandler,
    glvType,
    ethUsdGlvAddress,
    config;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({
      reader,
      dataStore,
      roleStore,
      depositVault,
      depositHandler,
      depositStoreUtils,
      ethUsdMarket,
      ethUsdSpotOnlyMarket,
      ethUsdSingleTokenMarket2,
      btcUsdMarket,
      solUsdMarket,
      wnt,
      sol,
      usdc,
      wbtc,
      glvFactory,
      glvHandler,
      config,
      ethUsdGlvAddress,
    } = fixture.contracts);
  });

  it("create glv withdrawal", async () => {
    await glvHandler.addMarket(ethUsdGlvAddress, ethUsdMarket.marketToken);

    expect(await getGlvWithdrawalCount(dataStore)).eq(0);

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
    await glvHandler.addMarket(ethUsdGlvAddress, ethUsdMarket.marketToken);

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
