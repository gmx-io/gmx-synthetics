const { expandDecimals } = require("./math");
const { executeWithOracleParams } = require("./exchange");

async function createDeposit(fixture, overrides = {}) {
  const { depositStore, depositHandler, weth, ethUsdMarket } = fixture.contracts;
  const { wallet, user0 } = fixture.accounts;

  const executionFee = overrides.executionFee || "1000000000000000";
  const market = overrides.market || ethUsdMarket;
  const token = overrides.token || weth;
  const amount = overrides.amount || expandDecimals(1000, 18);

  await token.mint(depositStore.address, amount);

  if (token.address != weth.address) {
    await weth.mint(depositStore.address, executionFee);
  }

  await token.mint(depositStore.address, amount);
  await depositHandler.connect(wallet).createDeposit(user0.address, market.marketToken, 100, false, executionFee);
}

async function executeDeposit(fixture) {
  const { depositStore, depositHandler, weth, usdc } = fixture.contracts;
  const depositKeys = await depositStore.getDepositKeys(0, 1);
  const _deposit = await depositStore.get(depositKeys[0]);

  await executeWithOracleParams(fixture, {
    key: depositKeys[0],
    oracleBlockNumber: _deposit.updatedAtBlock,
    tokens: [weth.address, usdc.address],
    prices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
    execute: depositHandler.executeDeposit,
  });
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
