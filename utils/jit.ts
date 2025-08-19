import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { bigNumberify, expandDecimals } from "./math";
import { getOrderKeys } from "./order";
import { executeWithOracleParams } from "./exchange";
import { parseLogs } from "./event";
import { getCancellationReason, getErrorString } from "./error";
import { expect } from "chai";
import { BigNumberish } from "ethers";

export async function shiftLiquidityAndExecuteOrder(
  fixture,
  overrides: {
    gasUsageLabel?: string;
    oracleBlockNumberOffset?: number;
    glvShift?: {
      glv?: string;
      toMarket?: string;
      fromMarket?: string;
      marketTokenAmount?: BigNumberish;
      minMarketTokens?: BigNumberish;
    };
    tokens?: string[];
    dataStreamTokens?: string[];
    dataStreamData?: string[];
    priceFeedTokens?: string[];
    precisions?: number[];
    minPrices?: number[];
    maxPrices?: number[];
    simulate?: boolean;
    oracleBlocks?: any[];
    minOracleBlockNumbers?: number[];
    maxOracleBlockNumbers?: number[];
    oracleTimestamps?: number[];
    blockHashes?: string[];
    afterExecution?: (result: any) => Promise<void>;
    expectedCancellationReason?: string;
    expectedFrozenReason?: string;
    orderKey?: string;
    oracleBlockNumber?: number;
  } = {}
) {
  const { wnt, usdc, sol } = fixture.contracts;
  const { gasUsageLabel, oracleBlockNumberOffset } = overrides;
  const { dataStore, jitOrderHandler } = fixture.contracts;

  const glvShiftOverrides = overrides.glvShift || ({} as any);
  const glvShiftParams = {
    glv: glvShiftOverrides.glv ?? fixture.contracts.ethUsdGlvAddress,
    fromMarket: glvShiftOverrides.toMarket ?? fixture.contracts.solUsdMarket.marketToken,
    toMarket: glvShiftOverrides.fromMarket ?? fixture.contracts.ethUsdMarket.marketToken,
    marketTokenAmount: glvShiftOverrides.marketTokenAmount ?? expandDecimals(1, 15), // 0.001 ETH
    minMarketTokens: glvShiftOverrides.minMarketTokens ?? 0,
  };

  const tokens = overrides.tokens || [wnt.address, usdc.address, sol.address];
  const dataStreamTokens = overrides.dataStreamTokens || [];
  const dataStreamData = overrides.dataStreamData || [];
  const priceFeedTokens = overrides.priceFeedTokens || [];
  const precisions = overrides.precisions || [8, 18, 8];
  const minPrices = overrides.minPrices || [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];
  const maxPrices = overrides.maxPrices || [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];
  const orderKeys = await getOrderKeys(dataStore, 0, 20);
  const orderKey = overrides.orderKey || orderKeys[orderKeys.length - 1];
  let oracleBlockNumber = overrides.oracleBlockNumber || (await ethers.provider.getBlockNumber());
  oracleBlockNumber = bigNumberify(oracleBlockNumber);

  const oracleBlocks = overrides.oracleBlocks;
  const minOracleBlockNumbers = overrides.minOracleBlockNumbers;
  const maxOracleBlockNumbers = overrides.maxOracleBlockNumbers;
  const oracleTimestamps = overrides.oracleTimestamps;
  const blockHashes = overrides.blockHashes;

  if (oracleBlockNumberOffset) {
    if (oracleBlockNumberOffset > 0) {
      mine(oracleBlockNumberOffset);
    }

    oracleBlockNumber = oracleBlockNumber.add(oracleBlockNumberOffset);
  }

  const params = {
    args: [glvShiftParams, orderKey],
    oracleBlockNumber,
    tokens,
    precisions,
    minPrices,
    maxPrices,
    simulate: overrides.simulate,
    execute: overrides.simulate
      ? jitOrderHandler.simulateShiftLiquidityAndExecuteOrder
      : jitOrderHandler.shiftLiquidityAndExecuteOrder,
    gasUsageLabel,
    oracleBlocks,
    minOracleBlockNumbers,
    maxOracleBlockNumbers,
    oracleTimestamps,
    blockHashes,
    dataStreamTokens,
    dataStreamData,
    priceFeedTokens,
  };

  const txReceipt = await executeWithOracleParams(fixture, params);
  const logs = parseLogs(fixture, txReceipt);
  const cancellationReason = await getCancellationReason({
    logs,
    eventName: "OrderCancelled",
  });

  if (cancellationReason) {
    if (overrides.expectedCancellationReason) {
      expect(cancellationReason.name).eq(overrides.expectedCancellationReason);
    } else {
      throw new Error(`Order was cancelled: ${getErrorString(cancellationReason)}`);
    }
  } else {
    if (overrides.expectedCancellationReason) {
      throw new Error(
        `Order was not cancelled, expected cancellation with reason: ${overrides.expectedCancellationReason}`
      );
    }
  }

  const frozenReason = await getCancellationReason({
    logs,
    eventName: "OrderFrozen",
  });

  if (frozenReason) {
    if (overrides.expectedFrozenReason) {
      expect(frozenReason.name).eq(overrides.expectedFrozenReason);
    } else {
      throw new Error(`Order was frozen: ${getErrorString(frozenReason)}`);
    }
  } else {
    if (overrides.expectedFrozenReason) {
      throw new Error(`Order was not frozen, expected freeze with reason: ${overrides.expectedFrozenReason}`);
    }
  }

  const result = { txReceipt, logs };

  if (overrides.afterExecution) {
    await overrides.afterExecution(result);
  }

  return result;
}
