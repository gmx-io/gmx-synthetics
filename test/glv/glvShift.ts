import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import {
  handleGlvDeposit,
  createGlvShift,
  handleGlvShift,
  getGlvShiftKeys,
  executeGlvShift,
  getGlvShiftCount,
} from "../../utils/glv";
import { deployFixture } from "../../utils/fixture";
import { decimalToFloat, expandDecimals } from "../../utils/math";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { expectBalances, expectCancellationReason } from "../../utils/validation";

describe("Glv Shifts", () => {
  const { provider } = ethers;

  let fixture;
  let glvReader, dataStore, ethUsdMarket, solUsdMarket, btcUsdMarket, ethUsdGlvAddress;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ glvReader, dataStore, ethUsdMarket, solUsdMarket, btcUsdMarket, ethUsdGlvAddress } = fixture.contracts);
  });

  it("create glv shift", async () => {
    await handleGlvDeposit(fixture, {
      create: {
        glv: ethUsdGlvAddress,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(9 * 5000, 6),
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

  describe("create glv shift, validations", () => {
    const params = {
      glv: ethUsdGlvAddress,
      fromMarket: ethUsdMarket,
      toMarket: solUsdMarket,
      marketTokenAmount: expandDecimals(100, 18),
      minMarketTokens: expandDecimals(99, 18),
      executionFee: 500,
    };

    it("InsufficientWntAmountForExecutionFee", async () => {
      await expect(
        createGlvShift(fixture, { ...params, executionFeeToMint: 0, executionFee: 2 })
      ).to.be.revertedWithCustomError(errorsContract, "InsufficientWntAmountForExecutionFee");

      createGlvShift(fixture, { ...params, executionFeeToMint: 1_000_000, executionFee: 1_000_000 });
    });

    it("InsufficientExecutionFee", async () => {
      await dataStore.setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));
      await dataStore.setUint(keys.glvShiftGasLimitKey(), 1_000_000);
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(1, 18),
          shortTokenAmount: expandDecimals(5000, 6),
        },
      });
      await expect(createGlvShift(fixture, { ...params, executionFee: 1 }))
        .to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee")
        .withArgs("1000000008000000", "1");

      await createGlvShift(fixture, { ...params, executionFee: "1000000008000000" });
    });

    it("EmptyGlv", async () => {
      const badGlvAddress = ethers.constants.AddressZero.slice(0, -1) + "C";
      await expect(createGlvShift(fixture, { ...params, glv: badGlvAddress }))
        .to.be.revertedWithCustomError(errorsContract, "EmptyGlv")
        .withArgs(badGlvAddress);
    });

    it("GlvUnsupportedMarket", async () => {
      await expect(createGlvShift(fixture, { ...params, fromMarket: btcUsdMarket }))
        .to.be.revertedWithCustomError(errorsContract, "GlvUnsupportedMarket")
        .withArgs(ethUsdGlvAddress, btcUsdMarket.marketToken);

      await expect(createGlvShift(fixture, { ...params, toMarket: btcUsdMarket }))
        .to.be.revertedWithCustomError(errorsContract, "GlvUnsupportedMarket")
        .withArgs(ethUsdGlvAddress, btcUsdMarket.marketToken);
    });

    it("GlvDisabledMarket", async () => {
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(1, 18),
          shortTokenAmount: expandDecimals(5000, 6),
          market: solUsdMarket,
        },
      });

      await dataStore.setBool(keys.isGlvMarketDisabledKey(ethUsdGlvAddress, solUsdMarket.marketToken), true);
      await expect(createGlvShift(fixture, params))
        .to.be.revertedWithCustomError(errorsContract, "GlvDisabledMarket")
        .withArgs(ethUsdGlvAddress, solUsdMarket.marketToken);

      // the opposite is okay
      // it is possible to move liquidity FROM disabled market
      await createGlvShift(fixture, { fromMarket: solUsdMarket, toMarket: ethUsdMarket });
    });

    it("GlvInsufficientMarketTokenBalance", async () => {
      await handleGlvDeposit(fixture, {
        create: {
          longTokenAmount: expandDecimals(1, 18),
          shortTokenAmount: expandDecimals(5000, 6),
        },
      });

      await expect(createGlvShift(fixture, { params, marketTokenAmount: expandDecimals(10001, 18) }))
        .to.be.revertedWithCustomError(errorsContract, "GlvInsufficientMarketTokenBalance")
        .withArgs(ethUsdGlvAddress, ethUsdMarket.marketToken, expandDecimals(10000, 18), expandDecimals(10001, 18));

      await createGlvShift(fixture, { params, marketTokenAmount: expandDecimals(10000, 18) });
    });
  });

  it("execute glv shift", async () => {
    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: 0,
      },
    });

    await handleGlvDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
    });

    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(10000, 18),
        [solUsdMarket.marketToken]: 0,
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

    await expectBalances({
      [ethUsdGlvAddress]: {
        [ethUsdMarket.marketToken]: expandDecimals(9000, 18),
        [solUsdMarket.marketToken]: expandDecimals(1000, 18),
      },
    });
  });

  describe("execute glv shift, validations", () => {
    it("GlvShiftNotFound", async () => {
      const key = ethers.constants.HashZero.slice(0, -1) + "f";
      await expect(executeGlvShift(fixture, { key }))
        .to.be.revertedWithCustomError(errorsContract, "GlvShiftNotFound")
        .withArgs(key);
    });

    describe("with initial deposit", () => {
      // just to avoid copy-pasting `handleGlvDeposit` in all tests
      beforeEach(async () => {
        await handleGlvDeposit(fixture, {
          create: {
            longTokenAmount: expandDecimals(1, 18),
            shortTokenAmount: expandDecimals(5000, 6),
          },
        });
      });

      it("MinMarketTokens", async () => {
        await handleGlvShift(fixture, {
          create: {
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
            marketTokenAmount: expandDecimals(1000, 18),
            minMarketTokens: expandDecimals(1000, 18),
          },
        });
      });

      it("GlvShiftIntervalNotYetPassed", async () => {
        const params = {
          marketTokenAmount: expandDecimals(1000, 18),
          minMarketTokens: expandDecimals(1000, 18),
        };

        expect(await dataStore.getUint(keys.glvShiftMinIntervalKey(ethUsdGlvAddress))).to.be.eq(0);
        // can execute multiple shifts in a row
        await handleGlvShift(fixture, { create: params });
        await handleGlvShift(fixture, { create: params });

        await createGlvShift(fixture, params);
        await createGlvShift(fixture, params);
        await dataStore.setUint(keys.glvShiftMinIntervalKey(ethUsdGlvAddress), 300);
        const lastGlvShiftExecutedAt = await time.latest();

        await expect(createGlvShift(fixture, params)).to.be.revertedWithCustomError(
          errorsContract,
          "GlvShiftIntervalNotYetPassed"
        );

        expect(await getGlvShiftCount(dataStore)).to.be.eq(2);

        await executeGlvShift(fixture, {
          expectedCancellationReason: "GlvShiftIntervalNotYetPassed",
        });

        expect(await getGlvShiftCount(dataStore)).to.be.eq(1);
        await time.setNextBlockTimestamp(lastGlvShiftExecutedAt + 300);
        await executeGlvShift(fixture);
        expect(await getGlvShiftCount(dataStore)).to.be.eq(0);
      });

      it("GlvMaxMarketTokenBalanceUsdExceeded", async () => {
        await dataStore.setUint(
          keys.glvMaxMarketTokenBalanceUsdKey(ethUsdGlvAddress, solUsdMarket.marketToken),
          expandDecimals(999, 30)
        );
        await handleGlvShift(fixture, {
          create: {
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
            marketTokenAmount: expandDecimals(999, 18),
            minMarketTokens: expandDecimals(999, 18),
          },
        });
      });

      it("GlvMaxMarketTokenBalanceAmountExceeded", async () => {
        await dataStore.setUint(
          keys.glvMaxMarketTokenBalanceAmountKey(ethUsdGlvAddress, solUsdMarket.marketToken),
          expandDecimals(500, 18)
        );
        await handleGlvShift(fixture, {
          create: {
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
            marketTokenAmount: expandDecimals(500, 18),
            minMarketTokens: expandDecimals(500, 18),
          },
        });
      });

      it("OracleTimestampsAreLargerThanRequestExpirationTime", async () => {
        await createGlvShift(fixture, {
          marketTokenAmount: expandDecimals(1000, 18),
        });
        const block = await time.latestBlock();
        await expect(
          executeGlvShift(fixture, {
            oracleBlockNumber: block - 1,
          })
        ).to.be.revertedWithCustomError(errorsContract, "OracleTimestampsAreSmallerThanRequired");
        await executeGlvShift(fixture, {
          oracleBlockNumber: block,
        });
      });
    });

    it("GlvShiftMaxPriceImpactExceeded", async () => {
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

      await dataStore.setUint(keys.glvShiftMaxPriceImpactFactorKey(ethUsdGlvAddress), decimalToFloat(1, 3)); // 0.1%
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