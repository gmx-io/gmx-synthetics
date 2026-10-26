/**
 * OPS-28 consistency check
 *
 * This script checks if the GLV no-kink borrow config in config/markets.ts is consistent with the keeper GLV/JIT tier mapping.
 */
import hre from "hardhat";
import { BigNumber, BigNumberish } from "ethers";
import fs from "fs";
import path from "path";

import { percentageToFloat } from "../utils/math";
import { SECONDS_PER_YEAR } from "../utils/constants";

const KEEPER =
  process.env.GLV_KEEPER_GLVS || path.join(__dirname, "..", "..", "gmx-synthetics-keeper", "src", "config", "glvs.ts");

const TIER_APR: Record<string, string> = {
  largeCap: "45%",
  mediumCap: "50%",
  smallCap: "55%",
  longTail: "65%",
};

// keeper display symbol -> synthetics config index token symbol
const SYMBOL_ALIAS: Record<string, string> = {
  kPEPE: "PEPE",
  kSHIB: "SHIB",
  kBONK: "BONK",
  kFLOKI: "FLOKI",
  mSATS: "SATS",
  XAUT: "XAUT.v2", // keeper labels it "XAUT"; the GLV member / on-chain market is XAUT.v2 (verified by address)
};
const normSym = (s: string) => SYMBOL_ALIAS[s] ?? s;
const poolTokens = (p: string): [string, string] =>
  p === "WETH-USDC" ? ["WETH", "USDC"] : p === "BTC-USDC" ? ["WBTC.e", "USDC"] : [p, "?"];

type KeeperMarket = { addr: string; tier: string; sym: string; pool: string; delist: boolean; commented: boolean };

