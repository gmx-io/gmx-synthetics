const { logGasUsage } = require("./gas");
const { expandDecimals, bigNumberify } = require("./math");
const { executeWithOracleParams } = require("./exchange");
const { contractAt } = require("./deploy");

async function createDeposit(fixture, overrides = {}) {
  const { depositStore, depositHandler, weth, ethUsdMarket } = fixture.contracts;
  const { wallet, user0 } = fixture.accounts;

  const account = overrides.account || user0;
  const receiver = overrides.receiver || account;
  const callbackContract = overrides.callbackContract || { address: ethers.constants.AddressZero };
  const market = overrides.market || ethUsdMarket;
  const minMarketTokens = overrides.minMarketTokens || bigNumberify(0);
  const shouldConvertETH = overrides.shouldConvertETH || false;
  const executionFee = overrides.executionFee || "1000000000000000";
  const callbackGasLimit = overrides.callbackGasLimit || bigNumberify(0);
  const longTokenAmount = overrides.longTokenAmount || bigNumberify(0);
  const shortTokenAmount = overrides.shortTokenAmount || bigNumberify(0);

  await weth.mint(depositStore.address, executionFee);

  if (longTokenAmount.gt(0)) {
    const longToken = await contractAt("MintableToken", market.longToken);
    await longToken.mint(depositStore.address, longTokenAmount);
  }

  if (shortTokenAmount.gt(0)) {
    const shortToken = await contractAt("MintableToken", market.shortToken);
    await shortToken.mint(depositStore.address, shortTokenAmount);
  }

  const params = {
    receiver: receiver.address,
    callbackContract: callbackContract.address,
    market: market.marketToken,
    minMarketTokens,
    shouldConvertETH,
    executionFee,
    callbackGasLimit,
  };

  await logGasUsage({
    tx: depositHandler.connect(wallet).createDeposit(account.address, params),
    label: overrides.gasUsageLabel,
  });
}

async function executeDeposit(fixture, overrides = {}) {
  const { depositStore, depositHandler, weth, usdc } = fixture.contracts;
  const { gasUsageLabel } = overrides;
  const tokens = overrides.tokens || [weth.address, usdc.address];
  const prices = overrides.prices || [expandDecimals(5000, 4), expandDecimals(1, 6)];
  const depositKeys = await depositStore.getDepositKeys(0, 1);
  const deposit = await depositStore.get(depositKeys[0]);

  const params = {
    key: depositKeys[0],
    oracleBlockNumber: deposit.updatedAtBlock,
    tokens,
    prices,
    execute: depositHandler.executeDeposit,
    gasUsageLabel,
  };

  await executeWithOracleParams(fixture, params);
}

async function handleDeposit(fixture, overrides = {}) {
  await createDeposit(fixture, overrides.create);
  await executeDeposit(fixture, overrides.execute);
}

module.exports = {
  createDeposit,
  executeDeposit,
  handleDeposit,
};
