import hre from "hardhat";

import { ConfigChangeItem, handleConfigChanges } from "./updateConfigUtils";
import { encodeData, hashData } from "../utils/hash";
import * as keys from "../utils/keys";

// Usage:
// MARKET=0x... WRITE=false yarn hardhat run scripts/migrateFundingFactorPerSecond.ts --network <network>
// WRITE=true yarn hardhat run scripts/migrateFundingFactorPerSecond.ts --network <network>
// MARKET is optional; when omitted, all perp markets are processed.
async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const reader = await hre.ethers.getContract("Reader");
  const markets = await reader.getMarkets(dataStore.address, 0, 1000);
  const includeMarket = process.env.MARKET?.toLowerCase();

  const configItems: ConfigChangeItem[] = [];

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

    const addSideUpdates = ({
      isLong,
      currentMin,
      currentMax,
    }: {
      isLong: boolean;
      currentMin: any;
      currentMax: any;
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

      if (sourceMin.gt(currentMax)) {
        // raise max first so min is not greater than the current max
        configItems.push(maxItem, minItem);
        return;
      }

      if (sourceMax.lt(currentMin)) {
        // lower min first so max is not less than the current min
        configItems.push(minItem, maxItem);
        return;
      }

      configItems.push(maxItem, minItem);
    };

    addSideUpdates({ isLong: true, currentMin: minLong, currentMax: maxLong });
    addSideUpdates({ isLong: false, currentMin: minShort, currentMax: maxShort });
  }

  if (configItems.length === 0) {
    console.log("no markets to migrate");
    return;
  }

  await handleConfigChanges(configItems, process.env.WRITE === "true");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
