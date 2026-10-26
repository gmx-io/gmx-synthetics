import hre from "hardhat";
import { BigNumber, constants, Contract, utils } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { MarketConfig } from "../config/markets";
import { GlvConfig } from "../config/glvs";
import { TokensConfig } from "../config/tokens";
import type { DonationConfigValues } from "../config/types";
import { hashString } from "../utils/hash";
import { getMarketKey, getMarketTokenAddresses, getOnchainMarkets } from "../utils/market";
import { inputsOf, writeSafeBatchJson } from "../utils/safeTx";

type Handlers = { gm?: Contract; glv?: Contract };

function normalizeConfig(config: DonationConfigValues) {
  return {
    fundingAccount: utils.getAddress(config.fundingAccount),
    isEnabled: config.isEnabled,
    maxDonationFactor: BigNumber.from(config.maxDonationFactor).toString(),
    donationPeriodDuration: BigNumber.from(config.donationPeriodDuration).toString(),
    maxDonationAmountPerPeriod: BigNumber.from(config.maxDonationAmountPerPeriod).toString(),
  };
}

type DonationConfigTarget = {
  kind: "gm" | "glv";
  marketAddress: string;
  glvAddress?: string;
  tokens: MarketConfig["tokens"];
  config: ReturnType<typeof normalizeConfig>;
};

// Only explicitly configured markets are managed. Keep disabled entries in the
// plan so isEnabled: false is applied rather than silently leaving donations enabled.
export function getDonationConfigs(
  markets: MarketConfig[],
  glvs: GlvConfig,
  tokenConfigs: TokensConfig,
  onchainMarketsByTokens: Awaited<ReturnType<typeof getOnchainMarkets>>
): DonationConfigTarget[] {
  const gm: DonationConfigTarget[] = [];
  const glv: DonationConfigTarget[] = [];
  const seenMarkets = new Set<string>();
  const seenGlvPairs = new Set<string>();
  const resolveMarket = (market: MarketConfig) => {
    if (market.swapOnly || market.tokens.longToken !== "USDG" || market.tokens.shortToken !== "USDG") {
      throw new Error("Donation config requires a USDG/USDG perpetual market");
    }
    const { tokens } = market;
    // Resolve the deployed GM by its token tuple, exactly as the core market updater does.
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(market, tokenConfigs);
    const marketKey = getMarketKey(indexToken, longToken, shortToken);
    const onchainMarket = onchainMarketsByTokens[marketKey];
    // Do not silently export a partial donation plan when a configured market is missing.
    if (!onchainMarket) throw new Error(`Donation market not found on-chain: ${marketKey}`);
    const marketAddress = utils.getAddress(onchainMarket.marketToken);
    if (marketAddress === constants.AddressZero) {
      throw new Error("Donation market address must be nonzero");
    }
    return { marketAddress, tokens };
  };
  for (const market of markets) {
    if (!market.donation) continue;
    const resolved = resolveMarket(market);
    if (seenMarkets.has(resolved.marketAddress))
      throw new Error(`Duplicate donation market: ${resolved.marketAddress}`);
    seenMarkets.add(resolved.marketAddress);
    gm.push({ kind: "gm", ...resolved, config: normalizeConfig(market.donation) });
  }
  for (const glvConfig of glvs) {
    for (const market of glvConfig.markets) {
      if (!market.donation) continue;
      if (!glvConfig.address || utils.getAddress(glvConfig.address) === constants.AddressZero) {
        throw new Error("Donation GLV address must be nonzero");
      }
      const glvAddress = utils.getAddress(glvConfig.address);
      const resolved = resolveMarket({
        tokens: { indexToken: market.indexToken, longToken: glvConfig.longToken, shortToken: glvConfig.shortToken },
      });
      const pair = `${glvAddress}:${resolved.marketAddress}`;
      if (seenGlvPairs.has(pair)) throw new Error(`Duplicate GLV donation pair: ${pair}`);
      seenGlvPairs.add(pair);
      glv.push({ kind: "glv", ...resolved, glvAddress, config: normalizeConfig(market.donation) });
    }
  }
  if (!gm.length && !glv.length) {
    throw new Error("No donation configs found in config/markets.ts or config/glvs.ts");
  }
  return [...gm, ...glv];
}

