import hre from "hardhat";

import { encodeData } from "../utils/hash";
import { bigNumberify } from "../utils/math";
import { getMarketKey, getOnchainMarkets } from "../utils/market";
import { getFullKey, appendUintConfigIfDifferent } from "../utils/config";
import { handleInBatches } from "../utils/batch";
import * as keys from "../utils/keys";

const processGlvs = async ({ glvs, onchainMarketsByTokens, tokens, handleConfig }) => {
  const dataStore = await hre.ethers.getContract("DataStore");
  const marketsToAdd: [string, string][] = [];

  for (const glvConfig of glvs) {
    const longToken = tokens[glvConfig.longToken];
    const shortToken = tokens[glvConfig.shortToken];
    const glvSymbol = glvConfig.symbol ?? `GLV [${glvConfig.longToken}-${glvConfig.shortToken}]`;

    const glvAddress = glvConfig.address;

    if (!glvAddress) {
      throw new Error(`No address for GLV ${longToken}-${shortToken}`);
    }

    await handleConfig(
      "uint",
      keys.GLV_SHIFT_MIN_INTERVAL,
      encodeData(["address"], [glvAddress]),
      glvConfig.shiftMinInterval,
      `shiftMinInterval ${glvSymbol}`
    );
    await handleConfig(
      "uint",
      keys.GLV_SHIFT_MAX_PRICE_IMPACT_FACTOR,
      encodeData(["address"], [glvAddress]),
      glvConfig.shiftMaxPriceImpactFactor,
      `shiftMaxPriceImpactFactor ${glvSymbol}`
    );
    await handleConfig(
      "uint",
      keys.MIN_GLV_TOKENS_FOR_FIRST_DEPOSIT,
      encodeData(["address"], [glvAddress]),
      glvConfig.minTokensForFirstGlvDeposit,
      `minTokensForFirstGlvDeposit ${glvSymbol}`
    );

    const glvSupportedMarketList = await dataStore.getAddressValuesAt(
      keys.glvSupportedMarketListKey(glvAddress),
      0,
      50
    );

    for (const glvMarketConfig of glvConfig.markets) {
      const indexToken = tokens[glvMarketConfig.indexToken];
      const marketKey = getMarketKey(indexToken.address, longToken.address, shortToken.address);
      const onchainMarket = onchainMarketsByTokens[marketKey];
      const marketAddress = onchainMarket.marketToken;

      if (!glvSupportedMarketList.includes(marketAddress)) {
        marketsToAdd.push([glvAddress, marketAddress]);
      }

      console.log("marketAddress %s", marketAddress);

      if (glvMarketConfig.isMarketDisabled !== undefined) {
        await handleConfig(
          "uint",
          keys.IS_GLV_MARKET_DISABLED,
          encodeData(["address", "address"], [glvAddress, marketAddress]),
          glvMarketConfig.isMarketDisabled,
          `isMarketDisabled ${glvSymbol}`
        );
      }
      await handleConfig(
        "uint",
        keys.GLV_MAX_MARKET_TOKEN_BALANCE_AMOUNT,
        encodeData(["address", "address"], [glvAddress, marketAddress]),
        glvMarketConfig.glvMaxMarketTokenBalanceAmount,
        `glvMaxMarketTokenBalanceAmount ${glvSymbol}`
      );
      await handleConfig(
        "uint",
        keys.GLV_MAX_MARKET_TOKEN_BALANCE_USD,
        encodeData(["address", "address"], [glvAddress, marketAddress]),
        glvMarketConfig.glvMaxMarketTokenBalanceUsd,
        `glvMaxMarketTokenBalanceUsd ${glvSymbol}`
      );
    }
  }
  return marketsToAdd;
};

export async function updateGlvConfig({ write }) {
  const { read } = hre.deployments;

  const tokens = await hre.gmx.getTokens();
  const glvs = await hre.gmx.getGlvs();

  const dataStore = await hre.ethers.getContract("DataStore");
  const glvHandler = await hre.ethers.getContract("GlvHandler");
  const multicall = await hre.ethers.getContract("Multicall3");
  const config = await hre.ethers.getContract("Config");

  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  const configKeys = [];
  const multicallReadParams = [];
  const marketsToAdd = await processGlvs({
    glvs,
    onchainMarketsByTokens,
    tokens,
    handleConfig: async (type, baseKey, keyData) => {
      if (type !== "uint") {
        throw new Error("Unsupported type");
      }

      const key = getFullKey(baseKey, keyData);

      configKeys.push(key);
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [key]),
      });
    },
  });

  const result = await multicall.callStatic.aggregate3(multicallReadParams);
  const dataCache = {};
  for (let i = 0; i < configKeys.length; i++) {
    const key = configKeys[i];
    const value = result[i].returnData;
    dataCache[key] = bigNumberify(value);
  }

  const multicallWriteParams = [];

  await processGlvs({
    glvs,
    onchainMarketsByTokens,
    tokens,
    handleConfig: async (type, baseKey, keyData, value, label) => {
      if (type !== "uint") {
        throw new Error("Unsupported type");
      }

      await appendUintConfigIfDifferent(multicallWriteParams, dataCache, baseKey, keyData, value, label);
    },
  });

  console.info(`updating ${multicallWriteParams.length} params`);
  console.info("multicallWriteParams", multicallWriteParams);

  if (write) {
    for (const [glvAddress, marketAddress] of marketsToAdd) {
      console.log("adding market %s to glv %s", marketAddress, glvAddress);
      const tx = await glvHandler.addMarketToGlv(glvAddress, marketAddress);
      console.log("sent tx: %s", tx.hash);
    }

    await handleInBatches(multicallWriteParams, 100, async (batch) => {
      const tx = await config.multicall(batch);
      console.info(`update config tx sent: ${tx.hash}`);
    });
  } else {
    console.info("NOTE: executed in read-only mode, no transactions were sent");
  }
}
