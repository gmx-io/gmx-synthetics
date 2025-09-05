import hre, { ethers } from "hardhat";
import prompts from "prompts";

import { getFullKey } from "../utils/config";
import { encodeData, hashString } from "../utils/hash";
import { bigNumberify, expandDecimals } from "../utils/math";

import { TokenConfig } from "../config/tokens";
import * as keys from "../utils/keys";
import { getOracleProviderAddress } from "../utils/oracle";

import IPriceFeed from "../artifacts/contracts/oracle/IPriceFeed.sol/IPriceFeed.json";

export async function initOracleConfigForTokens({ write }) {
  const tokens = await hre.gmx.getTokens();

  const dataStore = await hre.ethers.getContract("DataStore");
  const multicall = await hre.ethers.getContract("Multicall3");
  const config = await hre.ethers.getContract("Config");
  const oracle = await hre.ethers.getContract("Oracle");

  const multicallReadParams = [];

  const tokenSymbols = Object.keys(tokens);
  let paramsCount: number | undefined = undefined;

  for (const tokenSymbol of tokenSymbols) {
    const token = tokens[tokenSymbol];
    const oracleProviderAddress = await getOracleProviderAddress(token.oracleProvider);

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
        getFullKey(keys.ORACLE_PROVIDER_FOR_TOKEN, encodeData(["address", "address"], [oracle.address, token.address])),
      ]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        getFullKey(
          keys.ORACLE_TIMESTAMP_ADJUSTMENT,
          encodeData(["address", "address"], [oracleProviderAddress, token.address])
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
    console.log(`checking ${tokenSymbol}`);
    const token = tokens[tokenSymbol];
    const onchainConfig = onchainOracleConfig[tokenSymbol];

    const { priceFeed } = token;

    let priceFeedMultiplier = bigNumberify(0);
    if (priceFeed) {
      priceFeedMultiplier = expandDecimals(1, 60 - token.decimals - priceFeed.decimals);
      await validatePriceFeed(tokenSymbol, token, priceFeedMultiplier);
    }

    const initOracleConfigPriceFeedParams = {
      feedAddress: token.priceFeed?.address ?? ethers.constants.AddressZero,
      multiplier: priceFeedMultiplier,
      heartbeatDuration: priceFeed?.heartbeatDuration ?? 0,
      stablePrice: priceFeed?.stablePrice ?? 0,
    };

    const dataStreamMultiplier = expandDecimals(1, 60 - token.decimals - token.dataStreamFeedDecimals);
    const dataStreamSpreadReductionFactor = bigNumberify(token.dataStreamSpreadReductionFactor ?? 0);

    const initOracleConfigDataStreamParams = {
      feedId: token.dataStreamFeedId,
      multiplier: dataStreamMultiplier,
      spreadReductionFactor: dataStreamSpreadReductionFactor,
    };

    const initOracleConfigEdgeParams = {
      feedId: hashString(token.edge?.feedId || ""), // token.edge.feedId is expected as string e.g. ETHUSD
      tokenDecimals: token.edge?.tokenDecimals || 0,
    };

    const initOracleConfigParams = {
      token: token.address,
      priceFeed: initOracleConfigPriceFeedParams,
      dataStream: initOracleConfigDataStreamParams,
      edge: initOracleConfigEdgeParams,
    };

    console.log(
      `    onchainConfig.priceFeed: ${onchainConfig.priceFeed}, onchainConfig.dataStreamId: ${onchainConfig.dataStreamId}`
    );

    if (
      onchainConfig.priceFeed === ethers.constants.AddressZero &&
      onchainConfig.dataStreamId === ethers.constants.HashZero
    ) {
      console.log(`${multicallWriteParams.length}: init oracle config for ${tokenSymbol}`);
      multicallWriteParams.push(config.interface.encodeFunctionData("initOracleConfig", [initOracleConfigParams]));
    } else {
      console.log(`skipping priceFeed and dataStream update for ${tokenSymbol}`);
    }

    if (
      token.oracleTimestampAdjustment !== undefined &&
      !onchainConfig.oracleTimestampAdjustment.eq(token.oracleTimestampAdjustment)
    ) {
      const oracleProviderAddress = await getOracleProviderAddress(token.oracleProvider);
      console.log(
        `${multicallWriteParams.length}: set oracle timestamp adjustment ${oracleProviderAddress} ${tokenSymbol} ${token.oracleTimestampAdjustment}`
      );

      multicallWriteParams.push(
        config.interface.encodeFunctionData("setUint", [
          keys.ORACLE_TIMESTAMP_ADJUSTMENT,
          defaultAbiCoder.encode(["address", "address"], [oracleProviderAddress, token.address]),
          token.oracleTimestampAdjustment,
        ])
      );
    }
  }

  for (const tokenSymbol of tokenSymbols) {
    const token = tokens[tokenSymbol];
    const onchainConfig = onchainOracleConfig[tokenSymbol];
    const oracleProviderAddress = await getOracleProviderAddress(token.oracleProvider);

    if (onchainConfig.oracleProvider === ethers.constants.AddressZero) {
      console.log(`${multicallWriteParams.length}: update oracle provider for ${tokenSymbol}`);
      multicallWriteParams.push(
        config.interface.encodeFunctionData("initOracleProviderForToken", [
          oracle.address,
          token.address,
          oracleProviderAddress,
        ])
      );
    } else {
      console.log(`skipping update oracle provider for ${tokenSymbol}`);
    }
  }

  console.log("multicallWriteParams", multicallWriteParams);
  if (multicallWriteParams.length === 0) {
    console.log("no params to update");
    return;
  }

  console.log(`updating ${multicallWriteParams.length} params`);

  if (!write) {
    ({ write } = await prompts({
      type: "confirm",
      name: "write",
      message: "Do you want to execute the transactions?",
    }));
  }

  if (write) {
    const tx = await config.multicall(multicallWriteParams);

    console.log(`tx sent: ${tx.hash}`);
  } else {
    console.log("NOTE: executed in read-only mode, no transactions were sent");
  }
}