function parseKeeper(): KeeperMarket[] {
  if (!fs.existsSync(KEEPER)) {
    throw new Error(`keeper glvs.ts not found at ${KEEPER}. Set GLV_KEEPER_GLVS=/abs/path/to/glvs.ts`);
  }
  const lines = fs.readFileSync(KEEPER, "utf8").split("\n");
  const out: KeeperMarket[] = [];
  const parseGroups = (startRe: RegExp) => {
    let i = lines.findIndex((l) => startRe.test(l));
    if (i === -1) throw new Error(`could not find ${startRe} in ${KEEPER}`);
    let tier: string | null = null;
    let started = false;
    for (; i < lines.length; i++) {
      const l = lines[i];
      if (!started && /\{/.test(l)) started = true;
      const tm = l.match(/^\s*(blueChip|largeCap|mediumCap|smallCap|longTail):\s*\[/);
      if (tm) {
        tier = tm[1];
        continue;
      }
      const am = l.match(/^\s*(\/\/\s*)?"(0x[0-9a-fA-F]{40})",?\s*\/\/\s*(.+?)\s*$/);
      if (am && tier) {
        const cmt = am[3];
        const cm = cmt.match(/^([A-Za-z0-9]+)\/USD\s*\[([^\]]+)\]/);
        out.push({
          addr: am[2],
          tier,
          sym: cm ? cm[1] : cmt,
          pool: cm ? cm[2] : "?",
          delist: /\(Delist\)/i.test(cmt),
          commented: !!am[1],
        });
      }
      if (/^\s*\};\s*$/.test(l) && started) break;
    }
  };
  parseGroups(/const ethMarkets: MarketGroups = \{/);
  parseGroups(/const btcMarkets: MarketGroups = \{/);
  return out;
}

const OPTIMAL_NO_KINK = percentageToFloat("100%");
const expectedFactor = (tier: string) => percentageToFloat(TIER_APR[tier]).div(SECONDS_PER_YEAR);
const eq = (actual: BigNumberish | undefined, expected: BigNumber) =>
  actual !== undefined && BigNumber.from(actual).eq(expected);

function borrowMismatches(m: any, tier: string): string[] {
  const f = expectedFactor(tier);
  const checks: [string, BigNumberish | undefined, BigNumber][] = [
    ["optimalUsageFactorForLongs", m.optimalUsageFactorForLongs, OPTIMAL_NO_KINK],
    ["optimalUsageFactorForShorts", m.optimalUsageFactorForShorts, OPTIMAL_NO_KINK],
    ["baseBorrowingFactorForLongs", m.baseBorrowingFactorForLongs, f],
    ["baseBorrowingFactorForShorts", m.baseBorrowingFactorForShorts, f],
    ["aboveOptimalUsageBorrowingFactorForLongs", m.aboveOptimalUsageBorrowingFactorForLongs, f],
    ["aboveOptimalUsageBorrowingFactorForShorts", m.aboveOptimalUsageBorrowingFactorForShorts, f],
  ];
  return checks.filter(([, actual, expected]) => !eq(actual, expected)).map(([name]) => name);
}

async function main() {
  if (hre.network.name !== "arbitrum") {
    throw new Error(`run with --network arbitrum (GLV tiers are Arbitrum-only), got "${hre.network.name}"`);
  }

  const keeper = parseKeeper();
  const markets = await hre.gmx.getMarkets();
  const byKey = new Map<string, any>();
  for (const m of markets) {
    if (!m.tokens?.indexToken) continue;
    byKey.set(`${m.tokens.indexToken}|${m.tokens.longToken}|${m.tokens.shortToken}`, m);
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const ok: string[] = [];
  const skipDelisted = !!process.env.SKIP_DELISTED;
  const assignedKeys = new Set<string>();

  for (const km of keeper) {
    if (km.tier === "blueChip" || km.commented) continue;
    if (km.delist && skipDelisted) continue;
    const [lon, sho] = poolTokens(km.pool);
    const key = `${normSym(km.sym)}|${lon}|${sho}`;
    assignedKeys.add(key);
    const m = byKey.get(key);
    if (!m) {
      errors.push(`MISSING config market for keeper ${km.sym} (${km.tier}) ${km.addr} -> ${key}`);
      continue;
    }
    const mm = borrowMismatches(m, km.tier);
    if (mm.length) {
      errors.push(`WRONG ${km.sym} [${lon}-${sho}] (${km.tier} ${TIER_APR[km.tier]}): ${mm.join(", ")}`);
    } else {
      ok.push(`${km.sym} ${km.tier}`);
    }
  }

  for (const m of markets) {
    if (!m.tokens?.indexToken) continue;
    const { indexToken, longToken, shortToken } = m.tokens;
    const inPool = (longToken === "WETH" && shortToken === "USDC") || (longToken === "WBTC.e" && shortToken === "USDC");
    if (!inPool) continue;
    const key = `${indexToken}|${longToken}|${shortToken}`;
    if (assignedKeys.has(key)) continue;
    if (indexToken === "WETH" || indexToken === "BTC") {
      if (eq(m.optimalUsageFactorForLongs, OPTIMAL_NO_KINK) || eq(m.optimalUsageFactorForShorts, OPTIMAL_NO_KINK)) {
        errors.push(`BLUE-CHIP ${indexToken} must NOT use a no-kink borrow config`);
      }
      continue;
    }
    warnings.push(
      `UNMAPPED GLV-pool market ${indexToken} [${longToken}-${shortToken}] — confirm it is intentionally NOT a GLV member (else keeper tier map is stale)`
    );
  }

  console.log(`OK: ${ok.length} markets match their tier's no-kink borrow config (long + short)`);
  if (warnings.length) {
    console.log(`\nWARNINGS (${warnings.length}):`);
    warnings.forEach((w) => console.log("  - " + w));
  }
  if (errors.length) {
    console.log(`\nERRORS (${errors.length}):`);
    errors.forEach((e) => console.log("  - " + e));
    console.log("\nDRIFT DETECTED");
    process.exit(1);
  }
  console.log("\nCONSISTENT");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
