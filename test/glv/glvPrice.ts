import { expect } from "chai";
import { ethers } from "hardhat";

import { createGlvDeposit, getGlvDepositCount, getGlvDepositKeys, handleGlvDeposit } from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { getBalanceOf } from "../../utils/token";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { increaseTime } from "../../utils/time";
import { printGasUsage } from "../../utils/gas";
import { contractAt } from "../../utils/deploy";

describe("Glv Deposits", () => {
  const { provider } = ethers;
  const { AddressZero } = ethers.constants;

  let fixture;
  let user0, user1, user2;
  let glvReader, dataStore, ethUsdMarket, btcUsdMarket, wnt, usdc, glvRouter, ethUsdGlvAddress;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2 } = fixture.accounts);
    ({ glvReader, dataStore, ethUsdMarket, btcUsdMarket, wnt, usdc, glvRouter, ethUsdGlvAddress } = fixture.contracts);
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

    const block = await provider.getBlock("latest");
    const glvDepositKeys = await getGlvDepositKeys(dataStore, 0, 1);
    const glvDeposit = await glvReader.getGlvDeposit(dataStore.address, glvDepositKeys[0]);

    expect(glvDeposit.addresses.glv).eq(ethUsdGlvAddress);
    expect(glvDeposit.addresses.account).eq(user0.address);
    expect(glvDeposit.addresses.receiver).eq(user1.address);
    expect(glvDeposit.addresses.callbackContract).eq(user2.address);
    expect(glvDeposit.addresses.market).eq(ethUsdMarket.marketToken);
    expect(glvDeposit.addresses.initialLongToken).eq(ethUsdMarket.longToken);
    expect(glvDeposit.addresses.initialShortToken).eq(ethUsdMarket.shortToken);
    expect(glvDeposit.addresses.longTokenSwapPath).deep.eq([btcUsdMarket.marketToken]);
    expect(glvDeposit.addresses.shortTokenSwapPath).deep.eq([ethUsdMarket.marketToken]);
    expect(glvDeposit.numbers.marketTokenAmount).eq(0);
    expect(glvDeposit.numbers.initialLongTokenAmount).eq(expandDecimals(10, 18));
    expect(glvDeposit.numbers.initialShortTokenAmount).eq(expandDecimals(10 * 5000, 6));
    expect(glvDeposit.numbers.minGlvTokens).eq(100);
    expect(glvDeposit.numbers.updatedAtBlock).eq(block.number);
    expect(glvDeposit.numbers.executionFee).eq("500");
    expect(glvDeposit.numbers.callbackGasLimit).eq("200000");
    expect(glvDeposit.flags.shouldUnwrapNativeToken).eq(true);
    expect(glvDeposit.flags.isMarketTokenDeposit).eq(false);
  });
});
