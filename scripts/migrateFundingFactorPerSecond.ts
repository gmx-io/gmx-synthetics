import hre from "hardhat";
import { BigNumber } from "ethers";

import { ConfigChangeItem } from "./updateConfigUtils";
import { getSignedFundingOracleParams } from "./updateFundingConfigUtils";
import { encodeData, hashData, hashString } from "../utils/hash";
import * as keys from "../utils/keys";

type MarketMigration = {
  market: any;
  configItems: ConfigChangeItem[];
};

// Usage:
// MARKET=0x... WRITE=false yarn hardhat run scripts/migrateFundingFactorPerSecond.ts --network <network>
// WRITE=true yarn hardhat run scripts/migrateFundingFactorPerSecond.ts --network <network>
// MARKET is optional; when omitted, all perp markets are processed.
async function main() {
  const write = process.env.WRITE === "true";
  const [signer] = await hre.ethers.getSigners();
  const config = await hre.ethers.getContract("Config");
  const dataStore = await hre.ethers.getContract("DataStore");
  const reader = await hre.ethers.getContract("Reader");
  const roleStore = await hre.ethers.getContract("RoleStore");
  const markets = await reader.getMarkets(dataStore.address, 0, 1000);
  const includeMarket = process.env.MARKET?.toLowerCase();

  if (!(await roleStore.hasRole(signer.address, hashString("CONFIG_KEEPER")))) {
    throw new Error(`Signer ${signer.address} does not have the CONFIG_KEEPER role`);
  }

  const migrations: MarketMigration[] = [];

  for (const market of markets) {
    if (market.indexToken === hre.ethers.constants.AddressZero) {
      continue;
    }

    if (includeMarket && market.marketToken.toLowerCase() !== includeMarket) {
      continue;
    }

    const legacyMinKey = hashData(["bytes32", "address"], [keys.MIN_FUNDING_FACTOR_PER_SECOND, market.marketToken]);
    const legacyMaxKey = hashData(["bytes32", "address"], [keys.MAX_FUNDING_FACTOR_PER_SECOND, market.marketToken]);

    const [legacyMin, legacyMax, minLong, minShort, maxLong, maxShort] = await Promise.all([
      dataStore.getUint(legacyMinKey),
      dataStore.getUint(legacyMaxKey),
      dataStore.getUint(keys.minFundingFactorPerSecondKey(market.marketToken, true)),
      dataStore.getUint(keys.minFundingFactorPerSecondKey(market.marketToken, false)),
      dataStore.getUint(keys.maxFundingFactorPerSecondKey(market.marketToken, true)),
      dataStore.getUint(keys.maxFundingFactorPerSecondKey(market.marketToken, false)),
    ]);

    const hasLegacy = !legacyMin.eq(0) || !legacyMax.eq(0);
    let sourceMin = legacyMin;
    let sourceMax = legacyMax;

    if (!hasLegacy) {
      if (!minLong.eq(minShort) || !maxLong.eq(maxShort)) {
        console.warn("skip %s: per-side funding factors differ and no legacy values are set", market.marketToken);
        continue;
      }
      sourceMin = minLong;
      sourceMax = maxLong;
    }

    if (sourceMax.lt(sourceMin)) {
      throw new Error(`invalid funding bounds for ${market.marketToken}: min > max`);
    }

    const configItems: ConfigChangeItem[] = [];

    const addSideUpdates = ({
      isLong,
      currentMin,
      currentMax,
    }: {
      isLong: boolean;
      currentMin: BigNumber;
      currentMax: BigNumber;
    }) => {
      const sideLabel = isLong ? "long" : "short";
      const minItem: ConfigChangeItem = {
        type: "uint",
        baseKey: keys.MIN_FUNDING_FACTOR_PER_SECOND,
        keyData: encodeData(["address", "bool"], [market.marketToken, isLong]),
        value: sourceMin,
        label: `migrate minFundingFactorPerSecond ${sideLabel} ${market.marketToken}`,
      };
      const maxItem: ConfigChangeItem = {
        type: "uint",
        baseKey: keys.MAX_FUNDING_FACTOR_PER_SECOND,
        keyData: encodeData(["address", "bool"], [market.marketToken, isLong]),
        value: sourceMax,
        label: `migrate maxFundingFactorPerSecond ${sideLabel} ${market.marketToken}`,
      };

      const orderedItems = sourceMin.gt(currentMax) ? [maxItem, minItem] : [minItem, maxItem];

      for (const item of orderedItems) {
        const currentValue = item === minItem ? currentMin : currentMax;
        if (!currentValue.eq(item.value)) {
          configItems.push(item);
        }
      }
    };

    addSideUpdates({ isLong: true, currentMin: minLong, currentMax: maxLong });
    addSideUpdates({ isLong: false, currentMin: minShort, currentMax: maxShort });

    if (configItems.length > 0) {
      migrations.push({ market, configItems });
    }
  }

  if (migrations.length === 0) {
    console.log("no markets to migrate");
    return;
  }

  for (const { market, configItems } of migrations) {
    const oracleParams = await getSignedFundingOracleParams(market);
    const calls = configItems.map((item) =>
      config.interface.encodeFunctionData("setFundingUintWithOraclePrices", [
        item.baseKey,
        item.keyData,
        item.value,
        oracleParams,
      ])
    );

    console.log(`Funding factor migration for ${market.marketToken}:`);
    configItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.label}: ${item.value.toString()}`);
    });

    await config.connect(signer).callStatic.multicall(calls);

    if (!write) {
      console.log(`Simulation succeeded for ${market.marketToken}.`);
      continue;
    }

    const tx = await config.connect(signer).multicall(calls);
    console.log(`Transaction submitted for ${market.marketToken}: ${tx.hash}`);
    await tx.wait();
  }

  if (!write) {
    console.log("All simulations succeeded. Set WRITE=true to submit the transactions.");
  } else {
    console.log("Funding factor migration completed.");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
