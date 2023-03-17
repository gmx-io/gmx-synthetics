import { bigNumberify, expandDecimals, MAX_UINT8, MAX_UINT32, MAX_UINT64 } from "./math";
import { hashString, hashData } from "./hash";

import BN from "bn.js";

export const TOKEN_ORACLE_TYPES: { [key: string]: string } = {
  ONE_PERCENT_PER_MINUTE: hashString("one-percent-per-minute"),
};

TOKEN_ORACLE_TYPES.DEFAULT = TOKEN_ORACLE_TYPES.ONE_PERCENT_PER_MINUTE;

export async function signPrice({
  signer,
  salt,
  minOracleBlockNumber,
  maxOracleBlockNumber,
  oracleTimestamp,
  blockHash,
  token,
  tokenOracleType,
  precision,
  minPrice,
  maxPrice,
}) {
  if (bigNumberify(minOracleBlockNumber).gt(MAX_UINT64)) {
    throw new Error(`minOracleBlockNumber exceeds max value: ${minOracleBlockNumber.toString()}`);
  }

  if (bigNumberify(maxOracleBlockNumber).gt(MAX_UINT64)) {
    throw new Error(`maxOracleBlockNumber exceeds max value: ${maxOracleBlockNumber.toString()}`);
  }

  if (bigNumberify(oracleTimestamp).gt(MAX_UINT64)) {
    throw new Error(`oracleTimestamp exceeds max value: ${oracleTimestamp.toString()}`);
  }

  if (bigNumberify(precision).gt(MAX_UINT8)) {
    throw new Error(`precision exceeds max value: ${precision.toString()}`);
  }

  if (bigNumberify(minPrice).gt(MAX_UINT32)) {
    throw new Error(`minPrice exceeds max value: ${minPrice.toString()}`);
  }

  if (bigNumberify(maxPrice).gt(MAX_UINT32)) {
    throw new Error(`maxPrice exceeds max value: ${maxPrice.toString()}`);
  }

  const expandedPrecision = expandDecimals(1, precision);
  const hash = hashData(
    ["bytes32", "uint256", "uint256", "uint256", "bytes32", "address", "bytes32", "uint256", "uint256", "uint256"],
    [
      salt,
      minOracleBlockNumber,
      maxOracleBlockNumber,
      oracleTimestamp,
      blockHash,
      token,
      tokenOracleType,
      expandedPrecision,
      minPrice,
      maxPrice,
    ]
  );

  return await signer.signMessage(ethers.utils.arrayify(hash));
}

export async function signPrices({
  signers,
  salt,
  minOracleBlockNumber,
  maxOracleBlockNumber,
  oracleTimestamp,
  blockHash,
  token,
  tokenOracleType,
  precision,
  minPrices,
  maxPrices,
}) {
  const signatures = [];
  for (let i = 0; i < signers.length; i++) {
    const signature = await signPrice({
      signer: signers[i],
      salt,
      minOracleBlockNumber,
      maxOracleBlockNumber,
      oracleTimestamp,
      blockHash,
      token,
      tokenOracleType,
      precision,
      minPrice: minPrices[i],
      maxPrice: maxPrices[i],
    });
    signatures.push(signature);
  }
  return signatures;
}

export function getSignerInfo(signerIndexes) {
  const signerIndexLength = 16;
  let signerInfo = new BN(signerIndexes.length);
  for (let i = 0; i < signerIndexes.length; i++) {
    const signerIndex = new BN(signerIndexes[i]);
    if (signerIndex.gt(new BN(MAX_UINT8))) {
      throw new Error(`Max signer index exceeded: ${signerIndex.toString()}`);
    }
    signerInfo = signerInfo.or(signerIndex.shln((i + 1) * signerIndexLength));
  }
  return signerInfo.toString();
}

function getCompactedValues({ values, compactedValueBitLength, maxValue }) {
  const compactedValuesPerSlot = 256 / compactedValueBitLength;
  const compactedValues = [];
  let shouldExit = false;

  for (let i = 0; i < Math.floor((values.length - 1) / compactedValuesPerSlot) + 1; i++) {
    let valueBits = new BN("0");
    for (let j = 0; j < compactedValuesPerSlot; j++) {
      const index = i * compactedValuesPerSlot + j;
      if (index >= values.length) {
        shouldExit = true;
        break;
      }

      const value = new BN(values[index].toString());

      if (value.gt(new BN(maxValue))) {
        throw new Error(`Max value exceeded: ${value.toString()}`);
      }

      valueBits = valueBits.or(value.shln(j * compactedValueBitLength));
    }

    compactedValues.push(valueBits.toString());

    if (shouldExit) {
      break;
    }
  }

  return compactedValues;
}

