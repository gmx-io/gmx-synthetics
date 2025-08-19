import hre from "hardhat";
import { getPositionImpactPoolWithdrawalPayload, getRandomSalt, timelockWriteMulticall } from "../utils/timelock";
import { bigNumberify } from "../utils/math";
import { constants } from "ethers";
import { readJsonFile, writeJsonFile } from "../utils/file";
import path from "path";
import { fetchSignedPrices } from "../utils/prices";

/*
Executes signalWithdrawFromPositionImpactPool and executeWithOraclePrice timelock methods.
executeWithOraclePrice method should be called after configurable timelock delay passed

Timelock methods need same salt param for both calls. This salt is generated during signal* method and
 stored in the cache folder locally. If cache is missing script will try to load salt from env variable.
 Original salt param can be obtained through the explorer if no one knows it.

Args are passing as env vars.

@arg MARKET - market key to withdraw from
@arg AMOUNT - amount in market _index_ token to withdraw (decimals should be taken from token. e.g ETH has 18 decimals)
@arg RECEIVER - funds receiver address
@arg TIMELOCK_METHOD - should be one of "signalWithdrawFromPositionImpactPool" || "executeWithOraclePrice"
@arg SALT(optional) - provide custom salt for execute* method
@arg ORACLE(optional) - which oracle to use for prices. Possible options: "chainlinkPriceFeed" | "chainlinkDataStream".
default: chainlinkPriceFeed

example for ETH-USDC market to withdraw 1 ETH worth of funds:
MARKET=0x70d95587d40A2caf56bd97485aB3Eec10Bee6336 AMOUNT=1000000000000000000 \
RECEIVER=0xE63F81517D622405E2C04410c933ad4ab6c78731 \
TIMELOCK_METHOD=signalWithdrawFromPositionImpactPool \
npx hardhat run scripts/withdrawFromPositionImpactPool.ts --network arbitrum
 */

const expectedTimelockMethods = ["signalWithdrawFromPositionImpactPool", "executeWithOraclePrice"];

function mapTokenInfo(token) {
  return {
    address: token.address,
    provider: token.priceFeed.address,
    data: "0x",
  };
}

async function fetchChainlinkPriceFeedInfo(marketInfo) {
  const result = {
    shortToken: {},
    longToken: {},
    indexToken: {},
  };
  const tokens = await hre.gmx.getTokens();
  for (const tokenSymbol of Object.keys(tokens)) {
    if (tokens[tokenSymbol].address.toLowerCase() === marketInfo.shortToken.toLowerCase()) {
      result.shortToken = mapTokenInfo(tokens[tokenSymbol]);
    }
    if (tokens[tokenSymbol].address.toLowerCase() === marketInfo.longToken.toLowerCase()) {
      result.longToken = mapTokenInfo(tokens[tokenSymbol]);
    }
    if (tokens[tokenSymbol].address.toLowerCase() === marketInfo.indexToken.toLowerCase()) {
      result.indexToken = mapTokenInfo(tokens[tokenSymbol]);
    }
  }
  return result;
}

async function fetchChainlinkDataStreamInfo(marketInfo) {
  const chainlinkDataStreamProvider = await hre.ethers.getContract("ChainlinkDataStreamProvider");
  const signedPrices = await fetchSignedPrices();
  return {
    shortToken: {
      address: signedPrices[marketInfo.shortToken.toLowerCase()].address,
      provider: chainlinkDataStreamProvider.address,
      data: signedPrices[marketInfo.shortToken.toLowerCase()].blob,
    },
    longToken: {
      address: signedPrices[marketInfo.longToken.toLowerCase()].address,
      provider: chainlinkDataStreamProvider.address,
      data: signedPrices[marketInfo.longToken.toLowerCase()].blob,
    },
    indexToken: {
      address: signedPrices[marketInfo.indexToken.toLowerCase()].address,
      provider: chainlinkDataStreamProvider.address,
      data: signedPrices[marketInfo.indexToken.toLowerCase()].blob,
    },
  };
}

async function fetchOracleParams(marketKey) {
  const reader = await hre.ethers.getContract("Reader");
  const dataStore = await hre.ethers.getContract("DataStore");
  const marketInfo = await reader.getMarket(dataStore.address, marketKey);

  let oracleParams: { shortToken: any; longToken: any; indexToken: any };
  if (process.env.ORACLE === "chainlinkDataStream") {
    oracleParams = await fetchChainlinkDataStreamInfo(marketInfo);
  } else {
    oracleParams = await fetchChainlinkPriceFeedInfo(marketInfo);
  }
  if (!oracleParams.shortToken) {
    throw new Error(`Token ${marketInfo.shortToken} not found`);
  }
  if (!oracleParams.longToken) {
    throw new Error(`Token ${marketInfo.longToken} not found`);
  }
  if (!oracleParams.indexToken) {
    throw new Error(`Token ${marketInfo.indexToken} not found`);
  }

  console.log(`Got oracle prices for ${oracleParams.longToken.tokenSymbol}/${oracleParams.shortToken.tokenSymbol}`);
  return {
    tokens: [oracleParams.shortToken.address, oracleParams.longToken.address, oracleParams.indexToken.address],
    providers: [oracleParams.shortToken.provider, oracleParams.longToken.provider, oracleParams.indexToken.provider],
    data: [oracleParams.shortToken.data, oracleParams.longToken.data, oracleParams.indexToken.data],
  };
}

async function main() {
  const market = process.env.MARKET;
  const amount = process.env.AMOUNT;
  const receiver = process.env.RECEIVER;
  const timelockMethod = process.env.TIMELOCK_METHOD;

  const multicallWriteParams = [];

  const timelock = await hre.ethers.getContract("TimelockConfig");

  if (!expectedTimelockMethods.includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }
  if (!market) {
    throw new Error(`No market key provided`);
  }
  if (!amount) {
    throw new Error(`No amount provided`);
  }
  if (!receiver) {
    throw new Error(`No receiver address provided`);
  }

  const saltCacheFileName = path.join(__dirname, "../cache", "salt.json");
  let saltCache = readJsonFile(saltCacheFileName);
  if (!saltCache) {
    saltCache = {};
  }

  if (timelockMethod === "signalWithdrawFromPositionImpactPool") {
    const salt = getRandomSalt();
    saltCache["withdrawFromPositionImpactPool"] = salt;

    multicallWriteParams.push(
      timelock.interface.encodeFunctionData(timelockMethod, [
        market,
        receiver,
        bigNumberify(amount),
        constants.HashZero, // predecessor
        salt,
      ])
    );

    writeJsonFile(saltCacheFileName, saltCache);
  }
  if (timelockMethod === "executeWithOraclePrice") {
    const { target, payload } = await getPositionImpactPoolWithdrawalPayload(market, receiver, bigNumberify(amount));
    let salt = saltCache["withdrawFromPositionImpactPool"];
    if (!salt) {
      salt = process.env.SALT;
    }
    if (!salt) {
      throw new Error("Please provide salt via cache file or env var");
    }

    const oracleParams = await fetchOracleParams(market);

    multicallWriteParams.push(
      timelock.interface.encodeFunctionData("executeWithOraclePrice", [
        target,
        payload,
        constants.HashZero, // predecessor
        salt,
        oracleParams,
      ])
    );
  }

  console.log(`sending ${multicallWriteParams.length} updates`);
  await timelockWriteMulticall({ timelock, multicallWriteParams });
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
