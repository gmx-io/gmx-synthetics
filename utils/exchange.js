const { logGasUsage } = require("./gas");
const { getOracleParams } = require("./oracle");

async function executeWithOracleParams(fixture, overrides) {
  const { key, oracleBlockNumber, tokens, prices, execute, gasUsageLabel } = overrides;
  const { provider } = ethers;
  const { signers } = fixture.accounts;
  const { oracleSalt, signerIndexes } = fixture.props;

  const block = await provider.getBlock(oracleBlockNumber.toNumber());

  const oracleParams = await getOracleParams({
    oracleSalt,
    oracleBlockNumbers: Array(tokens.length).fill(block.number, 0, tokens.length),
    blockHashes: Array(tokens.length).fill(block.hash, 0, tokens.length),
    signerIndexes,
    tokens: tokens,
    prices: prices,
    signers,
    priceFeedTokens: [],
  });

  await logGasUsage({
    tx: execute(key, oracleParams),
    label: gasUsageLabel,
  });
}

module.exports = {
  executeWithOracleParams,
};
