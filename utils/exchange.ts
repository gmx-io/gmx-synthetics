import { logGasUsage } from "./gas";
import { getOracleParams } from "./oracle";

export async function executeWithOracleParams(fixture, overrides) {
  const { key, oracleBlockNumber, tokens, tokenOracleTypes, precisions, minPrices, maxPrices, execute, gasUsageLabel } =
    overrides;
  const { provider } = ethers;
  const { signers } = fixture.accounts;
  const { oracleSalt, signerIndexes } = fixture.props;

  const block = await provider.getBlock(oracleBlockNumber.toNumber());

  const args = {
    oracleSalt,
    minOracleBlockNumbers: Array(tokens.length).fill(block.number, 0, tokens.length),
    maxOracleBlockNumbers: Array(tokens.length).fill(block.number, 0, tokens.length),
    oracleTimestamps: Array(tokens.length).fill(block.timestamp, 0, tokens.length),
    blockHashes: Array(tokens.length).fill(block.hash, 0, tokens.length),
    signerIndexes,
    tokens,
    tokenOracleTypes,
    precisions,
    minPrices,
    maxPrices,
    signers,
    priceFeedTokens: [],
  };
  const oracleParams = await getOracleParams(args);

  await logGasUsage({
    tx: execute(key, oracleParams),
    label: gasUsageLabel,
  });
}
