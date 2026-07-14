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
import { grantRole } from "../../utils/role";
import { parseLogs, getEventData } from "../../utils/event";
import { increaseTime } from "../../utils/time";
import * as keys from "../../utils/keys";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import { SwapPricingType } from "../../utils/swap";
import { prices } from "../../utils/prices";

describe("Exchange.Shift", () => {
  const { provider } = ethers;
  const { AddressZero, HashZero } = ethers.constants;

  let fixture;
  let user0, user1, user2, user3;
  let reader,
    dataStore,
    shiftVault,
    shiftHandler,
    shiftStoreUtils,
    roleStore,
    withdrawalHandler,
    ethUsdMarket,
    solUsdMarket,
    btcUsdMarket,
    ethUsdSpotOnlyMarket,
    ethUsdSingleTokenMarket,
    btcUsdSingleTokenMarket,
    wnt,
    usdc,
    wbtc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({
      reader,
      dataStore,
      shiftVault,
      shiftHandler,
      shiftStoreUtils,
      roleStore,
      withdrawalHandler,
      ethUsdMarket,
      solUsdMarket,
      btcUsdMarket,
      ethUsdSpotOnlyMarket,
      ethUsdSingleTokenMarket,
      btcUsdSingleTokenMarket,
      wnt,
      usdc,
      wbtc,
    } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1, 18),
        shortTokenAmount: expandDecimals(5000, 6),
      },
    });
  });

  it("createShift", async () => {
    await dataStore.setUint(keys.MAX_DATA_LENGTH, 256);
    const dataList = [ethers.utils.formatBytes32String("customData")];
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
      dataList,
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
    expect(shift._dataList).deep.eq(dataList);

    await expect(
      createShift(fixture, {
        receiver: user1,
        callbackContract: user2,
        uiFeeReceiver: user3,
        fromMarket: ethUsdMarket,
        toMarket: btcUsdMarket,
        marketTokenAmount: expandDecimals(1, 18),
        minMarketTokens: expandDecimals(1, 18),
        executionFee: 500,
        callbackGasLimit: 200_000,
      })
    ).to.be.revertedWithCustomError(errorsContract, "LongTokensAreNotEqual");

    await expect(
      createShift(fixture, {
        receiver: user1,
        callbackContract: user2,
        uiFeeReceiver: user3,
        fromMarket: ethUsdMarket,
        toMarket: ethUsdMarket,
        marketTokenAmount: expandDecimals(1, 18),
        minMarketTokens: expandDecimals(1, 18),
        executionFee: 500,
        callbackGasLimit: 200_000,
      })
    ).to.be.revertedWithCustomError(errorsContract, "ShiftFromAndToMarketAreEqual");
  });

  it("cancelShift", async () => {
    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(10_000, 18));
    expect(await getBalanceOf(ethUsdMarket.marketToken, shiftVault.address)).eq(0);

    await createShift(fixture, {
      marketTokenAmount: expandDecimals(7500, 18),
      minMarketTokens: expandDecimals(7501, 18),
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(2500, 18));
    expect(await getBalanceOf(ethUsdMarket.marketToken, shiftVault.address)).eq(expandDecimals(7500, 18));

    const shiftKeys = await getShiftKeys(dataStore, 0, 1);

    await expect(shiftHandler.connect(user0).cancelShift(shiftKeys[0]))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user0.address, "ORDER_KEEPER|CONTROLLER");

    await executeShift(fixture, {
      gasUsageLabel: "executeShift",
      expectedCancellationReason: "MinMarketTokens",
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(10_000, 18));
    expect(await getBalanceOf(ethUsdMarket.marketToken, shiftVault.address)).eq(0);
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

  it("shift is unaffected by withdrawalSwapFeatureDisabled", async () => {
    await dataStore.setBool(keys.withdrawalSwapFeatureDisabledKey(withdrawalHandler.address), true);

    await createShift(fixture, {
      marketTokenAmount: expandDecimals(7500, 18),
      receiver: user1,
    });

    expect(await getShiftCount(dataStore)).eq(1);

    await executeShift(fixture, { gasUsageLabel: "executeShift" });

    expect(await getShiftCount(dataStore)).eq(0);
    expect(await getBalanceOf(solUsdMarket.marketToken, user1.address)).eq(expandDecimals(7500, 18));
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
    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(10_000, 18));
    expect(await getBalanceOf(ethUsdSpotOnlyMarket.marketToken, user0.address)).eq(0);

    await handleShift(fixture, {
      create: {
        fromMarket: ethUsdMarket,
        toMarket: ethUsdSpotOnlyMarket,
        marketTokenAmount: expandDecimals(2000, 18),
      },
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(8000, 18));
    expect(await getBalanceOf(ethUsdSpotOnlyMarket.marketToken, user0.address)).eq(expandDecimals(2000, 18));
  });

  it("single token market", async () => {
    await handleDeposit(fixture, {
      create: {
        market: ethUsdSingleTokenMarket,
        longTokenAmount: expandDecimals(10_000, 6),
        shortTokenAmount: 0,
      },
    });

    await dataStore.setUint(keys.swapFeeFactorKey(ethUsdSingleTokenMarket.marketToken, true), decimalToFloat(5, 4));
    await dataStore.setUint(keys.swapFeeFactorKey(ethUsdSingleTokenMarket.marketToken, false), decimalToFloat(5, 4));
    await dataStore.setUint(keys.swapFeeFactorKey(btcUsdSingleTokenMarket.marketToken, true), decimalToFloat(5, 4));
    await dataStore.setUint(keys.swapFeeFactorKey(btcUsdSingleTokenMarket.marketToken, false), decimalToFloat(5, 4));

    expect(await getBalanceOf(ethUsdSingleTokenMarket.marketToken, user0.address)).eq(expandDecimals(10_000, 18));
    expect(await getBalanceOf(btcUsdSingleTokenMarket.marketToken, user0.address)).eq(0);

    await handleShift(fixture, {
      create: {
        fromMarket: ethUsdSingleTokenMarket,
        toMarket: btcUsdSingleTokenMarket,
        marketTokenAmount: expandDecimals(3000, 18),
      },
      execute: {
        ...getExecuteParams(fixture, { prices: [prices.usdc, prices.wnt, prices.wbtc] }),
      },
    });

    expect(await getBalanceOf(ethUsdSingleTokenMarket.marketToken, user0.address)).eq(expandDecimals(7000, 18));
    expect(await getBalanceOf(btcUsdSingleTokenMarket.marketToken, user0.address)).eq(expandDecimals(3000, 18));
  });

  // Hardhat's deployer has both ORDER_KEEPER and CONTROLLER, so we use user2 (ORDER_KEEPER only)
  // and user3 (CONTROLLER only) to test the two cases separately.

  async function createCancellableShift() {
    await createShift(fixture, {
      receiver: user1,
      fromMarket: ethUsdMarket,
      toMarket: solUsdMarket,
      marketTokenAmount: expandDecimals(7500, 18),
      minMarketTokens: expandDecimals(7501, 18),
      executionFee: expandDecimals(1, 15),
    });

    const shiftKeys = await getShiftKeys(dataStore, 0, 1);
    const refTime = (await provider.getBlock()).timestamp;
    await increaseTime(refTime, 300);
    return shiftKeys[0];
  }

  it("cancelShift by ORDER_KEEPER pays the keeper portion to the caller", async () => {
    const orderKeeperSigner = user2;
    await grantRole(roleStore, orderKeeperSigner.address, "ORDER_KEEPER");

    const shiftKey = await createCancellableShift();

    const txn = await shiftHandler.connect(orderKeeperSigner).cancelShift(shiftKey);
    const parsedLogs = parseLogs(fixture, await txn.wait());

    const keeperEvent = getEventData(parsedLogs, "KeeperExecutionFee");
    expect(keeperEvent.keeper).eq(orderKeeperSigner.address);

    const refundEvent = getEventData(parsedLogs, "ExecutionFeeRefund");
    expect(refundEvent.receiver).eq(user1.address); // shift.receiver()
  });

  it("cancelShift by CONTROLLER-only signer pays the keeper portion to shift.account", async () => {
    const controllerOnlySigner = user3;
    await grantRole(roleStore, controllerOnlySigner.address, "CONTROLLER");

    const shiftKey = await createCancellableShift();

    const txn = await shiftHandler.connect(controllerOnlySigner).cancelShift(shiftKey);
    const parsedLogs = parseLogs(fixture, await txn.wait());

    const keeperEvent = getEventData(parsedLogs, "KeeperExecutionFee");
    expect(keeperEvent.keeper).eq(user0.address); // shift.account()
  });
});