export async function validatePriceFeed(tokenSymbol: string, token: TokenConfig, priceFeedMultiplier) {
  if (process.env.SKIP_PRICE_FEED_VALIDATION) {
    console.log(`skipping price feed validation for ${tokenSymbol}`);
    return;
  }

  const { priceFeed } = token;
  console.log(`validating price feed for ${tokenSymbol}. use SKIP_PRICE_FEED_VALIDATION=true to skip`);

  if (!priceFeed || priceFeed.address === ethers.constants.AddressZero) {
    return;
  }

  const contract = new ethers.Contract(priceFeed.address, IPriceFeed.abi, ethers.provider);

  let decimals: number;
  let description: string;
  let latestRoundData;

  try {
    [decimals, description, latestRoundData] = await Promise.all([
      contract.decimals(),
      contract.description(),
      contract.latestRoundData(),
    ]);
  } catch (e) {
    console.log(`failed to validate price feed for ${tokenSymbol}`);
    throw e;
  }

  console.log(`${tokenSymbol} decimals: ${decimals.toString()}`);
  console.log(
    `${tokenSymbol} price: ${ethers.utils.formatUnits(
      latestRoundData.answer.mul(priceFeedMultiplier).mul(expandDecimals(1, token.decimals)).div(expandDecimals(1, 30)),
      30
    )}`
  );

  if (decimals !== priceFeed.decimals) {
    throw new Error(
      `Decimals mismatch for ${tokenSymbol}: ${decimals} !== ${priceFeed.decimals}. price feed: ${priceFeed.address}`
    );
  }

  let tokenSymbolReplaced =
    {
      "WBTC.e": "BTC",
      tBTC: "BTC",
      WETH: "ETH",
      "USDC.e": "USDC",
      "USDC.e (Archived)": "USDC", // botanix
      "BTC.b": "BTC",
      "WETH.e": "ETH",
      WAVAX: "AVAX",
      "USDT.e": "USDT",
      "DAI.e": "DAI",
      pBTC: "BTC",
      "USDC.SG": "USDC", // arbitrumSepolia
    }[tokenSymbol] ?? tokenSymbol;

  // in avalancheFuji USDT feed is used as USDC and DAI price feeds
  const isAvalancheFuji = hre.network.name === "avalancheFuji";
  if (isAvalancheFuji && (tokenSymbolReplaced === "USDC" || tokenSymbolReplaced === "DAI")) {
    tokenSymbolReplaced = "USDT";
  }

  if (description !== `${tokenSymbolReplaced} / USD`) {
    throw new Error(
      `Description mismatch for ${tokenSymbol}: ${description} !== ${tokenSymbolReplaced} / USD. price feed: ${priceFeed.address}`
    );
  }
}
