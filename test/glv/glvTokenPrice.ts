import { expect } from "chai";
import { ethers } from "hardhat";

import { handleGlvDeposit, handleGlvShift, handleGlvWithdrawal } from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { decimalToFloat, expandDecimals } from "../../utils/math";
import { getBalanceOf } from "../../utils/token";
import { BigNumberish } from "ethers";
import { handleDeposit } from "../../utils/deposit";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import * as keys from "../../utils/keys";

function getPriceProp(price: BigNumberish, decimals: number) {
  return {
    min: expandDecimals(price, decimals),
    max: expandDecimals(price, decimals),
  };
}

describe("Glv Token Price", () => {
  let fixture: Awaited<ReturnType<typeof deployFixture>>;
  let user0: SignerWithAddress;
  let glvReader, dataStore, ethUsdMarket, solUsdMarket, ethUsdGlvAddress, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0 } = fixture.accounts);
    ({ glvReader, wnt, usdc, dataStore, ethUsdMarket, solUsdMarket, ethUsdGlvAddress } = fixture.contracts);
  });

  it("glv token price", async () => {
    await dataStore.setUint(keys.glvShiftMaxPriceImpactFactorKey(ethUsdGlvAddress), decimalToFloat(1, 3));

    async function expectGlvTokenPrice({
      price: expectedPrice,
      value: expectedValue,
      supply: expectedSupply,
      ethPrice = 5000,
    }) {
      const [price, value, supply] = await glvReader.getGlvTokenPrice(
        dataStore.address,
        [ethUsdMarket.marketToken, solUsdMarket.marketToken],
        [getPriceProp(ethPrice, 12), getPriceProp(600, 12)],
        getPriceProp(ethPrice, 12),
        getPriceProp(1, 24),
        ethUsdGlvAddress,
        true
      );

      expect(price, "glv token price").to.be.closeTo(expectedPrice, expandDecimals(1, 24));
      expect(value, "glv value").to.be.closeTo(expectedValue, expandDecimals(1, 24));
      expect(supply, "glv supply").to.be.closeTo(expectedSupply, expandDecimals(1, 13));
    }

    async function expectBalances({
      glv,
      user,
    }: {
      glv?: {
        ethUsdMarket?: BigNumberish;
        solUsdMarket?: BigNumberish;
      };
      user?: {
        ethUsdMarket?: BigNumberish;
        solUsdMarket?: BigNumberish;
        glv?: BigNumberish;
        wnt?: BigNumberish;
        usdc?: BigNumberish;
      };
    } = {}) {
      // glv
      expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress), "glv.ethUsdMarket").to.be.closeTo(
        glv?.ethUsdMarket ?? 0,
        expandDecimals(1, 13)
      );
      expect(await getBalanceOf(solUsdMarket.marketToken, ethUsdGlvAddress), "glv.solUsdMarket").to.be.closeTo(
        glv?.solUsdMarket ?? 0,
        expandDecimals(1, 13)
      );
      // user
      expect(await getBalanceOf(ethUsdGlvAddress, user0.address), "user.glv").to.be.closeTo(
        user?.glv ?? 0,
        expandDecimals(1, 13)
      );
      expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address), "user.ethUsdMarket").to.be.closeTo(
        user?.ethUsdMarket ?? 0,
        expandDecimals(1, 13)
      );
      expect(await getBalanceOf(solUsdMarket.marketToken, user0.address), "user.solUsdMarket").to.be.closeTo(
        user?.solUsdMarket ?? 0,
        expandDecimals(1, 13)
      );
      expect(await getBalanceOf(wnt.address, user0.address), "user.wnt").to.be.closeTo(
        user?.wnt ?? 0,
        expandDecimals(1, 13)
      );
      expect(await getBalanceOf(usdc.address, user0.address), "user.usdc").to.be.closeTo(
        user?.usdc ?? 0,
        expandDecimals(1, 13)
      );
    }

    // all zeroes
    await expectBalances();

    // deposit $50k WETH / $50k USDC directly at different eth price $6250
    // for market token and glv token prices to differ
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

    await expectBalances({
      user: {
        ethUsdMarket: expandDecimals(100_000, 18),
      },
    });
    await expectGlvTokenPrice({
      price: expandDecimals(1, 30),
      value: 0,
      supply: 0,
    });

    // at eth price = $5k pool is $40k WETH / $50k USDC
    // deposit $55k WETH / $45 USDC to balance the pool to simplify calculations
    // new eth:usd pool size is $95k WETH / $95k USDC
    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(11, 18),
        shortTokenAmount: expandDecimals(9 * 5000, 6),
      },
    });

    // deposited $100k
    // at eth price $5000 GM token price is $0.90
    // so 111,111 GM tokens worth ~$100,000
    await expectBalances({
      glv: {
        ethUsdMarket: "111111111111111111111111",
      },
      user: {
        glv: expandDecimals(100_000, 18),
        ethUsdMarket: expandDecimals(100_000, 18),
      },
    });
    await expectGlvTokenPrice({
      price: expandDecimals(1, 30),
      value: expandDecimals(100_000, 30),
      supply: expandDecimals(100_000, 18),
    });

    await handleGlvDeposit(fixture, {
      create: {
        market: solUsdMarket,
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5_000, 6),
      },
    });

    // deposited $10k, total is $110k
    await expectBalances({
      glv: {
        ethUsdMarket: "111111111111111111111111",
        solUsdMarket: expandDecimals(10_000, 18),
      },
      user: {
        glv: expandDecimals(110_000, 18),
        ethUsdMarket: expandDecimals(100_000, 18),
      },
    });
    await expectGlvTokenPrice({
      price: expandDecimals(1, 30),
      value: expandDecimals(110_000, 30),
      supply: expandDecimals(110_000, 18),
    });

    await handleGlvShift(fixture, {
      create: {
        fromMarket: ethUsdMarket,
        toMarket: solUsdMarket,

        // 11,111 GM tokens worth ~$10,000
        marketTokenAmount: "11111111111111111111111",
      },
    });

    // price/value/supply should not change
    await expectBalances({
      glv: {
        ethUsdMarket: expandDecimals(100_000, 18),
        solUsdMarket: expandDecimals(20_000, 18),
      },
      user: {
        glv: expandDecimals(110_000, 18),
        ethUsdMarket: expandDecimals(100_000, 18),
      },
    });
    await expectGlvTokenPrice({
      price: expandDecimals(1, 30),
      value: expandDecimals(110_000, 30),
      supply: expandDecimals(110_000, 18),
    });

    // eth price grew by 20%, GLV value grew by 10%
    await expectGlvTokenPrice({
      price: expandDecimals(11, 29),
      value: expandDecimals(121_000, 30),
      supply: expandDecimals(110_000, 18),
      ethPrice: 6000,
    });

    await handleGlvWithdrawal(fixture, {
      create: {
        glvTokenAmount: expandDecimals(1000, 18),
        market: solUsdMarket,
      },
    });

    // withdrew $1k
    await expectBalances({
      glv: {
        ethUsdMarket: expandDecimals(100_000, 18),
        solUsdMarket: expandDecimals(19_000, 18),
      },
      user: {
        glv: expandDecimals(109_000, 18),
        ethUsdMarket: expandDecimals(100_000, 18),
        wnt: expandDecimals(1, 17),
        usdc: expandDecimals(500, 6),
      },
    });

    await expectGlvTokenPrice({
      price: expandDecimals(1, 30),
      value: expandDecimals(109_000, 30),
      supply: expandDecimals(109_000, 18),
    });

    await handleGlvDeposit(fixture, {
      create: {
        // eth usd token price is $0.90
        marketTokenAmount: expandDecimals(10_000, 18),
        market: ethUsdMarket,
        isMarketTokenDeposit: true,
        initialLongToken: ethers.constants.AddressZero,
        initialShortToken: ethers.constants.AddressZero,
      },
    });

    await expectGlvTokenPrice({
      price: expandDecimals(1, 30),
      value: expandDecimals(118_000, 30),
      supply: expandDecimals(118_000, 18),
    });
    await expectBalances({
      glv: {
        ethUsdMarket: expandDecimals(110_000, 18),
        solUsdMarket: expandDecimals(19_000, 18),
      },
      user: {
        glv: expandDecimals(118_000, 18),
        ethUsdMarket: expandDecimals(90_000, 18),
        wnt: expandDecimals(1, 17),
        usdc: expandDecimals(500, 6),
      },
    });
  });
});
