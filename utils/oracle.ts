import { bigNumberify, expandDecimals, MAX_UINT8, MAX_UINT32, MAX_UINT64 } from "./math";
import { hashString, hashData } from "./hash";

import BN from "bn.js";

// test
export const TOKEN_ORACLE_TYPES = {
  ONE_PERCENT_PER_MINUTE: hashString("one-percent-per-minute"),
};

TOKEN_ORACLE_TYPES.DEFAULT = TOKEN_ORACLE_TYPES.ONE_PERCENT_PER_MINUTE;

export async function signPrice({
  signer,
  salt,
  oracleBlockNumber,
  blockHash,
  token,
  tokenOracleType,
  precision,
  minPrice,
  maxPrice,
}) {
  if (bigNumberify(oracleBlockNumber).gt(MAX_UINT64)) {
    throw new Error(`oracleBlockNumber exceeds max value: ${oracleBlockNumber.toString()}`);
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
    ["bytes32", "uint256", "bytes32", "address", "bytes32", "uint256", "uint256", "uint256"],
    [salt, oracleBlockNumber, blockHash, token, tokenOracleType, expandedPrecision, minPrice, maxPrice]
  );

  return await signer.signMessage(ethers.utils.arrayify(hash));
}

export async function signPrices({
  signers,
  salt,
  oracleBlockNumber,
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
      oracleBlockNumber,
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

  for (let i = 0; i < parseInt((values.length - 1) / compactedValuesPerSlot) + 1; i++) {
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

export function getCompactedPrecisions(precisions) {
  return getCompactedValues({
    values: precisions,
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

export async function getOracleParams({
  oracleSalt,
  oracleBlockNumbers,
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
    const oracleBlockNumber = oracleBlockNumbers[i];
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
        oracleBlockNumber,
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
    compactedOracleBlockNumbers: getCompactedOracleBlockNumbers(oracleBlockNumbers),
    compactedPrecisions: getCompactedPrecisions(precisions),
    compactedMinPrices: getCompactedPrices(allMinPrices),
    compactedMinPricesIndexes: getCompactedPriceIndexes(minPriceIndexes),
    compactedMaxPrices: getCompactedPrices(allMaxPrices),
    compactedMaxPricesIndexes: getCompactedPriceIndexes(maxPriceIndexes),
    signatures,
    priceFeedTokens,
  };
}
