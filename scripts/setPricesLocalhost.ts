import { grantRoleIfNotGranted } from "../utils/role";
import { expandDecimals } from "../utils/math";
import { hashString, hashData } from "../utils/hash";
import { TOKEN_ORACLE_TYPES, encodeDataStreamData, getSignerInfo, signPrice } from "../utils/oracle";
import * as keys from "../utils/keys";

async function main() {
  const dataStore = await ethers.getContract("DataStore");
  const oracle = await ethers.getContract("Oracle");
  const wbtc = await ethers.getContract("WBTC");
  const usdc = await ethers.getContract("USDC");

  await (await dataStore.setBytes32(keys.dataStreamIdKey(wbtc.address), hashString("WBTC"))).wait();

  await (await dataStore.setUint(keys.dataStreamMultiplierKey(wbtc.address), expandDecimals(1, 34))).wait();

  const block = await ethers.provider.getBlock("latest");

  const params = await getOracleParams({
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

async function getOracleParams({ dataStreamTokens, dataStreamData, priceFeedTokens }) {
  const dataStore = await hre.ethers.getContract("DataStore");
  const chainlinkPriceFeedProvider = await hre.ethers.getContract("ChainlinkPriceFeedProvider");
  const chainlinkDataStreamFeedProvider = await hre.ethers.getContract("ChainlinkDataStreamProvider");

  const params = {
    tokens: [],
    providers: [],
    data: [],
  };

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
