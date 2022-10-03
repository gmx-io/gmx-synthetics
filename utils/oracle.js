const { bigNumberify, MAX_UINT8, MAX_UINT32, MAX_UINT64 } = require("./math");

const BN = require("bn.js");

async function signPrice(signer, salt, oracleBlockNumber, blockHash, token, price) {
  if (bigNumberify(price).gt(MAX_UINT32)) {
    throw new Error(`Max price exceeded: ${price.toString()}`);
  }

  if (bigNumberify(oracleBlockNumber).gt(MAX_UINT64)) {
    throw new Error(`Max oracleBlockNumber exceeded: ${price.toString()}`);
  }

  const hash = ethers.utils.solidityKeccak256(
    ["bytes32", "uint256", "bytes32", "address", "uint256"],
    [salt, oracleBlockNumber, blockHash, token, price]
  );

  return await signer.signMessage(ethers.utils.arrayify(hash));
}

async function signPrices(signers, salt, oracleBlockNumber, blockHash, token, prices) {
  const signatures = [];
  for (let i = 0; i < signers.length; i++) {
    const signature = await signPrice(signers[i], salt, oracleBlockNumber, blockHash, token, prices[i], i === 0);
    signatures.push(signature);
  }
  return signatures;
}

function getSignerInfo(signerIndexes) {
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
      let index = i * compactedValuesPerSlot + j;
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

function getCompactedPrices(prices) {
  return getCompactedValues({
    values: prices,
    compactedValueBitLength: 32,
    maxValue: MAX_UINT32,
  });
}

function getCompactedOracleBlockNumbers(blockNumbers) {
  return getCompactedValues({
    values: blockNumbers,
    compactedValueBitLength: 64,
    maxValue: MAX_UINT64,
  });
}

async function getOracleParams({
  oracleSalt,
  oracleBlockNumbers,
  blockHashes,
  signerIndexes,
  tokens,
  prices,
  signers,
  priceFeedTokens,
}) {
  const signerInfo = getSignerInfo(signerIndexes);
  const allPrices = [];
  const signatures = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const oracleBlockNumber = oracleBlockNumbers[i];
    const blockHash = blockHashes[i];

    for (let j = 0; j < signers.length; j++) {
      const price = prices[i];
      const signature = await signPrice(signers[j], oracleSalt, oracleBlockNumber, blockHash, token, price);
      allPrices.push(price.toString());
      signatures.push(signature);
    }
  }

  return {
    priceFeedTokens,
    signerInfo,
    tokens,
    compactedOracleBlockNumbers: getCompactedOracleBlockNumbers(oracleBlockNumbers),
    compactedPrices: getCompactedPrices(allPrices),
    signatures,
  };
}

module.exports = {
  signPrice,
  signPrices,
  getSignerInfo,
  getCompactedPrices,
  getCompactedOracleBlockNumbers,
  getOracleParams,
};
