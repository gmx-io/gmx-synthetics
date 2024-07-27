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
import { decimalToFloat, expandDecimals } from "../../utils/math";
import { getBalanceOf } from "../../utils/token";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { increaseTime } from "../../utils/time";
import { printGasUsage } from "../../utils/gas";
import { contractAt } from "../../utils/deploy";
import { BigNumberish } from "ethers";
import { handleDeposit } from "../../utils/deposit";

function getPriceProp(price: BigNumberish, decimals: number) {
  return {
    min: expandDecimals(price, decimals),
    max: expandDecimals(price, decimals),
  };
}

describe("Glv Token Price", () => {
  let fixture;
  let glvReader, reader, dataStore, ethUsdMarket, solUsdMarket, ethUsdGlvAddress, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ glvReader, wnt, usdc, reader, dataStore, ethUsdMarket, solUsdMarket, ethUsdGlvAddress } = fixture.contracts);
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
      return [price, value, supply];
    }

    // deposit $50k WETH / $50k USDC directly at different price
    // for market token and glv token prices differ
    await handleDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(8, 18),
        shortTokenAmount: expandDecimals(10 * 5000, 6),
      },
      execute: {
        minPrices: [expandDecimals(6250, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(6250, 4), expandDecimals(1, 6)],
      },
    });

    let [price, value, supply] = await getGlvTokenPrice();

    expect(price).to.be.eq(expandDecimals(1, 30));
    expect(value).to.be.eq(0);
    expect(supply).to.be.eq(0);

    // at eth price = $5k pool is $40k WETH / $50k USDC
    // deposit $55k WETH / $45 USDC to balance the pool to simplify calculations
    // new eth:usd pool size is $95k WETH / $95k USDC
    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(11, 18),
        shortTokenAmount: expandDecimals(9 * 5000, 6),
      },
    });

    [price, value, supply] = await getGlvTokenPrice();

    // deposited $100k
    expect(price).to.be.closeTo(expandDecimals(1, 30), expandDecimals(1, 15));
    expect(value).to.be.closeTo(expandDecimals(100_000, 30), expandDecimals(1, 15));
    expect(supply).to.be.closeTo(expandDecimals(100_000, 18), 100);

    await handleGlvDeposit(fixture, {
      create: {
        market: solUsdMarket,
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5_000, 6),
      },
    });

    // deposited $10k, total is $110k
    [price, value, supply] = await getGlvTokenPrice();
    expect(price).to.be.closeTo(expandDecimals(1, 30), expandDecimals(1, 24));
    expect(value).to.be.closeTo(expandDecimals(110_000, 30), expandDecimals(1, 24));
    expect(supply).to.be.closeTo(expandDecimals(110_000, 18), 100);

    await handleGlvShift(fixture, {
      create: {
        fromMarket: ethUsdMarket,
        toMarket: solUsdMarket,
        marketTokenAmount: expandDecimals(10_000, 18),
      },
    });

    // price/value/supply should not change
    [price, value, supply] = await getGlvTokenPrice();
    expect(price).to.be.closeTo(expandDecimals(1, 30), expandDecimals(1, 24));
    expect(value).to.be.closeTo(expandDecimals(110_000, 30), expandDecimals(1, 24));
    expect(supply).to.be.closeTo(expandDecimals(110_000, 18), 100);

    // const wethBalanceForEthUsdMarket = await getBalanceOf(wnt.address, ethUsdMarket.marketToken);
    // const usdcBalanceForEthUsdMarket = await getBalanceOf(usdc.address, ethUsdMarket.marketToken);
    // const wethBalanceForSolUsdMarket = await getBalanceOf(wnt.address, solUsdMarket.marketToken);
    // const usdcBalanceForSolUsdMarket = await getBalanceOf(usdc.address, solUsdMarket.marketToken);

    // console.log("weth total balance: %s", wethBalanceForEthUsdMarket.add(wethBalanceForSolUsdMarket));
    // console.log("usdc total balance: %s", usdcBalanceForEthUsdMarket.add(usdcBalanceForSolUsdMarket));

    // const ethUsdMarketBalance = await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress);
    // const solUsdMarketBalance = await getBalanceOf(solUsdMarket.marketToken, ethUsdGlvAddress);

    // const [ethUsdMarketTokenPrice] = await reader.getMarketTokenPrice(
    //   dataStore.address,
    //   ethUsdMarket,
    //   getPriceProp(6000, 12),
    //   getPriceProp(6000, 12),
    //   getPriceProp(1, 24),
    //   ethers.constants.HashZero,
    //   true
    // );
    // const [solUsdMarketTokenPrice] = await reader.getMarketTokenPrice(
    //   dataStore.address,
    //   solUsdMarket,
    //   getPriceProp(600, 12),
    //   getPriceProp(6000, 12),
    //   getPriceProp(1, 24),
    //   ethers.constants.HashZero,
    //   true
    // );
    // console.log(2);

    // console.log(
    //   "eth market. balance: %s price: %s value: %s",
    //   ethUsdMarketBalance,
    //   ethUsdMarketTokenPrice,
    //   ethUsdMarketTokenPrice.mul(ethUsdMarketBalance).div(expandDecimals(1, 18))
    // );
    // console.log(
    //   "sol market. balance: %s price: %s value: %s",
    //   solUsdMarketBalance,
    //   solUsdMarketTokenPrice,
    //   solUsdMarketTokenPrice.mul(solUsdMarketBalance).div(expandDecimals(1, 18))
    // );

    // eth price grew by 20%, GLV value grew by 10%
    [price, value, supply] = await getGlvTokenPrice(6000);

    expect(price).to.be.closeTo(expandDecimals(11, 29), expandDecimals(1, 24));
    expect(value).to.be.closeTo(expandDecimals(121_000, 30), expandDecimals(1, 24));
    expect(supply).to.be.closeTo(expandDecimals(110_000, 18), 100);

    await handleGlvWithdrawal(fixture, {
      create: {
        glvTokenAmount: expandDecimals(1000, 18),
        market: solUsdMarket,
      },
    });

    [price, value, supply] = await getGlvTokenPrice();
    expect(price).to.be.closeTo(expandDecimals(1, 30), expandDecimals(1, 24));
    expect(value).to.be.closeTo(expandDecimals(109_000, 30), expandDecimals(1, 24));
    expect(supply).to.be.closeTo(expandDecimals(109_000, 18), 100);
  });
});
