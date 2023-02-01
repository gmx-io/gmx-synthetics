import { logGasUsage } from "./gas";
import { expandDecimals, bigNumberify } from "./math";
import { executeWithOracleParams } from "./exchange";
import { contractAt } from "./deploy";
import { TOKEN_ORACLE_TYPES } from "./oracle";

import * as keys from "./keys";

export function getDepositCount(dataStore) {
  return dataStore.getBytes32Count(keys.DEPOSIT_LIST);
}

export function getDepositKeys(dataStore, start, end) {
  return dataStore.getBytes32ValuesAt(keys.DEPOSIT_LIST, start, end);
}

export function getAccountDepositCount(dataStore, account) {
  return dataStore.getBytes32Count(keys.accountDepositListKey(account));
}

export function getAccountDepositKeys(dataStore, account, start, end) {
  return dataStore.getBytes32ValuesAt(keys.accountDepositListKey(account), start, end);
}

export async function createDeposit(fixture, overrides: any = {}) {
  const { depositVault, depositHandler, wnt, ethUsdMarket } = fixture.contracts;
  const { wallet, user0 } = fixture.accounts;

  const account = overrides.account || user0;
  const receiver = overrides.receiver || account;
  const callbackContract = overrides.callbackContract || { address: ethers.constants.AddressZero };
  const market = overrides.market || ethUsdMarket;
  const initialLongToken = overrides.initialLongToken || market.longToken;
  const initialShortToken = overrides.initialShortToken || market.shortToken;
  const longTokenSwapPath = overrides.longTokenSwapPath || [];
  const shortTokenSwapPath = overrides.shortTokenSwapPath || [];
  const minMarketTokens = overrides.minMarketTokens || bigNumberify(0);
  const shouldUnwrapNativeToken = overrides.shouldUnwrapNativeToken || false;
  const executionFee = overrides.executionFee || "1000000000000000";
  const callbackGasLimit = overrides.callbackGasLimit || bigNumberify(0);
  const longTokenAmount = overrides.longTokenAmount || bigNumberify(0);
  const shortTokenAmount = overrides.shortTokenAmount || bigNumberify(0);

  await wnt.mint(depositVault.address, executionFee);

  if (longTokenAmount.gt(0)) {
    const longToken = await contractAt("MintableToken", market.longToken);
    await longToken.mint(depositVault.address, longTokenAmount);
  }

  if (shortTokenAmount.gt(0)) {
    const shortToken = await contractAt("MintableToken", market.shortToken);
    await shortToken.mint(depositVault.address, shortTokenAmount);
  }

  const params = {
    receiver: receiver.address,
    callbackContract: callbackContract.address,
    market: market.marketToken,
    initialLongToken,
    initialShortToken,
    longTokenSwapPath,
    shortTokenSwapPath,
    minMarketTokens,
    shouldUnwrapNativeToken,
    executionFee,
    callbackGasLimit,
  };

  await logGasUsage({
    tx: depositHandler.connect(wallet).createDeposit(account.address, params, {
      gasLimit: "1000000",
    }),
    label: overrides.gasUsageLabel,
  });
}

export async function executeDeposit(fixture, overrides: any = {}) {
  const { reader, dataStore, depositHandler, wnt, usdc } = fixture.contracts;
  const { gasUsageLabel } = overrides;
  const tokens = overrides.tokens || [wnt.address, usdc.address];
  const precisions = overrides.precisions || [8, 18];
  const minPrices = overrides.minPrices || [expandDecimals(5000, 4), expandDecimals(1, 6)];
  const maxPrices = overrides.maxPrices || [expandDecimals(5000, 4), expandDecimals(1, 6)];
  const depositKeys = await getDepositKeys(dataStore, 0, 1);
  const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

  const params = {
    key: depositKeys[0],
    oracleBlockNumber: deposit.numbers.updatedAtBlock,
    tokens,
    precisions,
    minPrices,
    maxPrices,
    execute: depositHandler.executeDeposit,
    gasUsageLabel,
  };

  await executeWithOracleParams(fixture, params);
}

export async function handleDeposit(fixture, overrides: any = {}) {
  await createDeposit(fixture, overrides.create);
  await executeDeposit(fixture, overrides.execute);
}
