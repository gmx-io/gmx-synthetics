import { logGasUsage } from "./gas";
import { expandDecimals, bigNumberify } from "./math";
import { executeWithOracleParams } from "./exchange";
import { TOKEN_ORACLE_TYPES } from "./oracle";

export async function createWithdrawal(fixture, overrides = {}) {
  const { withdrawalStore, withdrawalHandler, wnt, ethUsdMarket } = fixture.contracts;
  const { wallet, user0 } = fixture.accounts;

  const account = overrides.account || user0;
  const receiver = overrides.receiver || account;
  const callbackContract = overrides.callbackContract || { address: ethers.constants.AddressZero };
  const market = overrides.market || ethUsdMarket;
  const marketTokensLongAmount = overrides.marketTokensLongAmount || bigNumberify(0);
  const marketTokensShortAmount = overrides.marketTokensShortAmount || bigNumberify(0);
  const minLongTokenAmount = overrides.minLongTokenAmount || bigNumberify(0);
  const minShortTokenAmount = overrides.minShortTokenAmount || bigNumberify(0);
  const shouldUnwrapNativeToken = overrides.shouldUnwrapNativeToken || false;
  const executionFee = overrides.executionFee || "1000000000000000";
  const callbackGasLimit = overrides.callbackGasLimit || bigNumberify(0);

  await wnt.mint(withdrawalStore.address, executionFee);

  const params = {
    receiver: receiver.address,
    callbackContract: callbackContract.address,
    market: market.marketToken,
    marketTokensLongAmount,
    marketTokensShortAmount,
    minLongTokenAmount,
    minShortTokenAmount,
    shouldUnwrapNativeToken,
    executionFee,
    callbackGasLimit,
  };

  await logGasUsage({
    tx: withdrawalHandler.connect(wallet).createWithdrawal(account.address, params),
    label: overrides.gasUsageLabel,
  });
}

export async function executeWithdrawal(fixture, overrides = {}) {
  const { withdrawalStore, withdrawalHandler, wnt, usdc } = fixture.contracts;
  const { gasUsageLabel } = overrides;
  const tokens = overrides.tokens || [wnt.address, usdc.address];
  const tokenOracleTypes = overrides.tokenOracleTypes || [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT];
  const precisions = overrides.precisions || [8, 18];
  const minPrices = overrides.minPrices || [expandDecimals(5000, 4), expandDecimals(1, 6)];
  const maxPrices = overrides.maxPrices || [expandDecimals(5000, 4), expandDecimals(1, 6)];
  const withdrawalKeys = await withdrawalStore.getWithdrawalKeys(0, 1);
  const withdrawal = await withdrawalStore.get(withdrawalKeys[0]);

  const params = {
    key: withdrawalKeys[0],
    oracleBlockNumber: withdrawal.updatedAtBlock,
    tokens,
    tokenOracleTypes,
    precisions,
    minPrices,
    maxPrices,
    execute: withdrawalHandler.executeWithdrawal,
    gasUsageLabel,
  };

  await executeWithOracleParams(fixture, params);
}

export async function handleWithdrawal(fixture, overrides = {}) {
  await createWithdrawal(fixture, overrides.create);
  await executeWithdrawal(fixture, overrides.execute);
}
