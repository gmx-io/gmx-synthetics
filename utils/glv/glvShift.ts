import { ethers } from "hardhat";

import { bigNumberify, expandDecimals } from "../math";
import { logGasUsage } from "../gas";
import * as keys from "../keys";
import { executeWithOracleParams } from "../exchange";
import { parseLogs } from "../event";
import { getCancellationReason, getErrorString } from "../error";
import { expect } from "chai";

export async function createGlvShift(fixture, overrides: any = {}) {
  const { glvVault, glvHandler, wnt, ethUsdMarket, solUsdMarket } = fixture.contracts;
  const { wallet } = fixture.accounts;

  const glv = overrides.glv;
  const sender = overrides.sender || wallet;
  const fromMarket = overrides.fromMarket || ethUsdMarket;
  const toMarket = overrides.toMarket || solUsdMarket;
  const marketTokenAmount = overrides.marketTokenAmount || bigNumberify(0);
  const minMarketTokens = overrides.minMarketTokens || bigNumberify(0);
  const executionFee = overrides.executionFee || "1000000000000000";
  const callbackGasLimit = overrides.callbackGasLimit || bigNumberify(0);

  await wnt.mint(glvVault.address, executionFee);

  // const marketToken = await contractAt("MarketToken", fromMarket.marketToken);
  // await marketToken.connect(sender).transfer(glv, marketTokenAmount);

  const params = {
    glv,
    fromMarket: fromMarket.marketToken,
    toMarket: toMarket.marketToken,
    marketTokenAmount,
    minMarketTokens,
    executionFee,
    callbackGasLimit,
  };

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      throw new Error(`param "${key}" is undefined`);
    }
  }

  const txReceipt = await logGasUsage({
    tx: glvHandler.connect(sender).createGlvShift(params),
    label: overrides.gasUsageLabel,
  });

  const result = { txReceipt };
  return result;
}

export async function executeGlvShift(fixture, overrides: any = {}) {
  const { dataStore, glvHandler, wnt, usdc, sol, ethUsdGlvAddress } = fixture.contracts;
  const { gasUsageLabel } = overrides;
  const glv = overrides.glv || ethUsdGlvAddress;
  const tokens = overrides.tokens || [wnt.address, usdc.address, sol.address];
  const precisions = overrides.precisions || [8, 18, 8];
  const minPrices = overrides.minPrices || [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];
  const maxPrices = overrides.maxPrices || [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];
  const glvShiftKeys = await getGlvShiftKeys(dataStore, 0, 1);
  const dataStreamTokens = overrides.dataStreamTokens || [];
  const dataStreamData = overrides.dataStreamData || [];
  const priceFeedTokens = overrides.priceFeedTokens || [];
  let glvShiftKey = overrides.glvShift;
  let oracleBlockNumber = overrides.oracleBlockNumber;

  if (glvShiftKeys.length > 0) {
    if (!glvShiftKey) {
      glvShiftKey = glvShiftKeys[0];
    }
    if (!oracleBlockNumber) {
      oracleBlockNumber = (await ethers.provider.getBlock("latest")).number;
    }
  }

  const params: any = {
    glv: glv,
    key: glvShiftKey,
    oracleBlockNumber,
    tokens,
    precisions,
    minPrices,
    maxPrices,
    execute: glvHandler.executeGlvShift,
    dataStreamTokens,
    dataStreamData,
    priceFeedTokens,
  };
  if (gasUsageLabel) {
    params.gasUsageLabel = gasUsageLabel;
  }

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      throw new Error(`param "${key}" is undefined`);
    }
  }

  const txReceipt = await executeWithOracleParams(fixture, params);

  const logs = parseLogs(fixture, txReceipt);

  const cancellationReason = await getCancellationReason({
    logs,
    eventName: "GlvShiftCancelled",
  });

  if (cancellationReason) {
    if (overrides.expectedCancellationReason) {
      expect(cancellationReason.name).eq(overrides.expectedCancellationReason);
    } else {
      throw new Error(`GlvShift was cancelled: ${getErrorString(cancellationReason)}`);
    }
  } else {
    if (overrides.expectedCancellationReason) {
      throw new Error(
        `GlvShift was not cancelled, expected cancellation with reason: ${overrides.expectedCancellationReason}`
      );
    }
  }

  const result = { txReceipt, logs };
  return result;
}

export function getGlvShiftKeys(dataStore, start, end) {
  return dataStore.getBytes32ValuesAt(keys.GLV_SHIFT_LIST, start, end);
}

export function getGlvShiftCount(dataStore) {
  return dataStore.getBytes32Count(keys.GLV_SHIFT_LIST);
}

export async function handleGlvShift(fixture, overrides: any = {}) {
  const createResult = await createGlvShift(fixture, overrides.create);
  const executeResult = await executeGlvShift(fixture, overrides.execute);
  return { createResult, executeResult };
}
