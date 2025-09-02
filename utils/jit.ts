import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { bigNumberify, expandDecimals } from "./math";
import { getOrderKeys } from "./order";
import { executeWithOracleParams } from "./exchange";
import { parseLogs } from "./event";
import { BigNumberish } from "ethers";

export async function executeJitOrder(
  fixture,
  overrides: {
    gasUsageLabel?: string;
    oracleBlockNumberOffset?: number;
    glvShifts?: {
      glv?: string;
      toMarket?: string;
      fromMarket?: string;
      marketTokenAmount?: BigNumberish;
      minMarketTokens?: BigNumberish;
    }[];
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
    orderKey?: string;
    oracleBlockNumber?: number;
    sender?: any;
  } = {}
) {
  const { wnt, usdc, sol } = fixture.contracts;
  const { gasUsageLabel, oracleBlockNumberOffset } = overrides;
  const { dataStore, jitOrderHandler } = fixture.contracts;

  const sender = overrides.sender ?? fixture.accounts.wallet;

  const glvShiftParamsList = (overrides.glvShifts ?? []).map((glvShift) => {
    // apply defaults
    return {
      glv: glvShift.glv ?? fixture.contracts.ethUsdGlvAddress,
      fromMarket: glvShift.fromMarket ?? fixture.contracts.solUsdMarket.marketToken,
      toMarket: glvShift.toMarket ?? fixture.contracts.ethUsdMarket.marketToken,
      marketTokenAmount: glvShift.marketTokenAmount ?? expandDecimals(1, 15), // 0.001 ETH
      minMarketTokens: glvShift.minMarketTokens ?? 0,
    };
  });

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
    args: [glvShiftParamsList, orderKey],
    oracleBlockNumber,
    tokens,
    precisions,
    minPrices,
    maxPrices,
    simulate: overrides.simulate,
    execute: jitOrderHandler.connect(sender).executeJitOrder,
    simulateExecute: jitOrderHandler.connect(sender).simulateExecuteJitOrder,
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

  if (overrides.simulate) {
    return;
  }

  const logs = parseLogs(fixture, txReceipt);

  const result = { txReceipt, logs };

  if (overrides.afterExecution) {
    await overrides.afterExecution(result);
  }

  return result;
}
