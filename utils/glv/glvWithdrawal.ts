import { ethers } from "hardhat";

import { contractAt } from "../deploy";
import { bigNumberify, expandDecimals } from "../math";
import { logGasUsage } from "../gas";
import * as keys from "../keys";
import { executeWithOracleParams } from "../exchange";
import { parseLogs } from "../event";
import { getCancellationReason } from "../error";
import { expectCancellationReason } from "../validation";

export function getGlvWithdrawalKeys(dataStore, start, end) {
  return dataStore.getBytes32ValuesAt(keys.GLV_WITHDRAWAL_LIST, start, end);
}

export function getGlvWithdrawalCount(dataStore) {
  return dataStore.getBytes32Count(keys.GLV_WITHDRAWAL_LIST);
}

export function getAccountGlvWithdrawalCount(dataStore, account) {
  return dataStore.getBytes32Count(keys.accountGlvWithdrawalListKey(account));
}

export function getAccountGlvWithdrawalKeys(dataStore, account, start, end) {
  return dataStore.getBytes32ValuesAt(keys.accountGlvWithdrawalListKey(account), start, end);
}

export async function createGlvWithdrawal(fixture, overrides: any = {}) {
  const { glvVault, glvHandler, wnt, ethUsdMarket, ethUsdGlvAddress } = fixture.contracts;
  const { wallet, user0 } = fixture.accounts;

  const glv = overrides.glv || ethUsdGlvAddress;
  const sender = overrides.sender || wallet;
  const account = overrides.account || user0;
  const receiver = overrides.receiver || account;
  const callbackContract = overrides.callbackContract || { address: ethers.constants.AddressZero };
  const uiFeeReceiver = overrides.uiFeeReceiver || { address: ethers.constants.AddressZero };
  const market = overrides.market || ethUsdMarket;
  const longTokenSwapPath = overrides.longTokenSwapPath || [];
  const shortTokenSwapPath = overrides.shortTokenSwapPath || [];
  const glvTokenAmount = overrides.glvTokenAmount || bigNumberify(0);
  const minLongTokenAmount = overrides.minLongTokenAmount || bigNumberify(0);
  const minShortTokenAmount = overrides.minShortTokenAmount || bigNumberify(0);
  const shouldUnwrapNativeToken = overrides.shouldUnwrapNativeToken || false;
  const executionFee = overrides.executionFee || "1000000000000000";
  const callbackGasLimit = overrides.callbackGasLimit || bigNumberify(0);

  await wnt.mint(glvVault.address, executionFee);

  const glvToken = await contractAt("GlvToken", glv);

  if (glvTokenAmount.gt(0)) {
    const glvTokenBalance = await glvToken.balanceOf(account.address);
    if (glvTokenBalance.lt(glvTokenAmount)) {
      await glvToken.mint(account.address, glvTokenAmount.sub(glvTokenBalance));
    }
    await glvToken.connect(account).transfer(glvVault.address, glvTokenAmount);
  }

  const params = {
    receiver: receiver.address,
    callbackContract: callbackContract.address,
    uiFeeReceiver: uiFeeReceiver.address,
    glv,
    market: market.marketToken,
    longTokenSwapPath,
    shortTokenSwapPath,
    glvTokenAmount,
    minLongTokenAmount,
    minShortTokenAmount,
    shouldUnwrapNativeToken,
    executionFee,
    callbackGasLimit,
  };

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      throw new Error(`param "${key}" is undefined`);
    }
  }

  await logGasUsage({
    tx: glvHandler.connect(sender).createGlvWithdrawal(account.address, params),
    label: overrides.gasUsageLabel,
  });
}

export async function executeGlvWithdrawal(fixture, overrides: any = {}) {
  const { glvReader, dataStore, glvHandler, wnt, usdc, sol } = fixture.contracts;
  const { gasUsageLabel } = overrides;
  const dataStreamTokens = overrides.dataStreamTokens || [];
  const dataStreamData = overrides.dataStreamData || [];
  const priceFeedTokens = overrides.priceFeedTokens || [];
  const tokens = overrides.tokens || [wnt.address, usdc.address, sol.address];
  const precisions = overrides.precisions || [8, 18, 8];
  const minPrices = overrides.minPrices || [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];
  const maxPrices = overrides.maxPrices || [expandDecimals(5000, 4), expandDecimals(1, 6), expandDecimals(600, 4)];
  const glvWithdrawalKeys = await getGlvWithdrawalKeys(dataStore, 0, 1);

  let glvWithdrawalKey = overrides.key;
  let oracleBlockNumber = overrides.oracleBlockNumber;

  if (glvWithdrawalKeys.length > 0) {
    if (!glvWithdrawalKey) {
      glvWithdrawalKey = glvWithdrawalKeys[0];
    }
    if (!oracleBlockNumber) {
      const glvWithdrawal = await glvReader.getGlvWithdrawal(dataStore.address, glvWithdrawalKeys[0]);
      oracleBlockNumber = glvWithdrawal.numbers.updatedAtBlock;
    }
  }

  const params: any = {
    glv: overrides.glv,
    key: glvWithdrawalKey,
    tokens,
    precisions,
    minPrices,
    maxPrices,
    execute: glvHandler.executeGlvWithdrawal,
    gasUsageLabel,
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
    eventName: "GlvWithdrawalCancelled",
  });

  expectCancellationReason(cancellationReason, overrides.expectedCancellationReason, "GlvWithdrawal");

  const result = { txReceipt, logs };
  return result;
}
