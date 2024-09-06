import hre, { ethers } from "hardhat";

import { expandDecimals } from "../utils/math";
import { encodeData } from "../utils/hash";
import { getFullKey } from "../utils/config";

import * as keys from "../utils/keys";
import { OracleProvider } from "../config/oracle";

const DEFAULT_ORACLE_PROVIDER: OracleProvider = "chainlinkDataStream";

export async function updateOracleConfigForTokens({ write }) {
  const oracleConfig = await hre.gmx.getOracle();
  const tokens = await hre.gmx.getTokens();

  const dataStore = await hre.ethers.getContract("DataStore");
  const multicall = await hre.ethers.getContract("Multicall3");
  const config = await hre.ethers.getContract("Config");

  const chainlinkPriceFeedProvider = (await hre.ethers.getContract("ChainlinkPriceFeedProvider")).address;
  const chainlinkDataStreamProvider = (await hre.ethers.getContract("ChainlinkDataStreamProvider")).address;
  const gmOracleProvider = (await hre.ethers.getContract("GmOracleProvider")).address;

  function getOracleProvider(oracleProviderKey?: OracleProvider) {
    if (oracleProviderKey === undefined || oracleProviderKey === "chainlinkDataStream") {
      // use Chainlink data stream by default
      return chainlinkDataStreamProvider;
    } else if (oracleProviderKey === "gmOracle") {
      return gmOracleProvider;
    } else if (oracleProviderKey === "chainlinkPriceFeed") {
      return chainlinkPriceFeedProvider;
    }

    throw Error(`Unknown provider ${oracleProviderKey}`);
  }

  const multicallReadParams = [];

  const tokenSymbols = Object.keys(tokens);
  let paramsCount: number | undefined = undefined;

  for (const tokenSymbol of tokenSymbols) {
    const token = tokens[tokenSymbol];
    const oracleProvider = getOracleProvider(token.oracleProvider);
    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getAddress", [
        getFullKey(keys.PRICE_FEED, encodeData(["address"], [token.address])),
      ]),
    });
    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getBytes32", [
        getFullKey(keys.DATA_STREAM_ID, encodeData(["address"], [token.address])),
      ]),
    });
    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getAddress", [
        getFullKey(keys.ORACLE_PROVIDER_FOR_TOKEN, encodeData(["address"], [token.address])),
      ]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        getFullKey(
          keys.ORACLE_TIMESTAMP_ADJUSTMENT,
          encodeData(["address", "address"], [oracleProvider, token.address])
        ),
      ]),
    });

    if (paramsCount === undefined) {
      paramsCount = multicallReadParams.length;
    }
  }

  const result = await multicall.callStatic.aggregate3(multicallReadParams);

  const onchainOracleConfig = {};
  const { defaultAbiCoder } = ethers.utils;

  for (let i = 0; i < tokenSymbols.length; i++) {
    const tokenSymbol = tokenSymbols[i];
    onchainOracleConfig[tokenSymbol] = {
      priceFeed: defaultAbiCoder.decode(["address"], result[i * paramsCount].returnData)[0],
      dataStreamId: result[i * paramsCount + 1].returnData,
      oracleProvider: defaultAbiCoder.decode(["address"], result[i * paramsCount + 2].returnData)[0],
      oracleTimestampAdjustment: defaultAbiCoder.decode(["uint"], result[i * paramsCount + 3].returnData)[0],
    };
  }

  const multicallWriteParams = [];

  for (let i = 0; i < tokenSymbols.length; i++) {
    const tokenSymbol = tokenSymbols[i];
    const token = tokens[tokenSymbol];
    const onchainConfig = onchainOracleConfig[tokenSymbol];
    const oracleInfo = oracleConfig.tokens[tokenSymbol];

    if (onchainConfig.priceFeed === ethers.constants.AddressZero && oracleInfo && oracleInfo.priceFeed) {
      const { priceFeed } = oracleInfo;
      const priceFeedMultiplier = expandDecimals(1, 60 - token.decimals - priceFeed.decimals);
      const stablePrice = priceFeed.stablePrice ? priceFeed.stablePrice : 0;

      console.log(
        `setPriceFeed(${tokenSymbol}, ${priceFeed.address}, ${priceFeedMultiplier.toString()}, ${
          priceFeed.heartbeatDuration
        }, ${stablePrice.toString()})`
      );

      multicallWriteParams.push(
        config.interface.encodeFunctionData("setPriceFeed", [
          token.address,
          priceFeed.address,
          priceFeedMultiplier,
          priceFeed.heartbeatDuration,
          stablePrice,
        ])
      );
    }

    if (onchainConfig.dataStreamId === ethers.constants.HashZero && token.dataStreamFeedId) {
      const dataStreamMultiplier = expandDecimals(1, 60 - token.decimals - token.dataStreamFeedDecimals);

      console.log(`setDataStream(${tokenSymbol} ${token.dataStreamFeedId}, ${dataStreamMultiplier.toString()})`);

      multicallWriteParams.push(
        config.interface.encodeFunctionData("setDataStream", [
          token.address,
          token.dataStreamFeedId,
          dataStreamMultiplier,
        ])
      );
    }

    if (
      token.oracleTimestampAdjustment !== undefined &&
      !onchainConfig.oracleTimestampAdjustment.eq(token.oracleTimestampAdjustment)
    ) {
      const oracleProviderKey = token.oracleProvider || DEFAULT_ORACLE_PROVIDER;
      console.log(
        `set oracle timestamp adjustment ${oracleProviderKey} ${tokenSymbol} ${token.oracleTimestampAdjustment}`
      );

      const oracleProvider = getOracleProvider(token.oracleProvider);
      multicallWriteParams.push(
        config.interface.encodeFunctionData("setUint", [
          keys.ORACLE_TIMESTAMP_ADJUSTMENT,
          defaultAbiCoder.encode(["address", "address"], [oracleProvider, token.address]),
          token.oracleTimestampAdjustment,
        ])
      );
    }
  }

  for (const tokenSymbol of tokenSymbols) {
    const token = tokens[tokenSymbol];
    const onchainConfig = onchainOracleConfig[tokenSymbol];
    const oracleProvider = getOracleProvider(token.oracleProvider);

    if (onchainConfig.oracleProvider.toLowerCase() !== oracleProvider.toLowerCase()) {
      console.log(`update oracle provider for ${tokenSymbol}`);
      multicallWriteParams.push(
        config.interface.encodeFunctionData("initOracleProviderForToken", [token.address, oracleProvider])
      );
      multicallWriteParams.push(
        config.interface.encodeFunctionData("setAddress", [
          keys.ORACLE_PROVIDER_FOR_TOKEN,
          encodeData(["address"], [token.address]),
          oracleProvider,
        ])
      );
    }
  }

  console.log(`updating ${multicallWriteParams.length} params`);
  console.log("multicallWriteParams", multicallWriteParams);

  if (write && multicallWriteParams.length > 0) {
    const tx = await config.multicall(multicallWriteParams);
    console.log(`tx sent: ${tx.hash}`);
  } else {
    console.log("NOTE: executed in read-only mode, no transactions were sent");
  }
}
