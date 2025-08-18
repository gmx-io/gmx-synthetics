import hre, { network } from "hardhat";

import { validateMarketConfigs } from "./validateMarketConfigsUtils";
import { encodeData } from "../utils/hash";
import { ConfigChangeItem, handleConfigChanges } from "./updateConfigUtils";
import * as keys from "../utils/keys";
import { validateTokens } from "./validateTokenUtils";

const processTokens = async ({ tokens }): Promise<ConfigChangeItem[]> => {
  const configItems: ConfigChangeItem[] = [];

  for (const [, token] of Object.entries(tokens) as any) {
    if (token.dataStreamSpreadReductionFactor !== undefined) {
      configItems.push({
        type: "uint",
        baseKey: keys.DATA_STREAM_SPREAD_REDUCTION_FACTOR,
        keyData: encodeData(["address"], [token.address]),
        value: token.dataStreamSpreadReductionFactor,
        label: `dataStreamSpreadReductionFactor ${token.dataStreamSpreadReductionFactor}`,
      });
    }

    // the config below is for non-synthetic markets only
    if (token.synthetic) {
      continue;
    }

    configItems.push({
      type: "uint",
      baseKey: keys.TOKEN_TRANSFER_GAS_LIMIT,
      keyData: encodeData(["address"], [token.address]),
      value: token.transferGasLimit,
      label: `transferGasLimit ${token.transferGasLimit}`,
    });

    if (token.buybackMaxPriceImpactFactor !== undefined) {
      configItems.push({
        type: "uint",
        baseKey: keys.BUYBACK_MAX_PRICE_IMPACT_FACTOR,
        keyData: encodeData(["address"], [token.address]),
        value: token.buybackMaxPriceImpactFactor,
        label: `buybackMaxPriceImpactFactor ${token.buybackMaxPriceImpactFactor}`,
      });
    }
  }

  return configItems;
};

async function main() {
  if (!["arbitrumGoerli", "avalancheFuji"].includes(network.name)) {
    const { errors } = await validateMarketConfigs();
    if (errors.length !== 0) {
      throw new Error("Invalid market configs");
    }
  }

  await validateTokens();

  const tokens = await hre.gmx.getTokens();
  const configItems = await processTokens({ tokens });

  const write = process.env.WRITE === "true";
  await handleConfigChanges(configItems, write);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
