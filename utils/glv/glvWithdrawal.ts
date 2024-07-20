import { ethers } from "hardhat";
import { calculateCreate2 } from "eth-create2-calculator";

import GlvArtifact from "../../artifacts/contracts/glv/Glv.sol/Glv.json";

import { contractAt } from "../deploy";
import { hashData } from "../hash";
import { bigNumberify, expandDecimals } from "../math";
import { logGasUsage } from "../gas";
import * as keys from "../keys";
import { executeWithOracleParams } from "../exchange";
import { parseLogs } from "../event";
import { getCancellationReason, getErrorString } from "../error";
import { expect } from "chai";

export function getGlvAddress(
  longToken: string,
  shortToken: string,
  glvType: string,
  glvFactoryAddress: string,
  roleStoreAddress: string,
  dataStoreAddress: string
) {
  const salt = hashData(["string", "address", "address", "bytes32"], ["GMX_GLV", longToken, shortToken, glvType]);
  const byteCode = GlvArtifact.bytecode;
  return calculateCreate2(glvFactoryAddress, salt, byteCode, {
    params: [roleStoreAddress, dataStoreAddress],
    types: ["address", "address"],
  });
}

export function getGlvWithdrawalKeys(dataStore, start, end) {
  return dataStore.getBytes32ValuesAt(keys.GLV_WITHDRAWAL_LIST, start, end);
}

export function getGlvWithdrawalCount(dataStore) {
  return dataStore.getBytes32Count(keys.GLV_WITHDRAWAL_LIST);
}

export async function createGlvWithdrawal(fixture, overrides: any = {}) {
  const { glvVault, glvHandler, wnt, ethUsdMarket } = fixture.contracts;
  const { wallet, user0 } = fixture.accounts;

  const glv = overrides.glv;
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

  const glvToken = await contractAt("Glv", glv);
  await glvToken.connect(account).transfer(glvVault.address, glvTokenAmount);

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
    tx: glvHandler.connect(wallet).createGlvWithdrawal(account.address, params),
    label: overrides.gasUsageLabel,
  });
}

export async function executeGlvWithdrawal(fixture, overrides: any = {}) {
  const { reader, dataStore, glvHandler, wnt, usdc } = fixture.contracts;
  const { gasUsageLabel } = overrides;
  const tokens = overrides.tokens || [wnt.address, usdc.address];
  const dataStreamTokens = overrides.dataStreamTokens || [];
  const dataStreamData = overrides.dataStreamData || [];
  const priceFeedTokens = overrides.priceFeedTokens || [];
  const precisions = overrides.precisions || [8, 18];
  const minPrices = overrides.minPrices || [expandDecimals(5000, 4), expandDecimals(1, 6)];
  const maxPrices = overrides.maxPrices || [expandDecimals(5000, 4), expandDecimals(1, 6)];
  const glvWithdrawalKeys = await getGlvWithdrawalKeys(dataStore, 0, 1);
  const glvWithdrawal = await reader.getGlvWithdrawal(dataStore.address, glvWithdrawalKeys[0]);

  const params = {
    glv: overrides.glv,
    key: glvWithdrawalKeys[0],
    oracleBlockNumber: glvWithdrawal.numbers.updatedAtBlock,
    tokens,
    precisions,
    minPrices,
    maxPrices,
    execute: glvHandler.executeGlvWithdrawal,
    gasUsageLabel,
    dataStreamTokens,
    dataStreamData,
    priceFeedTokens,
  };

  console.log("executeGlvWithdrawal params", params);

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

  if (cancellationReason) {
    if (overrides.expectedCancellationReason) {
      expect(cancellationReason.name).eq(overrides.expectedCancellationReason);
    } else {
      throw new Error(`GlvWithdrawal was cancelled: ${getErrorString(cancellationReason)}`);
    }
  } else {
    if (overrides.expectedCancellationReason) {
      throw new Error(
        `GlvWithdrawal was not cancelled, expected cancellation with reason: ${overrides.expectedCancellationReason}`
      );
    }
  }

  const result = { txReceipt, logs };
  return result;
}
