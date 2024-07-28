import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { handleGlvDeposit, createGlvShift, handleGlvShift, getGlvShiftKeys, executeGlvShift } from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { decimalToFloat, expandDecimals } from "../../utils/math";
import { getBalanceOf } from "../../utils/token";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("Glv Shifts", () => {
  const { provider } = ethers;

  let fixture;
  let glvReader, dataStore, ethUsdMarket, solUsdMarket, wnt, sol, usdc, ethUsdGlvAddress;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ glvReader, dataStore, ethUsdMarket, solUsdMarket, wnt, sol, usdc, ethUsdGlvAddress } = fixture.contracts);
  });

  it("create glv shift", async () => {
    const tokens = [wnt.address, usdc.address, sol.address];
    const precisions = [8, 18, 8];
    const minPrices = [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];
    const maxPrices = [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];

    await handleGlvDeposit(fixture, {
      create: {
        glv: ethUsdGlvAddress,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(9 * 5000, 6),
        tokens,
        precisions,
        minPrices,
        maxPrices,
      },
      execute: {
        tokens,
        precisions,
        minPrices,
        maxPrices,
      },
    });

    await createGlvShift(fixture, {
      glv: ethUsdGlvAddress,
      fromMarket: ethUsdMarket,
      toMarket: solUsdMarket,
      marketTokenAmount: expandDecimals(100, 18),
      minMarketTokens: expandDecimals(99, 18),
      executionFee: 500,
    });

    const block = await provider.getBlock("latest");
    const glvShiftKeys = await getGlvShiftKeys(dataStore, 0, 1);
    expect(glvShiftKeys.length).to.eq(1);
    const glvShift = await glvReader.getGlvShift(dataStore.address, glvShiftKeys[0]);

    expect(glvShift.addresses.glv).eq(ethUsdGlvAddress);
    expect(glvShift.addresses.fromMarket).eq(ethUsdMarket.marketToken);
    expect(glvShift.addresses.toMarket).eq(solUsdMarket.marketToken);
    expect(glvShift.numbers.marketTokenAmount).eq(expandDecimals(100, 18));
    expect(glvShift.numbers.minMarketTokens).eq(expandDecimals(99, 18));
    expect(glvShift.numbers.updatedAtTime).eq(block.timestamp);
    expect(glvShift.numbers.executionFee).eq("500");
  });

  it("execute glv shift", async () => {
    expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).to.be.eq(0);

    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).to.be.eq(expandDecimals(10000, 18));
    expect(await getBalanceOf(solUsdMarket.marketToken, ethUsdGlvAddress)).to.be.eq(0);

    await handleGlvShift(fixture, {
      create: {
        fromMarket: ethUsdMarket,
        toMarket: solUsdMarket,
        marketTokenAmount: expandDecimals(1000, 18),
        minMarketTokens: expandDecimals(1000, 18),
      },
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).to.be.eq(expandDecimals(9000, 18));
    expect(await getBalanceOf(solUsdMarket.marketToken, ethUsdGlvAddress)).to.be.eq(expandDecimals(1000, 18));
  });

  describe("execute glv shift, validations", () => {
    it.skip("EmptyGlvShift", async () => {
      await expect(executeGlvShift(fixture, { key: ethers.constants.HashZero })).to.be.revertedWithCustomError(
        errorsContract,
        "EmptyGlvShift"
      );
    });

    it("MinMarketTokens", async () => {
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(1, 18),
          shortTokenAmount: expandDecimals(5000, 6),
        },
      });
      await handleGlvShift(fixture, {
        create: {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(1000, 18),
          minMarketTokens: expandDecimals(1001, 18),
        },
        execute: {
          expectedCancellationReason: {
            name: "MinMarketTokens",
            args: [expandDecimals(1000, 18), expandDecimals(1001, 18)],
          },
        },
      });

      await handleGlvShift(fixture, {
        create: {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(1000, 18),
          minMarketTokens: expandDecimals(1000, 18),
        },
      });
    });

    it("GlvShiftIntervalNotYetPassed", async () => {
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(1, 18),
          shortTokenAmount: expandDecimals(5000, 6),
        },
      });

      const createGlvShiftParams = {
        fromMarket: ethUsdMarket,
        toMarket: solUsdMarket,
        marketTokenAmount: expandDecimals(1000, 18),
        minMarketTokens: expandDecimals(1000, 18),
      };

      expect(await dataStore.getUint(keys.glvShiftMinIntervalKey(ethUsdGlvAddress))).to.be.eq(0);
      // can execute multiple shifts in a row
      await handleGlvShift(fixture, { create: createGlvShiftParams });
      await handleGlvShift(fixture, { create: createGlvShiftParams });

      let lastGlvShiftExecutedAt = await time.latest();

      await createGlvShift(fixture, createGlvShiftParams);
      await dataStore.setUint(keys.glvShiftMinIntervalKey(ethUsdGlvAddress), 60);

      await expect(createGlvShift(fixture, createGlvShiftParams)).to.be.revertedWithCustomError(
        errorsContract,
        "GlvShiftIntervalNotYetPassed"
      );

      await expect(executeGlvShift(fixture)).to.be.revertedWithCustomError(
        errorsContract,
        "GlvShiftIntervalNotYetPassed"
      );

      await time.setNextBlockTimestamp(lastGlvShiftExecutedAt + 60);
      await executeGlvShift(fixture);

      lastGlvShiftExecutedAt = await time.latest();
      await time.setNextBlockTimestamp(lastGlvShiftExecutedAt + 60);
      await createGlvShift(fixture, createGlvShiftParams);
    });

    it("GlvMaxMarketTokenBalanceUsdExceeded", async () => {
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(1, 18),
          shortTokenAmount: expandDecimals(5000, 6),
        },
      });

      await dataStore.setUint(
        keys.glvMaxMarketTokenBalanceUsdKey(ethUsdGlvAddress, solUsdMarket.marketToken),
        expandDecimals(999, 30)
      );
      await handleGlvShift(fixture, {
        create: {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(1000, 18),
          minMarketTokens: expandDecimals(1000, 18),
        },
        execute: {
          expectedCancellationReason: {
            name: "GlvMaxMarketTokenBalanceUsdExceeded",
            args: [ethUsdGlvAddress, solUsdMarket.marketToken, expandDecimals(999, 30), expandDecimals(1000, 30)],
          },
        },
      });

      await handleGlvShift(fixture, {
        create: {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(999, 18),
          minMarketTokens: expandDecimals(999, 18),
        },
      });
    });

    it("GlvMaxMarketTokenBalanceAmountExceeded", async () => {
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(1, 18),
          shortTokenAmount: expandDecimals(5000, 6),
        },
      });

      await dataStore.setUint(
        keys.glvMaxMarketTokenBalanceAmountKey(ethUsdGlvAddress, solUsdMarket.marketToken),
        expandDecimals(500, 18)
      );
      await handleGlvShift(fixture, {
        create: {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(501, 18),
          minMarketTokens: expandDecimals(501, 18),
        },
        execute: {
          expectedCancellationReason: {
            name: "GlvMaxMarketTokenBalanceAmountExceeded",
            args: [ethUsdGlvAddress, solUsdMarket.marketToken, expandDecimals(500, 18), expandDecimals(501, 18)],
          },
        },
      });

      await handleGlvShift(fixture, {
        create: {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(500, 18),
          minMarketTokens: expandDecimals(500, 18),
        },
      });
    });

    it.skip("OracleTimestampsAreLargerThanRequestExpirationTime");

    it.only("GlvShiftMaxPriceImpactExceeded", async () => {
      // make first pool imbalanced
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(2, 18),
          shortTokenAmount: 0,
        },
      });
      await handleGlvDeposit(fixture, {
        create: {
          market: solUsdMarket,
          longTokenAmount: expandDecimals(2, 18),
          shortTokenAmount: expandDecimals(10_000, 6),
        },
      });

      // $1 for $1000 diff
      await dataStore.setUint(keys.swapImpactFactorKey(solUsdMarket.marketToken, false), decimalToFloat(1, 6));
      await dataStore.setUint(keys.swapImpactFactorKey(solUsdMarket.marketToken, true), decimalToFloat(5, 7));
      await dataStore.setUint(keys.swapImpactExponentFactorKey(solUsdMarket.marketToken), decimalToFloat(2, 0));

      await handleGlvShift(fixture, {
        create: {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(1000, 18),
        },
        execute: {
          expectedCancellationReason: {
            name: "GlvShiftMaxPriceImpactExceeded",

            // 0.1%
            args: [decimalToFloat(1, 3), 0],
          },
        },
      });

      await dataStore.setUint(keys.glvShiftMaxPriceImpactFactorKey(ethUsdGlvAddress), decimalToFloat(9, 4)); // 0.09%
      await handleGlvShift(fixture, {
        create: {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(1000, 18),
        },
        execute: {
          expectedCancellationReason: {
            name: "GlvShiftMaxPriceImpactExceeded",

            // 0.1%
            args: [decimalToFloat(1, 3), decimalToFloat(9, 4)],
          },
        },
      });

      await dataStore.setUint(keys.glvShiftMaxPriceImpactFactorKey(ethUsdGlvAddress), decimalToFloat(1, 3)); // 0.09%
      await handleGlvShift(fixture, {
        create: {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(1000, 18),
        },
      });

      await handleGlvDeposit(fixture, {
        create: {
          market: solUsdMarket,
          longTokenAmount: 0,
          shortTokenAmount: expandDecimals(100_000, 6),
        },
      });

      // positive impact is always allowed
      await dataStore.setUint(keys.glvShiftMaxPriceImpactFactorKey(ethUsdGlvAddress), 0);
      await handleGlvShift(fixture, {
        create: {
          fromMarket: ethUsdMarket,
          toMarket: solUsdMarket,
          marketTokenAmount: expandDecimals(1000, 18),
        },
      });
    });
  });
});
