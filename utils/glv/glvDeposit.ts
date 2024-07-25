import { ethers } from "hardhat";

import { contractAt } from "../deploy";
import { bigNumberify, expandDecimals } from "../math";
import { logGasUsage } from "../gas";
import * as keys from "../keys";
import { executeWithOracleParams } from "../exchange";
import { parseLogs } from "../event";
import { getCancellationReason, getErrorString } from "../error";
import { expect } from "chai";

export function getGlvDepositKeys(dataStore, start, end) {
  return dataStore.getBytes32ValuesAt(keys.GLV_DEPOSIT_LIST, start, end);
}

export function getGlvDepositCount(dataStore) {
  return dataStore.getBytes32Count(keys.GLV_DEPOSIT_LIST);
}

export async function createGlvDeposit(fixture, overrides: any = {}) {
  const { glvVault, glvHandler, wnt, ethUsdMarket, ethUsdGlvAddress } = fixture.contracts;
  const { wallet, user0 } = fixture.accounts;

  const glv = overrides.glv || ethUsdGlvAddress;
  const sender = overrides.sender || wallet;
  const account = overrides.account || user0;
  const receiver = overrides.receiver || account;
  const callbackContract = overrides.callbackContract || { address: ethers.constants.AddressZero };
  const uiFeeReceiver = overrides.uiFeeReceiver || { address: ethers.constants.AddressZero };
  const market = overrides.market || ethUsdMarket;
  const initialLongToken = overrides.initialLongToken || market.longToken;
  const initialShortToken = overrides.initialShortToken || market.shortToken;
  const longTokenSwapPath = overrides.longTokenSwapPath || [];
  const shortTokenSwapPath = overrides.shortTokenSwapPath || [];
  const minGlvTokens = overrides.minGlvTokens || bigNumberify(0);
  const shouldUnwrapNativeToken = overrides.shouldUnwrapNativeToken || false;
  const executionFee = overrides.executionFee || "1000000000000000";
  const executionFeeToMint = overrides.executionFeeToMint || executionFee;
  const callbackGasLimit = overrides.callbackGasLimit || bigNumberify(0);
  const marketTokenAmount = overrides.marketTokenAmount || bigNumberify(0);
  const longTokenAmount = overrides.longTokenAmount || bigNumberify(0);
  const shortTokenAmount = overrides.shortTokenAmount || bigNumberify(0);
  const isMarketTokenDeposit = overrides.isMarketTokenDeposit || false;

  await wnt.mint(glvVault.address, executionFeeToMint);

  if (marketTokenAmount.gt(0)) {
    const _marketToken = await contractAt("MintableToken", market.marketToken);
    await _marketToken.mint(glvVault.address, marketTokenAmount);
  }

  if (longTokenAmount.gt(0)) {
    const _initialLongToken = await contractAt("MintableToken", initialLongToken);
    await _initialLongToken.mint(glvVault.address, longTokenAmount);
  }

  if (shortTokenAmount.gt(0)) {
    const _initialShortToken = await contractAt("MintableToken", initialShortToken);
    await _initialShortToken.mint(glvVault.address, shortTokenAmount);
  }

  const params = {
    glv,
    receiver: receiver.address,
    callbackContract: callbackContract.address,
    uiFeeReceiver: uiFeeReceiver.address,
    market: market.marketToken,
    initialLongToken,
    initialShortToken,
    longTokenSwapPath,
    shortTokenSwapPath,
    marketTokenAmount,
    minGlvTokens,
    shouldUnwrapNativeToken,
    executionFee,
    callbackGasLimit,
    isMarketTokenDeposit,
  };

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      throw new Error(`param "${key}" is undefined`);
    }
  }

  const txReceipt = await logGasUsage({
    tx: glvHandler.connect(sender).createGlvDeposit(account.address, params),
    label: overrides.gasUsageLabel,
  });

  const result = { txReceipt };
  return result;
}

export async function executeGlvDeposit(fixture, overrides: any = {}) {
  const { reader, dataStore, glvHandler, wnt, usdc, sol } = fixture.contracts;
  const { gasUsageLabel } = overrides;
  const tokens = overrides.tokens || [wnt.address, usdc.address, sol.address];
  const precisions = overrides.precisions || [8, 18, 8];
  const minPrices = overrides.minPrices || [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];
  const maxPrices = overrides.maxPrices || [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];
  const glvDepositKeys = await getGlvDepositKeys(dataStore, 0, 1);
  const dataStreamTokens = overrides.dataStreamTokens || [];
  const dataStreamData = overrides.dataStreamData || [];
  const priceFeedTokens = overrides.priceFeedTokens || [];
  let glvDepositKey = overrides.glvDepositKey;
  let oracleBlockNumber = overrides.oracleBlockNumber;

  if (glvDepositKeys.length > 0) {
    if (!glvDepositKey) {
      glvDepositKey = glvDepositKeys[0];
    }
    if (!oracleBlockNumber) {
      const glvDeposit = await reader.getGlvDeposit(dataStore.address, glvDepositKeys[0]);
      oracleBlockNumber = glvDeposit.updatedAtBlock;
    }
  }

  const params = {
    key: glvDepositKey,
    oracleBlockNumber,
    tokens,
    precisions,
    minPrices,
    maxPrices,
    execute: glvHandler.executeGlvDeposit,
    simulateExecute: glvHandler.simulateExecuteGlvDeposit,
    simulate: overrides.simulate,
    gasUsageLabel,
    dataStreamTokens,
    dataStreamData,
    priceFeedTokens,
  };

  const txReceipt = await executeWithOracleParams(fixture, params);

  const logs = parseLogs(fixture, txReceipt);

  const cancellationReason = await getCancellationReason({
    logs,
    eventName: "GlvDepositCancelled",
  });

  // todo create separate func to check cancellation reason
  if (cancellationReason) {
    if (overrides.expectedCancellationReason) {
      if (typeof overrides.expectedCancellationReason === "string") {
        expect(cancellationReason.name).eq(overrides.expectedCancellationReason);
      } else {
        expect(overrides.expectedCancellationReason.name).eq(cancellationReason.name);
        expect(overrides.expectedCancellationReason.args.length).eq(cancellationReason.args.length);
        expect(overrides.expectedCancellationReason.args).deep.eq(cancellationReason.args);
      }
    } else {
      throw new Error(`GlvDeposit was cancelled: ${getErrorString(cancellationReason)}`);
    }
  } else {
    if (overrides.expectedCancellationReason) {
      throw new Error(
        `GlvDeposit was not cancelled, expected cancellation with reason: ${overrides.expectedCancellationReason}`
      );
    }
  }

  const result = { txReceipt, logs };
  return result;
}

export async function handleGlvDeposit(fixture, overrides: any = {}) {
  const createResult = await createGlvDeposit(fixture, overrides.create);
  const executeResult = await executeGlvDeposit(fixture, overrides.execute);
  return { createResult, executeResult };
}
