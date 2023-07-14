import { logGasUsage } from "./gas";
import { bigNumberify } from "./math";
import { getOracleParams, getOracleParamsForSimulation, TOKEN_ORACLE_TYPES } from "./oracle";
import { prices as refPrices } from "./prices";

export function getExecuteParams(fixture, { tokens, prices }) {
  const { wnt, wbtc, usdc, usdt } = fixture.contracts;
  const defaultPriceInfoItems = {
    [wnt.address]: refPrices.wnt,
    [wbtc.address]: refPrices.wbtc,
    [usdc.address]: refPrices.usdc,
    [usdt.address]: refPrices.usdt,
  };

  const params = {
    tokens: [],
    precisions: [],
    minPrices: [],
    maxPrices: [],
  };

  if (tokens) {
    for (let i = 0; i < tokens.length; i++) {
      const priceInfoItem = defaultPriceInfoItems[tokens[i].address];
      if (!priceInfoItem) {
        throw new Error("Missing price info");
      }
      params.tokens.push(tokens[i].address);
      params.precisions.push(priceInfoItem.precision);
      params.minPrices.push(priceInfoItem.min);
      params.maxPrices.push(priceInfoItem.max);
    }
  }

  if (prices) {
    for (let i = 0; i < prices.length; i++) {
      const priceInfoItem = prices[i];
      const token = fixture.contracts[priceInfoItem.contractName];
      params.tokens.push(token.address);
      params.precisions.push(priceInfoItem.precision);
      params.minPrices.push(priceInfoItem.min);
      params.maxPrices.push(priceInfoItem.max);
    }
  }

  return params;
}

export async function executeWithOracleParams(fixture, overrides) {
  const { key, oracleBlocks, oracleBlockNumber, tokens, precisions, minPrices, maxPrices, execute, gasUsageLabel } =
    overrides;
  const { provider } = ethers;
  const { signers } = fixture.accounts;
  const { oracleSalt, signerIndexes } = fixture.props;

  const block = await provider.getBlock(bigNumberify(oracleBlockNumber).toNumber());
  const tokenOracleTypes =
    overrides.tokenOracleTypes || Array(tokens.length).fill(TOKEN_ORACLE_TYPES.DEFAULT, 0, tokens.length);

  let minOracleBlockNumbers = [];
  let maxOracleBlockNumbers = [];
  let oracleTimestamps = [];
  let blockHashes = [];

  if (oracleBlocks) {
    for (let i = 0; i < oracleBlocks.length; i++) {
      const oracleBlock = oracleBlocks[i];
      minOracleBlockNumbers.push(oracleBlock.number);
      maxOracleBlockNumbers.push(oracleBlock.number);
      oracleTimestamps.push(oracleBlock.timestamp);
      blockHashes.push(oracleBlock.hash);
    }
  } else {
    minOracleBlockNumbers =
      overrides.minOracleBlockNumbers || Array(tokens.length).fill(block.number, 0, tokens.length);

    maxOracleBlockNumbers =
      overrides.maxOracleBlockNumbers || Array(tokens.length).fill(block.number, 0, tokens.length);

    oracleTimestamps = overrides.oracleTimestamps || Array(tokens.length).fill(block.timestamp, 0, tokens.length);

    blockHashes = Array(tokens.length).fill(block.hash, 0, tokens.length);
  }

  const args = {
    oracleSalt,
    minOracleBlockNumbers,
    maxOracleBlockNumbers,
    oracleTimestamps,
    blockHashes,
    signerIndexes,
    tokens,
    tokenOracleTypes,
    precisions,
    minPrices,
    maxPrices,
    signers,
    priceFeedTokens: [],
  };

  let oracleParams;
  if (overrides.simulate) {
    oracleParams = await getOracleParamsForSimulation(args);
  } else {
    oracleParams = await getOracleParams(args);
  }

  return await logGasUsage({
    tx: execute(key, oracleParams),
    label: gasUsageLabel,
  });
}
