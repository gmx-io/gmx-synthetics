// Reports market config params whose live on-chain value differs from config/markets.ts on the
// current branch. Excludes the keys actively managed by the risk oracle (it rewrites these
// continuously, so config is not their baseline). The `closedState` markets are
// compared against both their open and off-hours baselines, so a session flip is not a mismatch.
// The bot is not aware if it's an open or closed session, it compares the on-chain value against both
// baselines and accepts either (all values for that session type must match, partial match would trigger alert).
// Read-only — no signer, no writes.
//
//   npx hardhat run scripts/compareMarketConfig.ts --network arbitrum
//
// Prints one "Difference:" line per differing param and exits non-zero when any difference is found,
// so a monitor runner can parse the lines and detect the condition by exit code.

import { processMarkets, getRiskOracleManagedBaseKeys, getKeeperManagedBaseKeys } from "./updateMarketConfigUtils";
import { getOnchainMarkets } from "../utils/market";
import { getFullKey } from "../utils/config";
import { bigNumberify } from "../utils/math";
import { handleInBatches } from "../utils/batch";
import { MarketHours } from "../config/markets";

// Keys actively managed by the risk oracle: that system writes them on-chain, so
// config/markets.ts is not their source of truth and a difference vs config is expected, not a mismatch.
// compareMarketConfig drops them from the comparison. The base-key lists are defined in
// updateMarketConfigUtils.ts (shared with the write path) and reused here via the two getters;
// this block documents what they hold — keep it in sync with those arrays.
//
// Which networks exclude what (from the getters):
//   arbitrum           risk oracle
//   avalanche          risk oracle
//   botanix, megaEth   nothing — every key is compared there
//
// How often each excluded key actually moves — write counts over a 30-day window on arbitrum. These
// are a snapshot: the rate swings with risk-oracle activity, so treat the exact numbers as
// approximate. A diff vs config on a very frequent key is meaningless; the rest barely move and are
// excluded only because the risk oracle manages them.
//
//   getRiskOracleManagedBaseKeys() — split by how often the keys move:
//
//     very frequent (thousands/day):
//       POSITION_IMPACT_FACTOR (risk oracle)
//       POSITION_IMPACT_EXPONENT_FACTOR (risk oracle)
//       MAX_OPEN_INTEREST (risk oracle)
//       FUNDING_INCREASE_FACTOR_PER_SECOND (risk oracle)
//       MIN_FUNDING_INCREASE_RATE_PER_SECOND (risk oracle)
//       FUNDING_DECREASE_FACTOR_PER_SECOND (risk oracle)
//       MAX_FUNDING_FACTOR_PER_SECOND (risk oracle)
//
//     low (several per day):
//       BASE_BORROWING_FACTOR (~13/day)
//       MIN_COLLATERAL_FACTOR (~7/day)
//       MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION (~5/day)
//
//     few (a few writes per month):
//       MAX_POOL_USD_FOR_DEPOSIT (6 in 30d)
//       MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER (4 in 30d)
//       MAX_POOL_AMOUNT (2 in 30d)
//       OPTIMAL_USAGE_FACTOR (2 in 30d)
//       ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR (2 in 30d)
//       MAX_POSITION_IMPACT_FACTOR (2 in 30d)
//
//     single / none (at most one write per month):
//       FUNDING_FACTOR (1 in 30d)
//       FUNDING_EXPONENT_FACTOR (1 in 30d)
//       MIN_FUNDING_FACTOR_PER_SECOND (1 in 30d)
//       THRESHOLD_FOR_STABLE_FUNDING (1 in 30d)
//       THRESHOLD_FOR_DECREASE_FUNDING (0 in 30d)
//       GLV_MAX_MARKET_TOKEN_BALANCE_USD (1 in 30d; not a per-market key — never appears here)
//       GLV_MAX_MARKET_TOKEN_BALANCE_AMOUNT (1 in 30d; not a per-market key — never appears here)
//
//   getKeeperManagedBaseKeys() currently returns no keys because funding updates must use the
//   oracle-priced settlement path.
const excluded = new Set([...getRiskOracleManagedBaseKeys(), ...getKeeperManagedBaseKeys()]);

interface MarketConfigDifference {
  label: string;
  baseKey: string;
  type: string;
  expected: string;
  actual: string;
}

