import { ethers } from "hardhat";

import { bigNumberify, expandDecimals } from "../math";
import { logGasUsage } from "../gas";
import * as keys from "../keys";
import { executeWithOracleParams } from "../exchange";
import { parseLogs } from "../event";
import { expectCancellationReason } from "../validation";
import { getCancellationReason } from "../error";

export async function createGlvShift(fixture, overrides: any = {}) {
  const { glvHandler, ethUsdMarket, solUsdMarket, ethUsdGlvAddress } = fixture.contracts;
  const { wallet } = fixture.accounts;

  const gasUsageLabel = overrides.gasUsageLabel;
  const glv = overrides.glv || ethUsdGlvAddress;
  const sender = overrides.sender || wallet;
  const fromMarket = overrides.fromMarket || ethUsdMarket;
  const toMarket = overrides.toMarket || solUsdMarket;
  const marketTokenAmount = bigNumberify(overrides.marketTokenAmount ?? 0);
  const minMarketTokens = bigNumberify(overrides.minMarketTokens ?? 0);

  const params = {
    glv,
    fromMarket: fromMarket.marketToken,
    toMarket: toMarket.marketToken,
    marketTokenAmount,
    minMarketTokens,
  };

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      throw new Error(`param "${key}" is undefined`);
    }
  }

  const txReceipt = await logGasUsage({
    tx: glvHandler.connect(sender).createGlvShift(params),
    label: gasUsageLabel,
  });

  const result = { txReceipt };
  return result;
}

export async function executeGlvShift(fixture, overrides: any = {}) {
  const { dataStore, glvHandler, wnt, usdc, sol, ethUsdGlvAddress } = fixture.contracts;
  const gasUsageLabel = overrides.gasUsageLabel;
  const glv = overrides.glv || ethUsdGlvAddress;
  const tokens = overrides.tokens || [wnt.address, usdc.address, sol.address];
  const precisions = overrides.precisions || [8, 18, 8];
  const minPrices = overrides.minPrices || [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];
  const maxPrices = overrides.maxPrices || [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];
  const glvShiftKeys = await getGlvShiftKeys(dataStore, 0, 1);
  const dataStreamTokens = overrides.dataStreamTokens || [];
  const dataStreamData = overrides.dataStreamData || [];
  const priceFeedTokens = overrides.priceFeedTokens || [];
  let glvShiftKey = overrides.key;
  let oracleBlockNumber = overrides.oracleBlockNumber;

  if (glvShiftKeys.length > 0) {
    if (!glvShiftKey) {
      glvShiftKey = glvShiftKeys[0];
    }
  }
  if (!oracleBlockNumber) {
    oracleBlockNumber = await ethers.provider.getBlockNumber();
  }

  const params: any = {
    glv: glv,
    key: glvShiftKey,
    tokens,
    precisions,
    minPrices,
    maxPrices,
    execute: glvHandler.executeGlvShift,
    dataStreamTokens,
    dataStreamData,
    priceFeedTokens,
    oracleBlockNumber,
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

  expectCancellationReason(cancellationReason, overrides.expectedCancellationReason, "GlvShift");

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

  const createOverridesCopy = { ...overrides.create };
  delete createOverridesCopy.gasUsageLabel;

  const executeResult = await executeGlvShift(fixture, { ...createOverridesCopy, ...overrides.execute });
  return { createResult, executeResult };
}