// Read all configs on every run. An already-applied entry produces no transaction;
// a rerun after partial execution only includes the remaining differences.
export async function readDonationConfigPlan(targets: DonationConfigTarget[], handlers: Handlers) {
  return Promise.all(
    targets.map(async (target) => {
      const handler = handlers[target.kind];
      if (!handler) throw new Error(`Missing donation handler: ${target.kind}`);
      const current = normalizeConfig(
        target.kind === "gm"
          ? await handler.getMarketPoolDonationConfig(target.marketAddress)
          : await handler.getGlvDonationConfig(target.glvAddress, target.marketAddress)
      );
      const desired = normalizeConfig(target.config);
      const method = target.kind === "gm" ? "setMarketPoolDonationConfig" : "setGlvDonationConfig";
      const args = [
        ...(target.kind === "glv" ? [target.glvAddress] : []),
        target.marketAddress,
        desired.fundingAccount,
        desired.maxDonationFactor,
        desired.donationPeriodDuration,
        desired.maxDonationAmountPerPeriod,
        desired.isEnabled,
      ];
      return {
        target,
        handler,
        current,
        desired,
        method,
        args,
        changed: JSON.stringify(current) !== JSON.stringify(desired),
        // Reconfiguring the period resets accrued quota in both handlers. Require an
        // explicit opt-in for an existing nonzero period; initial setup is unaffected.
        resetsQuota:
          current.donationPeriodDuration !== "0" && current.donationPeriodDuration !== desired.donationPeriodDuration,
      };
    })
  );
}

export function validateDonationPeriodChanges(
  plan: Awaited<ReturnType<typeof readDonationConfigPlan>>,
  allowPeriodReset: boolean
) {
  for (const entry of plan.filter((entry) => entry.changed && entry.resetsQuota)) {
    console.warn(`Period change resets current donation quota: ${entry.target.kind} ${entry.target.marketAddress}`);
    if (!allowPeriodReset) {
      throw new Error("Changing a configured donation period resets quota; review and set ALLOW_PERIOD_RESET=true");
    }
  }
}

