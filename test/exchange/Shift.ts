import { expect } from "chai";

import { usingResult } from "../../utils/use";
import { deployFixture } from "../../utils/fixture";
import { deployContract } from "../../utils/deploy";
import { bigNumberify, expandDecimals, decimalToFloat } from "../../utils/math";
import { getBalanceOf, getSupplyOf } from "../../utils/token";
import { handleDeposit } from "../../utils/deposit";
import { getClaimableFeeAmount } from "../../utils/fee";
import {
  getPoolAmount,
  getSwapImpactPoolAmount,
  getMarketTokenPrice,
  getMarketTokenPriceWithPoolValue,
} from "../../utils/market";
import { getShiftCount, getShiftKeys, createShift, executeShift, handleShift } from "../../utils/shift";
import { getExecuteParams } from "../../utils/exchange";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import { SwapPricingType } from "../../utils/swap";
import { prices } from "../../utils/prices";

describe("Exchange.Shift", () => {
  const { provider } = ethers;
  const { AddressZero, HashZero } = ethers.constants;

  let fixture;
  let user0, user1, user2, user3;
  let reader, dataStore, shiftVault, shiftHandler, shiftStoreUtils, ethUsdMarket, solUsdMarket, wnt, usdc, wbtc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({ reader, dataStore, shiftVault, shiftHandler, shiftStoreUtils, ethUsdMarket, solUsdMarket, wnt, usdc, wbtc } =
      fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
    });
  });

  it("createShift", async () => {
    await createShift(fixture, {
      receiver: user1,
      callbackContract: user2,
      uiFeeReceiver: user3,
      fromMarket: ethUsdMarket,
      toMarket: solUsdMarket,
      marketTokenAmount: expandDecimals(7500, 18),
      minMarketTokens: expandDecimals(7000, 18),
      executionFee: 500,
      callbackGasLimit: 200_000,
    });

    const block = await provider.getBlock();
    const shiftKeys = await getShiftKeys(dataStore, 0, 1);
    const shift = await reader.getShift(dataStore.address, shiftKeys[0]);

    expect(shift.addresses.account).eq(user0.address);
    expect(shift.addresses.receiver).eq(user1.address);
    expect(shift.addresses.callbackContract).eq(user2.address);
    expect(shift.addresses.fromMarket).eq(ethUsdMarket.marketToken);
    expect(shift.addresses.toMarket).eq(solUsdMarket.marketToken);
    expect(shift.numbers.marketTokenAmount).eq(expandDecimals(7500, 18));
    expect(shift.numbers.minMarketTokens).eq(expandDecimals(7000, 18));
    expect(shift.numbers.updatedAtTime).eq(block.timestamp);
    expect(shift.numbers.executionFee).eq("500");
    expect(shift.numbers.callbackGasLimit).eq("200000");
  });

  it("cancelShift", async () => {
    await createShift(fixture, {
      marketTokenAmount: expandDecimals(7500, 18),
    });

    const shiftKeys = await getShiftKeys(dataStore, 0, 1);

    await expect(shiftHandler.connect(user0).cancelShift(shiftKeys[0]))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user0.address, "CONTROLLER");

    // TODO: test refunding of market tokens after cancel
  });

  it("executeShift", async () => {
    await dataStore.setUint(keys.swapFeeFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 4));
    await dataStore.setUint(keys.swapFeeFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(5, 4));

    await createShift(fixture, {
      marketTokenAmount: expandDecimals(7500, 18),
      receiver: user1,
    });

    const shiftKeys = await getShiftKeys(dataStore, 0, 1);
    let shift = await reader.getShift(dataStore.address, shiftKeys[0]);

    expect(shift.addresses.account).eq(user0.address);
    expect(await getShiftCount(dataStore)).eq(1);

    await executeShift(fixture, { gasUsageLabel: "executeShift" });

    shift = await reader.getShift(dataStore.address, shiftKeys[0]);

    expect(shift.addresses.account).eq(AddressZero);
    expect(await getSupplyOf(ethUsdMarket.marketToken)).eq(expandDecimals(2500, 18));
    expect(await getSupplyOf(solUsdMarket.marketToken)).eq(expandDecimals(7500, 18));
    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(2500, 18));
    expect(await getBalanceOf(solUsdMarket.marketToken, user0.address)).eq(0);
    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq(0);
    expect(await getBalanceOf(solUsdMarket.marketToken, user1.address)).eq(expandDecimals(7500, 18));
    expect(await getShiftCount(dataStore)).eq(0);

    await expect(
      executeShift(fixture, {
        shiftKey: HashZero,
        oracleBlockNumber: (await provider.getBlock()).number,
        gasUsageLabel: "executeShift",
      })
    ).to.be.revertedWithCustomError(errorsContract, "EmptyShift");
  });

  it("simulateExecuteShift", async () => {
    await expect(
      shiftHandler.connect(user0).simulateExecuteShift(HashZero, {
        primaryTokens: [],
        primaryPrices: [],
        minTimestamp: 0,
        maxTimestamp: 0,
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user0.address, "CONTROLLER");
  });

  it("_executeShift", async () => {
    const shiftStoreUtilsTest = await deployContract("ShiftStoreUtilsTest", [], {
      libraries: {
        ShiftStoreUtils: shiftStoreUtils.address,
      },
    });

    const emptyShift = await shiftStoreUtilsTest.getEmptyShift();

    await expect(shiftHandler.connect(user0)._executeShift(HashZero, emptyShift, user0.address))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user0.address, "SELF");
  });

  it("spot only market", async () => {
    // TODO: test spot only market
  });

  it("handle shift error", async () => {
    // TODO: test handling of shift error
  });

  it("single token market", async () => {
    // TODO: test shift for single token market
  });
});
