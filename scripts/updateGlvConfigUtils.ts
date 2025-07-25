import { encodeData } from "../utils/hash";
import { getMarketKey, getOnchainMarkets } from "../utils/market";
import { ChangeResult, ConfigChangeItem, handleConfigChanges } from "./updateConfigUtils";
import * as keys from "../utils/keys";
import prompts from "prompts";

const processGlvs = async ({
  glvs,
  onchainMarketsByTokens,
  tokens,
  dataStore,
}): Promise<[ConfigChangeItem[], [string, string][]]> => {
  const configItems: ConfigChangeItem[] = [];
  const marketsToAdd: [string, string][] = [];

  for (const glvConfig of glvs) {
    const longToken = tokens[glvConfig.longToken];
    const shortToken = tokens[glvConfig.shortToken];
    const glvSymbol = glvConfig.symbol ?? `GLV [${glvConfig.longToken}-${glvConfig.shortToken}]`;

    const glvAddress = glvConfig.address;

    if (!glvAddress) {
      throw new Error(`No address for GLV ${glvConfig.longToken}-${glvConfig.shortToken} in the config`);
    }

    configItems.push({
      type: "uint",
      baseKey: keys.GLV_SHIFT_MIN_INTERVAL,
      keyData: encodeData(["address"], [glvAddress]),
      value: glvConfig.shiftMinInterval,
      label: `shiftMinInterval ${glvSymbol}`,
    });

    configItems.push({
      type: "uint",
      baseKey: keys.GLV_SHIFT_MAX_PRICE_IMPACT_FACTOR,
      keyData: encodeData(["address"], [glvAddress]),
      value: glvConfig.shiftMaxPriceImpactFactor,
      label: `shiftMaxPriceImpactFactor ${glvSymbol}`,
    });

    configItems.push({
      type: "uint",
      baseKey: keys.MIN_GLV_TOKENS_FOR_FIRST_DEPOSIT,
      keyData: encodeData(["address"], [glvAddress]),
      value: glvConfig.minTokensForFirstGlvDeposit,
      label: `minTokensForFirstGlvDeposit ${glvSymbol}`,
    });

    configItems.push({
      type: "uint",
      baseKey: keys.TOKEN_TRANSFER_GAS_LIMIT,
      keyData: encodeData(["address"], [glvConfig.address]),
      value: glvConfig.transferGasLimit || 200_000,
      label: `transferGasLimit ${glvConfig.transferGasLimit}`,
    });

    const glvSupportedMarketList = await dataStore.getAddressValuesAt(
      keys.glvSupportedMarketListKey(glvAddress),
      0,
      100
    );

    for (const glvMarketConfig of glvConfig.markets) {
      const indexToken = tokens[glvMarketConfig.indexToken];
      const marketKey = getMarketKey(indexToken.address, longToken.address, shortToken.address);
      const onchainMarket = onchainMarketsByTokens[marketKey];
      const marketAddress = onchainMarket.marketToken;

      if (!glvSupportedMarketList.includes(marketAddress)) {
        if (glvMarketConfig.isMarketDisabled) {
          console.log(
            `WARN: market ${indexToken.symbol}/USD [${longToken.symbol}-${shortToken.symbol}] is disabled in config, skipping`
          );
        } else {
          console.log(`marketsToAdd: ${indexToken.symbol}/USD [${longToken.symbol}-${shortToken.symbol}]`);
          marketsToAdd.push([glvAddress, marketAddress]);
        }
      }

      if (glvMarketConfig.isMarketDisabled !== undefined) {
        configItems.push({
          type: "bool",
          baseKey: keys.IS_GLV_MARKET_DISABLED,
          keyData: encodeData(["address", "address"], [glvAddress, marketAddress]),
          value: glvMarketConfig.isMarketDisabled,
          label: `isMarketDisabled market ${indexToken.symbol}/USD in ${glvSymbol}`,
        });
      }

      configItems.push({
        type: "uint",
        baseKey: keys.GLV_MAX_MARKET_TOKEN_BALANCE_AMOUNT,
        keyData: encodeData(["address", "address"], [glvAddress, marketAddress]),
        value: glvMarketConfig.glvMaxMarketTokenBalanceAmount,
        label: `glvMaxMarketTokenBalanceAmount market ${indexToken.symbol}/USD in ${glvSymbol}`,
      });

      configItems.push({
        type: "uint",
        baseKey: keys.GLV_MAX_MARKET_TOKEN_BALANCE_USD,
        keyData: encodeData(["address", "address"], [glvAddress, marketAddress]),
        value: glvMarketConfig.glvMaxMarketTokenBalanceUsd,
        label: `glvMaxMarketTokenBalanceUsd market ${indexToken.symbol}/USD in ${glvSymbol}`,
      });
    }
  }

  return [configItems, marketsToAdd];
};

export async function updateGlvConfig({ write }) {
  console.log("running update glv config...");
  const { read } = hre.deployments;

  const [tokens, glvs, dataStore, glvShiftHandler] = await Promise.all([
    hre.gmx.getTokens(),
    hre.gmx.getGlvs(),
    hre.ethers.getContract("DataStore"),
    hre.ethers.getContract("GlvShiftHandler"),
    hre.ethers.getContract("Multicall3"),
    hre.ethers.getContract("Config"),
  ]);

  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  const [configItems, marketsToAdd] = await processGlvs({
    glvs,
    onchainMarketsByTokens,
    tokens,
    dataStore,
  });

  console.log("running simulation");
  for (const [glvAddress, marketAddress] of marketsToAdd) {
    console.log("simulating adding market %s to glv %s", marketAddress, glvAddress);
    await glvShiftHandler.callStatic.addMarketToGlv(glvAddress, marketAddress);
  }

  const changeResult = await handleConfigChanges(configItems, write, 100);

  if (marketsToAdd.length == 0) {
    console.log("no markets to add");
    return;
  }

  if (changeResult == ChangeResult.NO_CHANGES) {
    if (!write) {
      ({ write } = await prompts({
        type: "confirm",
        name: "write",
        message: "Do you want to execute the transactions (add markets)?",
      }));
    }
    if (!write) {
      console.info("NOTE: executed in read-only mode, no transactions were sent");
      return;
    }
  }

  if (changeResult == ChangeResult.SIMULATE) {
    return;
  }

  for (const [glvAddress, marketAddress] of marketsToAdd) {
    console.log("adding market %s to glv %s", marketAddress, glvAddress);
    const tx = await glvShiftHandler.addMarketToGlv(glvAddress, marketAddress);
    console.log("sent tx: %s", tx.hash);
  }
}
