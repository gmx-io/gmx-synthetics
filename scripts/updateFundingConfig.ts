import hre from "hardhat";
import { BigNumber } from "ethers";

import { ConfigChangeItem } from "./updateConfigUtils";
import { processMarkets } from "./updateMarketConfigUtils";
import { FUNDING_CONFIG_BASE_KEYS, getFullKey } from "../utils/config";
import { hashString } from "../utils/hash";
import * as keys from "../utils/keys";
import { bigNumberify } from "../utils/math";
import { getOnchainMarkets } from "../utils/market";
import { getSignedFundingOracleParams } from "./updateFundingConfigUtils";

type FundingConfigChange = ConfigChangeItem & {
  currentValue: BigNumber;
  nextValue: BigNumber;
};

// Usage:
// MARKET=0x... WRITE=false npx hardhat run scripts/updateFundingConfig.ts --network arbitrum
// MARKET=0x... WRITE=true npx hardhat run scripts/updateFundingConfig.ts --network arbitrum

function getSide(item: ConfigChangeItem): boolean {
  return hre.ethers.utils.defaultAbiCoder.decode(["address", "bool"], item.keyData)[1];
}

function orderFundingChanges(
  allItems: FundingConfigChange[],
  changedItems: FundingConfigChange[]
): FundingConfigChange[] {
  const orderedItems = changedItems.filter(
    (item) => item.baseKey !== keys.MIN_FUNDING_FACTOR_PER_SECOND && item.baseKey !== keys.MAX_FUNDING_FACTOR_PER_SECOND
  );

  for (const isLong of [true, false]) {
    const minItem = allItems.find(
      (item) => item.baseKey === keys.MIN_FUNDING_FACTOR_PER_SECOND && getSide(item) === isLong
    );
    const maxItem = allItems.find(
      (item) => item.baseKey === keys.MAX_FUNDING_FACTOR_PER_SECOND && getSide(item) === isLong
    );

    if (!minItem || !maxItem) {
      throw new Error(`Missing ${isLong ? "long" : "short"} funding factor bounds`);
    }

    if (minItem.nextValue.gt(maxItem.nextValue)) {
      throw new Error(`Invalid ${isLong ? "long" : "short"} funding factor bounds: min exceeds max`);
    }

    const changedMinItem = changedItems.includes(minItem) ? minItem : undefined;
    const changedMaxItem = changedItems.includes(maxItem) ? maxItem : undefined;

    if (minItem.nextValue.gt(maxItem.currentValue)) {
      if (changedMaxItem) orderedItems.push(changedMaxItem);
      if (changedMinItem) orderedItems.push(changedMinItem);
    } else if (maxItem.nextValue.lt(minItem.currentValue)) {
      if (changedMinItem) orderedItems.push(changedMinItem);
      if (changedMaxItem) orderedItems.push(changedMaxItem);
    } else {
      if (changedMaxItem) orderedItems.push(changedMaxItem);
      if (changedMinItem) orderedItems.push(changedMinItem);
    }
  }

  return orderedItems;
}

async function main() {
  if (!process.env.MARKET) {
    throw new Error("MARKET is required");
  }

  const marketAddress = hre.ethers.utils.getAddress(process.env.MARKET);
  const write = process.env.WRITE === "true";
  const { read } = hre.deployments;

  const [signer] = await hre.ethers.getSigners();
  const config = await hre.ethers.getContract("Config");
  const dataStore = await hre.ethers.getContract("DataStore");
  const reader = await hre.ethers.getContract("Reader");
  const roleStore = await hre.ethers.getContract("RoleStore");

  if (!(await roleStore.hasRole(signer.address, hashString("CONFIG_KEEPER")))) {
    throw new Error(`Signer ${signer.address} does not have the CONFIG_KEEPER role`);
  }

  const market = await reader.getMarket(dataStore.address, marketAddress);
  if (market.marketToken === hre.ethers.constants.AddressZero) {
    throw new Error(`Market not found: ${marketAddress}`);
  }

  const generalConfig = await hre.gmx.getGeneral();
  const tokens = await hre.gmx.getTokens();
  const markets = await hre.gmx.getMarkets();
  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  const [configItems] = await processMarkets({
    markets,
    includeMarket: marketAddress,
    onchainMarketsByTokens,
    supportedRiskOracleMarkets: new Set(),
    tokens,
    generalConfig,
    includeRiskOracleBaseKeys: true,
    includeKeeperBaseKeys: true,
    includeMaxOpenInterest: false,
    includePositionImpact: false,
    includeFunding: true,
  });

  const fundingItems = configItems.filter((item) => item.type === "uint" && FUNDING_CONFIG_BASE_KEYS.has(item.baseKey));
  if (fundingItems.length === 0) {
    throw new Error(`No funding configuration found for market ${marketAddress}`);
  }

  const allItems: FundingConfigChange[] = await Promise.all(
    fundingItems.map(async (item) => {
      const currentValue = await dataStore.getUint(getFullKey(item.baseKey, item.keyData));
      return {
        ...item,
        currentValue,
        nextValue: bigNumberify(item.value),
      };
    })
  );
  const changedItems = allItems.filter((item) => !item.currentValue.eq(item.nextValue));

  if (changedItems.length === 0) {
    console.log(`No funding configuration changes for market ${marketAddress}`);
    return;
  }

  const orderedItems = orderFundingChanges(allItems, changedItems);
  const oracleParams = await getSignedFundingOracleParams(market);
  const calls = orderedItems.map((item) =>
    config.interface.encodeFunctionData("setFundingUintWithOraclePrices", [
      item.baseKey,
      item.keyData,
      item.nextValue,
      oracleParams,
    ])
  );

  console.log(`Funding configuration changes for ${marketAddress}:`);
  orderedItems.forEach((item, index) => {
    console.log(`${index + 1}. ${item.label}: ${item.currentValue.toString()} -> ${item.nextValue.toString()}`);
  });

  await config.connect(signer).callStatic.multicall(calls);

  if (!write) {
    console.log("Simulation succeeded. Set WRITE=true to submit the transaction.");
    return;
  }

  const tx = await config.connect(signer).multicall(calls);
  console.log(`Transaction submitted: ${tx.hash}`);
  await tx.wait();
  console.log("Funding configuration updated.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