// Enumerate every per-market config item via processMarkets, drop the keys the risk oracle / keeper manages,
// read the live on-chain value for each remaining key, and return the ones that do not match.
async function compareMarketConfig(): Promise<MarketConfigDifference[]> {
  const { read } = hre.deployments;

  const generalConfig = await hre.gmx.getGeneral();
  const tokens = await hre.gmx.getTokens();

  const dataStore = await hre.ethers.getContract("DataStore");
  const multicall = await hre.ethers.getContract("Multicall3");

  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  // includeRiskOracleBaseKeys / includeKeeperBaseKeys are forced true so coverage is total and
  // deterministic; the risk-oracle / keeper-managed keys (see `excluded` at the top) are then dropped.
  // With that skip bypassed the supported-markets set is unused, so the risk-oracle API call is skipped.
  const enumerate = async (markets) => {
    const [configItems] = await processMarkets({
      markets,
      includeMarket: undefined,
      onchainMarketsByTokens,
      tokens,
      supportedRiskOracleMarkets: new Set(),
      generalConfig,
      includeRiskOracleBaseKeys: true,
      includeKeeperBaseKeys: true,
      includeMaxOpenInterest: true,
      includePositionImpact: true,
      includeFunding: true,
    });
    return configItems.filter((item) => !excluded.has(item.baseKey));
  };

  // Enumerate the open baseline (the items we read on-chain), plus the off-hours overlay applied to
  // the `closedState` markets. A market sitting in its closed session matches the closed values, not
  // the open ones, so accept either — the session keeper's flip is expected, not a mismatch. A value
  // that matches neither baseline is still flagged.
  const items = await enumerate(await hre.gmx.getMarkets());
  const closedItems = await enumerate(await hre.gmx.getMarkets(MarketHours.OffHours));

  // fullKey -> the set of config values the on-chain value may legitimately equal (open, plus closed
  // for the closedState markets). `expectedText` keeps the human-readable values for the alert.
  const norm = (type: string, v) => {
    if (type === "uint" || type === "int") return bigNumberify(v).toString();
    if (type === "address") return String(v).toLowerCase();
    return String(Boolean(v));
  };

  const acceptable = new Map<string, Set<string>>();
  const expectedText = new Map<string, string[]>();
  for (const item of [...items, ...closedItems]) {
    const fullKey = getFullKey(item.baseKey, item.keyData);
    if (!acceptable.has(fullKey)) {
      acceptable.set(fullKey, new Set());
      expectedText.set(fullKey, []);
    }
    const normalized = norm(item.type, item.value);
    if (!acceptable.get(fullKey).has(normalized)) {
      acceptable.get(fullKey).add(normalized);
      expectedText.get(fullKey).push(item.value.toString());
    }
  }

  const fnForType = (type: string) =>
    type === "uint" ? "getUint" : type === "int" ? "getInt" : type === "address" ? "getAddress" : "getBool";

  const multicallReadParams = items.map((item) => ({
    target: dataStore.address,
    allowFailure: false,
    callData: dataStore.interface.encodeFunctionData(fnForType(item.type), [getFullKey(item.baseKey, item.keyData)]),
  }));

  let result = [];
  await handleInBatches(multicallReadParams, 100, async (batch) => {
    const batchResult = await multicall.callStatic.aggregate3(batch);
    result = result.concat(batchResult);
  });

  const abiCoder = hre.ethers.utils.defaultAbiCoder;
  const differences: MarketConfigDifference[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const returnData = result[i].returnData;
    const fullKey = getFullKey(item.baseKey, item.keyData);

    let onchain;
    if (item.type === "uint") {
      onchain = bigNumberify(returnData);
    } else if (item.type === "int") {
      onchain = abiCoder.decode(["int256"], returnData)[0];
    } else if (item.type === "address") {
      onchain = abiCoder.decode(["address"], returnData)[0];
    } else {
      onchain = abiCoder.decode(["bool"], returnData)[0];
    }

    // Flag only if the live value matches neither the open nor the closed (off-hours) baseline.
    if (!acceptable.get(fullKey).has(norm(item.type, onchain))) {
      differences.push({
        label: item.label,
        baseKey: item.baseKey,
        type: item.type,
        expected: expectedText.get(fullKey).join(" or "),
        actual: onchain.toString(),
      });
    }
  }

  return differences;
}

async function main() {
  const differences = await compareMarketConfig();

  for (const d of differences) {
    console.log(`Difference: ${d.label} | expected ${d.expected} | actual ${d.actual}`);
  }

  console.log(`\n${differences.length} differing param(s) on ${hre.network.name}`);

  if (differences.length > 0) {
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
