import hre, { ethers } from "hardhat";

import { expandDecimals } from "../utils/math";
import { encodeData } from "../utils/hash";
import { getFullKey } from "../utils/config";
import { timelockWriteMulticall } from "../utils/timelock";

import * as keys from "../utils/keys";

const expectedPhases = ["signal", "finalize"];

export async function updateOracleConfigForTokens({ write }) {
  const tokens = await hre.gmx.getTokens();

  const dataStore = await hre.ethers.getContract("DataStore");
  const multicall = await hre.ethers.getContract("Multicall3");
  const timelock = await hre.ethers.getContract("Timelock");

  const multicallReadParams = [];

  const phase = process.env.PHASE;

  if (!expectedPhases.includes(phase)) {
    throw new Error(`Unexpected PHASE: ${phase}`);
  }

  const tokenSymbols = Object.keys(tokens);
  let paramsCount: number | undefined = undefined;

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
      callData: dataStore.interface.encodeFunctionData("getUint", [
        getFullKey(keys.PRICE_FEED_MULTIPLIER, encodeData(["address"], [token.address])),
      ]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        getFullKey(keys.STABLE_PRICE, encodeData(["address"], [token.address])),
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
      callData: dataStore.interface.encodeFunctionData("getUint", [
        getFullKey(keys.DATA_STREAM_MULTIPLIER, encodeData(["address"], [token.address])),
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
      priceFeedMultiplier: defaultAbiCoder.decode(["uint"], result[i * paramsCount + 1].returnData)[0],
      stablePrice: defaultAbiCoder.decode(["uint"], result[i * paramsCount + 2].returnData)[0],
      dataStreamId: result[i * paramsCount + 3].returnData,
      dataStreamMultiplier: defaultAbiCoder.decode(["uint"], result[i * paramsCount + 4].returnData)[0],
    };
  }

  const multicallWriteParams = [];

  for (let i = 0; i < tokenSymbols.length; i++) {
    const tokenSymbol = tokenSymbols[i];
    console.log(`checking: ${tokenSymbol}`);
    const token = tokens[tokenSymbol];
    const onchainConfig = onchainOracleConfig[tokenSymbol];

    if (token.priceFeed && onchainConfig.priceFeed.toLowerCase() !== token.priceFeed.address.toLowerCase()) {
      const { priceFeed } = token;
      const priceFeedMultiplier = expandDecimals(1, 60 - token.decimals - priceFeed.decimals);
      const stablePrice = priceFeed.stablePrice ? priceFeed.stablePrice : 0;

      if (!onchainConfig.priceFeedMultiplier.eq(priceFeedMultiplier)) {
        throw new Error(
          `priceFeedMultiplier mismatch for ${tokenSymbol}: ${priceFeedMultiplier.toString()}, ${onchainConfig.priceFeedMultiplier.toString()}`
        );
      }

      if (!onchainConfig.stablePrice.eq(stablePrice)) {
        throw new Error(
          `stablePrice mismatch for ${tokenSymbol}: ${stablePrice.toString()}, ${onchainConfig.stablePrice.toString()}`
        );
      }

      console.log(
        `setPriceFeed(${tokenSymbol}, ${priceFeed.address}, ${priceFeedMultiplier.toString()}, ${
          priceFeed.heartbeatDuration
        }, ${stablePrice.toString()})`
      );

      const method = phase === "signal" ? "signalSetPriceFeed" : "setPriceFeedAfterSignal";

      multicallWriteParams.push(
        timelock.interface.encodeFunctionData(method, [
          token.address,
          priceFeed.address,
          priceFeedMultiplier,
          priceFeed.heartbeatDuration,
          stablePrice,
        ])
      );
    }

    if (token.dataStreamFeedId && onchainConfig.dataStreamId !== token.dataStreamFeedId) {
      const dataStreamMultiplier = expandDecimals(1, 60 - token.decimals - token.dataStreamFeedDecimals);

      if (!onchainConfig.dataStreamMultiplier.eq(dataStreamMultiplier)) {
        throw new Error(
          `dataStreamMultiplier mismatch for ${tokenSymbol}: ${dataStreamMultiplier.toString()}, ${onchainConfig.dataStreamMultiplier.toString()}`
        );
      }

      console.log(`setDataStream(${tokenSymbol} ${token.dataStreamFeedId}, ${dataStreamMultiplier.toString()})`);

      const method = phase === "signal" ? "signalSetDataStream" : "setDataStreamAfterSignal";

      multicallWriteParams.push(
        timelock.interface.encodeFunctionData(method, [token.address, token.dataStreamFeedId, dataStreamMultiplier])
      );
    }
  }

  console.log(`updating ${multicallWriteParams.length} params`);

  await timelockWriteMulticall({ timelock, multicallWriteParams });
}

async function main() {
  await updateOracleConfigForTokens({ write: process.env.WRITE });
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