export function getCompactedPrices(prices) {
  return getCompactedValues({
    values: prices,
    compactedValueBitLength: 32,
    maxValue: MAX_UINT32,
  });
}

export function getCompactedPriceIndexes(priceIndexes) {
  return getCompactedValues({
    values: priceIndexes,
    compactedValueBitLength: 8,
    maxValue: MAX_UINT8,
  });
}

export function getCompactedDecimals(decimals) {
  return getCompactedValues({
    values: decimals,
    compactedValueBitLength: 8,
    maxValue: MAX_UINT8,
  });
}

export function getCompactedOracleBlockNumbers(blockNumbers) {
  return getCompactedValues({
    values: blockNumbers,
    compactedValueBitLength: 64,
    maxValue: MAX_UINT64,
  });
}

export function getCompactedOracleTimestamps(timestamps) {
  return getCompactedValues({
    values: timestamps,
    compactedValueBitLength: 64,
    maxValue: MAX_UINT64,
  });
}

export async function getOracleParamsForSimulation({ tokens, minPrices, maxPrices, precisions }) {
  if (tokens.length !== minPrices.length) {
    throw new Error(`Invalid input, tokens.length != minPrices.length ${tokens}, ${minPrices}`);
  }

  if (tokens.length !== maxPrices.length) {
    throw new Error(`Invalid input, tokens.length != maxPrices.length ${tokens}, ${maxPrices}`);
  }

  const primaryTokens = [];
  const primaryPrices = [];
  const secondaryTokens = [];
  const secondaryPrices = [];

  const recordedTokens = {};

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const precisionMultiplier = expandDecimals(1, precisions[i]);
    const minPrice = minPrices[i].mul(precisionMultiplier);
    const maxPrice = maxPrices[i].mul(precisionMultiplier);
    if (!recordedTokens[token]) {
      primaryTokens.push(token);
      primaryPrices.push({
        min: minPrice,
        max: maxPrice,
      });
    } else {
      secondaryTokens.push(token);
      secondaryPrices.push({
        min: minPrice,
        max: maxPrice,
      });
    }

    recordedTokens[token] = true;
  }

  return {
    primaryTokens,
    primaryPrices,
    secondaryTokens,
    secondaryPrices,
  };
}

export async function getOracleParams({
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
  priceFeedTokens,
}) {
  const signerInfo = getSignerInfo(signerIndexes);
  const allMinPrices = [];
  const allMaxPrices = [];
  const minPriceIndexes = [];
  const maxPriceIndexes = [];
  const signatures = [];

  for (let i = 0; i < tokens.length; i++) {
    const minOracleBlockNumber = minOracleBlockNumbers[i];
    const maxOracleBlockNumber = maxOracleBlockNumbers[i];
    const oracleTimestamp = oracleTimestamps[i];
    const blockHash = blockHashes[i];
    const token = tokens[i];
    const tokenOracleType = tokenOracleTypes[i];
    const precision = precisions[i];

    const minPrice = minPrices[i];
    const maxPrice = maxPrices[i];

    for (let j = 0; j < signers.length; j++) {
      const signature = await signPrice({
        signer: signers[j],
        salt: oracleSalt,
        minOracleBlockNumber,
        maxOracleBlockNumber,
        oracleTimestamp,
        blockHash,
        token,
        tokenOracleType,
        precision,
        minPrice,
        maxPrice,
      });
      allMinPrices.push(minPrice.toString());
      minPriceIndexes.push(j);
      allMaxPrices.push(maxPrice.toString());
      maxPriceIndexes.push(j);
      signatures.push(signature);
    }
  }

  return {
    signerInfo,
    tokens,
    compactedMinOracleBlockNumbers: getCompactedOracleBlockNumbers(minOracleBlockNumbers),
    compactedMaxOracleBlockNumbers: getCompactedOracleBlockNumbers(maxOracleBlockNumbers),
    compactedOracleTimestamps: getCompactedOracleTimestamps(oracleTimestamps),
    compactedDecimals: getCompactedDecimals(precisions),
    compactedMinPrices: getCompactedPrices(allMinPrices),
    compactedMinPricesIndexes: getCompactedPriceIndexes(minPriceIndexes),
    compactedMaxPrices: getCompactedPrices(allMaxPrices),
    compactedMaxPricesIndexes: getCompactedPriceIndexes(maxPriceIndexes),
    signatures,
    priceFeedTokens,
  };
}
