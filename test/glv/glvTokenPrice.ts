import { expect } from "chai";
import { ethers } from "hardhat";

import {
  createGlvDeposit,
  getGlvDepositCount,
  getGlvDepositKeys,
  handleGlvDeposit,
  handleGlvShift,
  handleGlvWithdrawal,
} from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { getBalanceOf } from "../../utils/token";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { increaseTime } from "../../utils/time";
import { printGasUsage } from "../../utils/gas";
import { contractAt } from "../../utils/deploy";
import { BigNumberish } from "ethers";

function getPriceProp(price: BigNumberish, decimals: number) {
  return {
    min: expandDecimals(price, decimals),
    max: expandDecimals(price, decimals),
  };
}

describe("Glv Token Price", () => {
  let fixture;
  let glvReader, dataStore, ethUsdMarket, solUsdMarket, ethUsdGlvAddress;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ glvReader, dataStore, ethUsdMarket, solUsdMarket, ethUsdGlvAddress } = fixture.contracts);
  });

  it("glv token price", async () => {
    async function getGlvTokenPrice(ethPrice = 5000, solPrice = 600, usdcPrice = 1) {
      const [price, value, supply] = await glvReader.getGlvTokenPrice(
        dataStore.address,
        [ethUsdMarket.marketToken, solUsdMarket.marketToken],
        [getPriceProp(ethPrice, 12), getPriceProp(solPrice, 12)],
        getPriceProp(ethPrice, 12),
        getPriceProp(usdcPrice, 24),
        ethUsdGlvAddress,
        true
      );
      console.log("price: %s value: %s supply: %s", price, value, supply);
      return [price, value, supply];
    }

    let [price, value, supply] = await getGlvTokenPrice();

    expect(price).to.be.eq(expandDecimals(1, 30));
    expect(value).to.be.eq(0);
    expect(supply).to.be.eq(0);

    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(10 * 5000, 6),
      },
    });

    [price, value, supply] = await getGlvTokenPrice();

    // deposited $100k
    expect(price).to.be.eq(expandDecimals(1, 30));
    expect(value).to.be.eq(expandDecimals(100_000, 30));
    expect(supply).to.be.eq(expandDecimals(100_000, 18));

    await handleGlvDeposit(fixture, {
      create: {
        market: solUsdMarket,
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5_000, 6),
      },
    });

    // deposited $10k
    [price, value, supply] = await getGlvTokenPrice();
    expect(price).to.be.eq(expandDecimals(1, 30));
    expect(value).to.be.eq(expandDecimals(110_000, 30));
    expect(supply).to.be.eq(expandDecimals(110_000, 18));

    await handleGlvShift(fixture, {
      create: {
        fromMarket: ethUsdMarket,
        toMarket: solUsdMarket,
        marketTokenAmount: expandDecimals(10000, 18),
        minMarketTokens: expandDecimals(10000, 18),
      },
    });

    // price/value/supply should not change
    [price, value, supply] = await getGlvTokenPrice();
    expect(price).to.be.eq(expandDecimals(1, 30));
    expect(value).to.be.eq(expandDecimals(110_000, 30));
    expect(supply).to.be.eq(expandDecimals(110_000, 18));

    // eth price grew by 10%
    [price, value, supply] = await getGlvTokenPrice(5500);
    expect(price).to.be.eq(expandDecimals(105, 28));
    expect(value).to.be.eq(expandDecimals(115_500, 30));
    expect(supply).to.be.eq(expandDecimals(110_000, 18));

    await handleGlvWithdrawal(fixture, {
      create: {
        glvTokenAmount: expandDecimals(1000, 18),
        market: solUsdMarket,
      },
    });

    [price, value, supply] = await getGlvTokenPrice();
    expect(price).to.be.eq(expandDecimals(1, 30));
    expect(value).to.be.eq(expandDecimals(109_000, 30));
    expect(supply).to.be.eq(expandDecimals(109_000, 18));
  });
});
