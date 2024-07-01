import hre from "hardhat";

import { expandDecimals } from "../utils/math";
import { encodeData } from "../utils/hash";
import { getFullKey } from "../utils/config";
import { timelockWriteMulticall } from "../utils/timelock";

import * as keys from "../utils/keys";

export async function updateOracleConfigForTokens({ write }) {
  const oracleConfig = await hre.gmx.getOracle();
  const tokens = await hre.gmx.getTokens();

  const dataStore = await hre.ethers.getContract("DataStore");
  const multicall = await hre.ethers.getContract("Multicall3");
  const config = await hre.ethers.getContract("Config");

  const multicallReadParams = [];

  const tokenSymbols = Object.keys(tokens);

  for (const tokenSymbol of tokenSymbols) {
    const token = tokens[tokenSymbol];
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
  }

  const result = await multicall.callStatic.aggregate3(multicallReadParams);

  const onchainOracleConfig = {};
  const { defaultAbiCoder } = ethers.utils;

  for (let i = 0; i < tokenSymbols.length; i++) {
    const tokenSymbol = tokenSymbols[i];
    onchainOracleConfig[tokenSymbol] = {
      priceFeed: defaultAbiCoder.decode(["address"], result[i * 3].returnData)[0],
      dataStreamId: result[i * 3 + 1].returnData,
      oracleProvider: defaultAbiCoder.decode(["address"], result[i * 3 + 2].returnData)[0],
    };
  }

  const multicallWriteParams = [];
  const multicallWriteParamsForTimelockAdmin = [];

  for (let i = 0; i < tokenSymbols.length; i++) {
    const tokenSymbol = tokenSymbols[i];
    const token = tokens[tokenSymbol];
    const onchainConfig = onchainOracleConfig[tokenSymbol];
    const oracleInfo = oracleConfig.tokens[tokenSymbol];

    if (onchainConfig.priceFeed === ethers.constants.AddressZero && oracleInfo && oracleInfo.priceFeed) {
      const { priceFeed } = oracleInfo;
      const priceFeedMultiplier = expandDecimals(1, 60 - token.decimals - priceFeed.decimals);
      const stablePrice = priceFeed.stablePrice ? priceFeed.stablePrice : 0;

      console.log(`setPriceFeed(${tokenSymbol})`);

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

      console.log(`setDataStream(${tokenSymbol})`);

      multicallWriteParamsForTimelockAdmin.push(
        config.interface.encodeFunctionData("setDataStream", [
          token.address,
          token.dataStreamFeedId,
          dataStreamMultiplier,
        ])
      );
    }
  }

  const defaultOracleProvider = "chainlinkDataStream";
  const oracleProviders = {
    gmOracle: (await hre.ethers.getContract("GmOracleProvider")).address,
    chainlinkDataStream: (await hre.ethers.getContract("ChainlinkDataStreamProvider")).address,
  };

  for (const tokenSymbol of tokenSymbols) {
    const token = tokens[tokenSymbol];
    const onchainConfig = onchainOracleConfig[tokenSymbol];
    const oracleProviderKey = token.oracleProvider || defaultOracleProvider;
    const oracleProvider = oracleProviders[oracleProviderKey];

    if (onchainConfig.oracleProvider.toLowerCase() !== oracleProvider.toLowerCase()) {
      console.log(`update oracle provider for ${tokenSymbol}`);
      multicallWriteParams.push(
        config.interface.encodeFunctionData("setAddress", [
          keys.ORACLE_PROVIDER_FOR_TOKEN,
          encodeData(["address"], [token.address]),
          oracleProvider,
        ])
      );
    }
  }

  console.log(`updating ${multicallWriteParams.length + multicallWriteParamsForTimelockAdmin.length} params`);
  console.log("multicallWriteParams", multicallWriteParams);
  console.log("multicallWriteParamsForTimelockAdmin", multicallWriteParamsForTimelockAdmin);

  if (write && multicallWriteParams.length > 0) {
    const tx = await config.multicall(multicallWriteParams);
    console.log(`tx sent: ${tx.hash}`);
  } else {
    console.log("NOTE: executed in read-only mode, no transactions were sent");
  }

  if (multicallWriteParamsForTimelockAdmin.length > 0) {
    await timelockWriteMulticall({ timelock: config, multicallWriteParams: multicallWriteParamsForTimelockAdmin });
  }
}
