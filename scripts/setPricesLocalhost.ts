import { grantRoleIfNotGranted } from "../utils/role";
import { expandDecimals } from "../utils/math";
import { hashString, hashData } from "../utils/hash";
import { TOKEN_ORACLE_TYPES, getOracleParams, encodeDataStreamData, getSignerInfo, signPrice } from "../utils/oracle";
import * as keys from "../utils/keys";

async function main() {
  const accounts = await ethers.getSigners();
  const signers = accounts.slice(10, 17);
  const signerIndexes = [0, 1, 2, 3, 4, 5, 6];

  const dataStore = await ethers.getContract("DataStore");
  const oracle = await ethers.getContract("Oracle");
  const wnt = await ethers.getContract("WETH");
  const wbtc = await ethers.getContract("WBTC");
  const usdc = await ethers.getContract("USDC");

  const { chainId } = await ethers.provider.getNetwork();

  const oracleSalt = hashData(["uint256", "string"], [chainId, "xget-oracle-v1"]);

  await (await dataStore.setBytes32(keys.dataStreamIdKey(wbtc.address), hashString("WBTC"))).wait();

  await (await dataStore.setUint(keys.dataStreamMultiplierKey(wbtc.address), expandDecimals(1, 34))).wait();

  const block = await ethers.provider.getBlock("latest");

  const params = await getOracleParams({
    oracleSalt,
    minOracleBlockNumbers: [block.number],
    maxOracleBlockNumbers: [block.number],
    oracleTimestamps: [block.timestamp],
    blockHashes: [block.hash],
    signerIndexes,

    tokens: [wnt.address],
    tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT],
    precisions: [8],
    minPrices: [expandDecimals(5000, 4)],
    maxPrices: [expandDecimals(5000, 4)],

    signers,

    dataStreamTokens: [wbtc.address],
    dataStreamData: [
      encodeDataStreamData({
        feedId: hashString("WBTC"),
        validFromTimestamp: block.timestamp - 2,
        observationsTimestamp: block.timestamp - 1,
        nativeFee: 0,
        linkFee: 0,
        expiresAt: block.timestamp + 200,
        price: 100_000,
        bid: 100_000 - 1,
        ask: 100_000 + 1,
      }),
    ],

    priceFeedTokens: [usdc.address],
  });

  const tx = await oracle.setPrices(params);
  console.log("setPrices tx sent:", tx.hash);
  await tx.wait();
  console.log("Prices set on localhost node");

  await grantRoleIfNotGranted("0x00D6ffb506167f4b704bB3a2023274f7793c90cc", "CONTROLLER");
}

async function getOracleParams({
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
  dataStreamTokens,
  dataStreamData,
  priceFeedTokens,
}) {
  const signerInfo = getSignerInfo(signerIndexes);

  const dataStore = await hre.ethers.getContract("DataStore");
  const gmOracleProvider = await hre.ethers.getContract("GmOracleProvider");
  const chainlinkPriceFeedProvider = await hre.ethers.getContract("ChainlinkPriceFeedProvider");
  const chainlinkDataStreamFeedProvider = await hre.ethers.getContract("ChainlinkDataStreamProvider");

  const params = {
    tokens: [],
    providers: [],
    data: [],
  };

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

    const signatures = [];
    const signedMinPrices = [];
    const signedMaxPrices = [];

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

      signedMinPrices.push(minPrice);
      signedMaxPrices.push(maxPrice);
      signatures.push(signature);
    }

    const data = ethers.utils.defaultAbiCoder.encode(
      ["tuple(address, uint256, uint256, uint256, uint256, uint256, bytes32, uint256[], uint256[], bytes[])"],
      [
        [
          token,
          signerInfo,
          precision,
          minOracleBlockNumber,
          maxOracleBlockNumber,
          oracleTimestamp,
          blockHash,
          signedMinPrices,
          signedMaxPrices,
          signatures,
        ],
      ]
    );

    params.tokens.push(token);
    params.providers.push(gmOracleProvider.address);
    params.data.push(data);
  }

  for (let i = 0; i < priceFeedTokens.length; i++) {
    const token = priceFeedTokens[i];
    await dataStore.setAddress(keys.oracleProviderForTokenKey(token), chainlinkPriceFeedProvider.address);
    params.tokens.push(token);
    params.providers.push(chainlinkPriceFeedProvider.address);
    params.data.push("0x");
  }

  for (let i = 0; i < dataStreamTokens.length; i++) {
    const token = dataStreamTokens[i];
    await dataStore.setAddress(keys.oracleProviderForTokenKey(token), chainlinkDataStreamFeedProvider.address);
    params.tokens.push(token);
    params.providers.push(chainlinkDataStreamFeedProvider.address);
    params.data.push(dataStreamData[i]);
  }

  return params;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