// Preview + Safe export (no sends or confirmation prompts):
// CONFIG_KEEPER=<existing authorized account> npx hardhat run --network arbitrum scripts/updateDonationConfig.ts
// Direct execution requires that account's signer in the Hardhat network configuration:
// CONFIG_KEEPER=<account> WRITE=true npx hardhat run --network arbitrum scripts/updateDonationConfig.ts
// After Safe execution, verify all configured entries with CHECK=true (no signer required).
// No role grants, token approvals, donations or core Config/DataStore setters are performed.
export async function updateDonationConfig(
  {
    write = false,
    check = false,
    configKeeper,
    allowPeriodReset = false,
  }: {
    write?: boolean;
    check?: boolean;
    configKeeper?: string;
    allowPeriodReset?: boolean;
  },
  runtime: HardhatRuntimeEnvironment = hre
) {
  if (write && check) throw new Error("WRITE and CHECK cannot both be enabled");
  if (runtime.network.name !== "arbitrum") {
    throw new Error(`Donation config is not configured for network ${runtime.network.name}`);
  }
  if (runtime.network.config.chainId !== 42161 || (await runtime.ethers.provider.getNetwork()).chainId !== 42161) {
    throw new Error("USDG donation config requires Arbitrum chain ID 42161");
  }
  const [roleStore, dataStore, eventEmitter, oracle, reader, tokens, markets, glvs] = await Promise.all([
    runtime.ethers.getContract("RoleStore"),
    runtime.ethers.getContract("DataStore"),
    runtime.ethers.getContract("EventEmitter"),
    runtime.ethers.getContract("Oracle"),
    runtime.ethers.getContract("Reader"),
    runtime.gmx.getTokens(),
    runtime.gmx.getMarkets(),
    runtime.gmx.getGlvs(),
  ]);
  const onchainMarketsByTokens = await getOnchainMarkets(runtime.deployments.read, dataStore.address);
  const targets = getDonationConfigs(markets, glvs, tokens, onchainMarketsByTokens);
  const needsGm = targets.some((target) => target.kind === "gm");
  const needsGlv = targets.some((target) => target.kind === "glv");
  const [gm, glv, glvReader] = await Promise.all([
    needsGm ? runtime.ethers.getContract("MarketPoolDonationHandler") : undefined,
    needsGlv ? runtime.ethers.getContract("GlvDonationHandler") : undefined,
    needsGlv ? runtime.ethers.getContract("GlvReader") : undefined,
  ]);
  const handlers = { gm, glv };
  if (gm && glv && utils.getAddress(gm.address) === utils.getAddress(glv.address)) {
    throw new Error("Donation handlers must have distinct addresses");
  }
  for (const handler of [gm, glv].filter(Boolean)) {
    if ((await runtime.ethers.provider.getCode(handler.address)) === "0x") {
      throw new Error(`Donation handler is not deployed: ${handler.address}`);
    }
    for (const [getter, expected] of Object.entries({
      roleStore: roleStore.address,
      dataStore: dataStore.address,
      eventEmitter: eventEmitter.address,
      oracle: oracle.address,
    })) {
      if (utils.getAddress(await handler[getter]()) !== utils.getAddress(expected)) {
        throw new Error(`Incorrect ${getter} on donation handler ${handler.address}`);
      }
    }
    if (!(await roleStore.hasRole(handler.address, hashString("CONTROLLER")))) {
      throw new Error(
        `Donation handler is missing CONTROLLER: ${handler.address}. Apply roles through the existing role scripts first.`
      );
    }
  }
  const usdg = await runtime.ethers.getContractAt("IERC20Metadata", tokens.USDG.address);
  if (Number(await usdg.decimals()) !== 6) throw new Error("Expected USDG to have 6 decimals");
  const glvAddresses = new Set(targets.filter((target) => target.kind === "glv").map((target) => target.glvAddress));
  for (const glvAddress of glvAddresses) {
    const glvProps = await glvReader.getGlv(dataStore.address, glvAddress);
    for (const token of [glvProps.longToken, glvProps.shortToken]) {
      if (utils.getAddress(token) !== utils.getAddress(usdg.address)) throw new Error("Unexpected GLV pool tokens");
    }
  }
  // GLV-only plans must validate their underlying GM markets too.
  for (const target of targets) {
    const props = await reader.getMarket(dataStore.address, target.marketAddress);
    if (
      utils.getAddress(props.marketToken) !== target.marketAddress ||
      utils.getAddress(props.indexToken) !== utils.getAddress(tokens[target.tokens.indexToken].address) ||
      utils.getAddress(props.longToken) !== utils.getAddress(usdg.address) ||
      utils.getAddress(props.shortToken) !== utils.getAddress(usdg.address)
    ) {
      throw new Error(`Unexpected market tokens for ${target.marketAddress}`);
    }
    const gmToken = await runtime.ethers.getContractAt("IERC20Metadata", target.marketAddress);
    if (Number(await gmToken.decimals()) !== 18)
      throw new Error(`Expected GM to have 18 decimals: ${target.marketAddress}`);
  }

  const plan = await readDonationConfigPlan(targets, handlers);
  for (const entry of plan) {
    console.log(
      JSON.stringify(
        {
          kind: entry.target.kind,
          market: entry.target.marketAddress,
          glv: entry.target.glvAddress,
          current: entry.current,
          desired: entry.desired,
          changed: entry.changed,
        },
        null,
        2
      )
    );
  }
  const changes = plan.filter((entry) => entry.changed);
  if (check) {
    if (changes.length)
      throw new Error(`${changes.length} donation configs differ from config/markets.ts / config/glvs.ts`);
    console.log(`All ${targets.length} donation configs match config/markets.ts / config/glvs.ts (on-chain readback).`);
    return;
  }
  if (!changes.length) {
    console.log("No donation config changes required.");
    return;
  }
  validateDonationPeriodChanges(plan, allowPeriodReset);
  if (!configKeeper || utils.getAddress(configKeeper) === constants.AddressZero) {
    throw new Error(
      "Set CONFIG_KEEPER to an existing authorized account to simulate and export or execute these changes"
    );
  }
  configKeeper = utils.getAddress(configKeeper);
  if (!(await roleStore.hasRole(configKeeper, hashString("CONFIG_KEEPER")))) {
    throw new Error(`Account is missing CONFIG_KEEPER: ${configKeeper}`);
  }
  // Validate every call before exporting or sending any of them. This also checks
  // enabled markets, virtual inventory and GLV market membership in the handlers.
  for (const entry of changes) {
    await entry.handler
      .connect(runtime.ethers.provider)
      .callStatic[entry.method](...entry.args, { from: configKeeper });
  }
  writeSafeBatchJson({
    scriptName: "updateDonationConfig",
    label: "",
    description: `Donation configuration only. Execute from CONFIG_KEEPER ${configKeeper}. Funding approvals are separate ops actions, exact tranche amounts only.`,
    transactions: changes.map((entry) => {
      const inputs = inputsOf(entry.handler, entry.method);
      return {
        to: entry.handler.address,
        value: "0",
        data: null,
        contractMethod: { name: entry.method, payable: false, inputs },
        contractInputsValues: Object.fromEntries(inputs.map((input, i) => [input.name, String(entry.args[i])])),
      };
    }),
  });
  if (!write) {
    console.log(
      "Preview only: no transactions sent. After executing the Safe batch, rerun with CHECK=true to verify all configured entries."
    );
    return;
  }
  const signer = await runtime.ethers.getSigner(configKeeper);
  for (const entry of changes) {
    const tx = await entry.handler.connect(signer)[entry.method](...entry.args);
    console.log(`Submitted ${entry.target.kind} config for ${entry.target.marketAddress}: ${tx.hash}`);
    await tx.wait();
  }
  const readback = await readDonationConfigPlan(targets, handlers);
  if (readback.some((entry) => entry.changed)) throw new Error("Donation config readback mismatch after execution");
  console.log(`All ${targets.length} donation configs verified after execution.`);
}

if (require.main === module) {
  updateDonationConfig({
    write: process.env.WRITE === "true",
    check: process.env.CHECK === "true",
    configKeeper: process.env.CONFIG_KEEPER,
    allowPeriodReset: process.env.ALLOW_PERIOD_RESET === "true",
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
