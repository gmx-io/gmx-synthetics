const { logGasUsage } = require("./gas");
const { expandDecimals, bigNumberify } = require("./math");
const { executeWithOracleParams } = require("./exchange");

async function createWithdrawal(fixture, overrides = {}) {
  const { withdrawalStore, withdrawalHandler, weth, ethUsdMarket } = fixture.contracts;
  const { wallet, user0 } = fixture.accounts;

  const account = overrides.account || user0;
  const receiver = overrides.receiver || account;
  const callbackContract = overrides.callbackContract || { address: ethers.constants.AddressZero };
  const market = overrides.market || ethUsdMarket;
  const marketTokensLongAmount = overrides.marketTokensLongAmount || bigNumberify(0);
  const marketTokensShortAmount = overrides.marketTokensShortAmount || bigNumberify(0);
  const minLongTokenAmount = overrides.minLongTokenAmount || bigNumberify(0);
  const minShortTokenAmount = overrides.minShortTokenAmount || bigNumberify(0);
  const shouldConvertETH = overrides.shouldConvertETH || false;
  const executionFee = overrides.executionFee || "1000000000000000";
  const callbackGasLimit = overrides.callbackGasLimit || bigNumberify(0);

  await weth.mint(withdrawalStore.address, executionFee);

  const params = {
    receiver: receiver.address,
    callbackContract: callbackContract.address,
    market: market.marketToken,
    marketTokensLongAmount,
    marketTokensShortAmount,
    minLongTokenAmount,
    minShortTokenAmount,
    shouldConvertETH,
    executionFee,
    callbackGasLimit,
  };

  await logGasUsage({
    tx: withdrawalHandler.connect(wallet).createWithdrawal(account.address, params),
    label: overrides.gasUsageLabel,
  });
}

async function executeWithdrawal(fixture, overrides = {}) {
  const { withdrawalStore, withdrawalHandler, weth, usdc } = fixture.contracts;
  const { gasUsageLabel } = overrides;
  const tokens = overrides.tokens || [weth.address, usdc.address];
  const prices = overrides.prices || [expandDecimals(5000, 4), expandDecimals(1, 6)];
  const withdrawalKeys = await withdrawalStore.getWithdrawalKeys(0, 1);
  const withdrawal = await withdrawalStore.get(withdrawalKeys[0]);

  const params = {
    key: withdrawalKeys[0],
    oracleBlockNumber: withdrawal.updatedAtBlock,
    tokens,
    prices,
    execute: withdrawalHandler.executeWithdrawal,
    gasUsageLabel,
  };

  await executeWithOracleParams(fixture, params);
}

async function handleWithdrawal(fixture, overrides = {}) {
  await createWithdrawal(fixture, overrides.create);
  await executeWithdrawal(fixture, overrides.execute);
}

module.exports = {
  createWithdrawal,
  executeWithdrawal,
  handleWithdrawal,
};
