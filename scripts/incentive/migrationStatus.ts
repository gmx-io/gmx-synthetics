import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

import { REWARD_ROUTER_V2, getProvider, getRouterAddresses, getReferralVester, assertArbitrum } from "./lib";
import {
  ROLE_HASH,
  INCENTIVE_FEATURE_BASES,
  getDeployment,
  readOutFile,
  gate,
  printStep,
  multiRead,
  Gate,
} from "./migrationLib";

// Verification gates for the migration steps as executable checks: prints READY /
// PENDING / BLOCKED per step against live chain state and the artifacts in out/.
// Read-only; run before and after every migration step.
// env: INCENTIVE_RPC, NETWORK_NAME (default arbitrum)

const AddressZero = ethers.constants.AddressZero;

async function main() {
  const provider = getProvider();
  await assertArbitrum(provider);
  const networkName = process.env.NETWORK_NAME || "arbitrum";
  const legacy = await getRouterAddresses(provider, REWARD_ROUTER_V2.arbitrum);
  const referralVester = await getReferralVester(provider, legacy.esGmx);
  const [govTokenRoleStore] = await multiRead(provider, [[legacy.govToken, "roleStore() view returns (address)", []]]);

  // the router's legacy grants, all in the switch batch of step 5
  const routerGrantChecks: [string, string, "isHandler" | "isMinter"][] = [
    ["esGMX handler", legacy.esGmx, "isHandler"],
    ["stakedGmxTracker handler", legacy.stakedGmxTracker, "isHandler"],
    ["bonusGmxTracker handler", legacy.bonusGmxTracker, "isHandler"],
    ["extendedGmxTracker handler", legacy.extendedGmxTracker, "isHandler"],
    ["feeGmxTracker handler", legacy.feeGmxTracker, "isHandler"],
    ["stakedGlpTracker handler", legacy.stakedGlpTracker, "isHandler"],
    ["feeGlpTracker handler", legacy.feeGlpTracker, "isHandler"],
    ["bnGMX minter", legacy.bnGmx, "isMinter"],
  ];
  const signalUnstakePauseKey = (router: string) =>
    ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "address"],
        [
          ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["SIGNAL_UNSTAKE_FEATURE_DISABLED"])),
          router,
        ]
      )
    );

  const deployed = Object.fromEntries(
    [
      "RewardRouterUtils",
      "IncentiveEventUtils",
      "EsGmxIssuer",
      "SeasonRatioVester",
      "OrphanRatioVester",
      "GmxVesterCapZeroer",
      "GlpVesterCapZeroer",
      "ReferralVesterCapZeroer",
      "RewardRouterV3",
      "RatioVesterReader",
      "RoleStore",
      "DataStore",
      "Config",
      "TimelockConfig",
      "ConfigTimelockController",
    ].map((name) => [name, getDeployment(networkName, name)?.address])
  );

  const sweeps = readOutFile<any>("sweep-accounts.json");
  const inventory = readOutFile<any>("legacy-writer-inventory.json");
  const callers = readOutFile<any>("v2-caller-inventory.json");
  const snapshot = readOutFile<any>("orphan-snapshot.json");
  const capAccounts = readOutFile<any>("legacy-cap-accounts.json");
  const candidatesJson = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require("./legacy-writer-candidates.json");
    } catch {
      return {};
    }
  })();
  const candidates = (candidatesJson.candidates || []) as { name: string; address: string }[];
  const filledCandidates = candidates.filter((c) => ethers.utils.isAddress(c.address));
  const referralTimelockHandlers = ((candidatesJson.referralTimelockHandlers || []) as string[]).filter((a) =>
    ethers.utils.isAddress(a)
  );

  const summary: { step: string; ready: boolean }[] = [];
  const record = (step: string, gates: Gate[]) => summary.push({ step, ready: printStep(step, gates) });

  // ---- step 1: preconditions ----
  {
    const gates: Gate[] = [];

    if (!sweeps) {
      gates.push(gate("sweep enumeration artifact", undefined, "run enumerateSweepAccounts"));
    } else {
      const fullScan = sweeps.scan?.fromBlock === 0;
      gates.push(
        gate(
          "sweep enumeration covers full history",
          fullScan ? true : undefined,
          fullScan
            ? `generated ${sweeps.generatedAt}`
            : `partial scan from block ${sweeps.scan?.fromBlock}; re-run with FROM_BLOCK=0`
        )
      );
      const entries: [string, string, unknown[]][] = [];
      for (const e of sweeps.bonusInFee.accounts) {
        entries.push([
          legacy.feeGmxTracker,
          "depositBalances(address,address) view returns (uint256)",
          [e.account, legacy.bonusGmxTracker],
        ]);
      }
      for (const e of sweeps.bnInFee.accounts) {
        entries.push([
          legacy.feeGmxTracker,
          "depositBalances(address,address) view returns (uint256)",
          [e.account, legacy.bnGmx],
        ]);
      }
      for (const e of sweeps.bnInExtended.accounts) {
        entries.push([
          legacy.extendedGmxTracker,
          "depositBalances(address,address) view returns (uint256)",
          [e.account, legacy.bnGmx],
        ]);
      }
      const live = entries.length ? await multiRead(provider, entries) : [];
      // a failed read counts as remaining, never as converged
      const remaining = live.filter((v) => !v || !v.isZero()).length;
      gates.push(
        gate("listed sweep accounts converged", remaining === 0, `${remaining} of ${entries.length} listed still open`)
      );
    }

    // custody totals are independent of the enumeration; tolerance covers the 2024 residual
    const residualTolerance = ethers.BigNumber.from(process.env.SWEEP_RESIDUAL_TOLERANCE || "2000000000000000000");
    const [bonusInFeeCustody, bnInFeeCustody, bnInExtendedSupply] = await multiRead(provider, [
      [legacy.bonusGmxTracker, "balanceOf(address) view returns (uint256)", [legacy.feeGmxTracker]],
      [legacy.bnGmx, "balanceOf(address) view returns (uint256)", [legacy.feeGmxTracker]],
      [legacy.extendedGmxTracker, "totalDepositSupply(address) view returns (uint256)", [legacy.bnGmx]],
    ]);
    gates.push(
      gate(
        "sweep populations empty (custody totals within residual tolerance)",
        bonusInFeeCustody && bnInFeeCustody && bnInExtendedSupply
          ? bonusInFeeCustody.lte(residualTolerance) &&
              bnInFeeCustody.lte(residualTolerance) &&
              bnInExtendedSupply.isZero()
          : undefined,
        `bonus-in-fee ${bonusInFeeCustody ?? "?"}, bn-in-fee ${bnInFeeCustody ?? "?"}, staked bnGmx ${
          bnInExtendedSupply ?? "?"
        }`
      )
    );

    const trackerList = [
      legacy.stakedGmxTracker,
      legacy.bonusGmxTracker,
      legacy.extendedGmxTracker,
      legacy.feeGmxTracker,
      legacy.stakedGlpTracker,
      legacy.feeGlpTracker,
    ];
    const distributors = await multiRead(
      provider,
      trackerList.map((tracker) => [tracker, "distributor() view returns (address)", []] as [string, string, unknown[]])
    );
    const emissionChecks = await multiRead(
      provider,
      distributors.flatMap((d) => [
        [d, "rewardToken() view returns (address)", []],
        [d, "tokensPerInterval() view returns (uint256)", []],
        [legacy.esGmx, "balanceOf(address) view returns (uint256)", [d]],
      ]) as [string, string, unknown[]][]
    );
    // only the esGMX-emitting distributors must stop; the fee distributors keep their cadence
    let emissionOk = true;
    let drainedOk = true;
    let undrained = "";
    for (let i = 0; i < distributors.length; i++) {
      const emitsEsGmx = emissionChecks[i * 3] === undefined || emissionChecks[i * 3] === legacy.esGmx;
      if (emitsEsGmx && !emissionChecks[i * 3 + 1]?.isZero()) {
        emissionOk = false;
      }
      if (!emissionChecks[i * 3 + 2]?.isZero()) {
        drainedOk = false;
        undrained += ` ${distributors[i]}:${emissionChecks[i * 3 + 2]}`;
      }
    }
    gates.push(gate("legacy esGMX emission zero", emissionOk));
    gates.push(gate("legacy distributors drained", drainedOk, undrained.trim()));

    gates.push(
      gate(
        "cap-writer candidates filled from records",
        candidates.length > 0 && filledCandidates.length === candidates.length,
        candidates
          .filter((c) => !ethers.utils.isAddress(c.address))
          .map((c) => c.name)
          .join(", ") || "all filled"
      )
    );
    gates.push(
      gate(
        "writer inventory artifact",
        inventory ? true : undefined,
        inventory ? inventory.generatedAt : "run legacyWriterInventory"
      )
    );
    gates.push(
      gate(
        "V2 caller inventory artifact (comms input)",
        callers ? true : undefined,
        callers ? `${callers.integrations.length} integrations` : "run v2CallerInventory"
      )
    );

    if (deployed.Config) {
      const keyChecks = await multiRead(
        provider,
        INCENTIVE_FEATURE_BASES.map((base) => [
          deployed.Config as string,
          "allowedBaseKeys(bytes32) view returns (bool)",
          [ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], [base]))],
        ]) as [string, string, unknown[]][]
      );
      gates.push(
        gate(
          "deployed Config allows the incentive feature keys and the signal pause",
          keyChecks.every((v) => v === true),
          keyChecks.map((v, i) => `${INCENTIVE_FEATURE_BASES[i].split("_").slice(1, 3).join("_")}:${v}`).join(" ")
        )
      );
      if (deployed.RoleStore) {
        const [configIsController] = await multiRead(provider, [
          [
            deployed.RoleStore,
            "hasRole(address,bytes32) view returns (bool)",
            [deployed.Config, ROLE_HASH("CONTROLLER")],
          ],
        ]);
        gates.push(
          gate(
            "deployed Config holds CONTROLLER (flags operable)",
            configIsController === undefined ? undefined : configIsController === true,
            `${configIsController ?? "?"}`
          )
        );
      }
    } else {
      gates.push(
        gate(
          "deployed Config allows the incentive feature keys and the signal pause",
          undefined,
          "no Config deployment found"
        )
      );
    }

    record("step 1: preconditions (sweeps, inventory, Config keys)", gates);
  }

  // ---- step 2: deploy and bind ----
  {
    const gates: Gate[] = [];
    const notIncentive = ["Config", "RoleStore", "DataStore", "TimelockConfig", "ConfigTimelockController"];
    const missing = Object.entries(deployed)
      .filter(([name, address]) => !address && !notIncentive.includes(name))
      .map(([name]) => name);
    gates.push(gate("all incentive contracts deployed", missing.length === 0, missing.join(", ") || "all present"));

    if (deployed.EsGmxIssuer && deployed.SeasonRatioVester && deployed.OrphanRatioVester && deployed.RewardRouterV3) {
      const [issuerVester, bindingConfirmed, orphanIssuer, routerIssuer, allowlistLength, routerGmx] = await multiRead(
        provider,
        [
          [deployed.EsGmxIssuer, "vester() view returns (address)", []],
          [deployed.SeasonRatioVester, "isIssuerBindingConfirmed() view returns (bool)", []],
          [deployed.OrphanRatioVester, "issuer() view returns (address)", []],
          [deployed.RewardRouterV3, "esGmxIssuer() view returns (address)", []],
          [deployed.RewardRouterV3, "designatedVestersLength() view returns (uint256)", []],
          [deployed.RewardRouterV3, "gmx() view returns (address)", []],
        ]
      );
      gates.push(
        gate(
          "issuer bound to season vester",
          issuerVester === deployed.SeasonRatioVester,
          `issuer.vester = ${issuerVester}`
        )
      );
      gates.push(gate("season vester binding confirmed", bindingConfirmed === true));
      gates.push(gate("orphan has no issuer", orphanIssuer === AddressZero));
      gates.push(gate("router issuer slot wired", routerIssuer === deployed.EsGmxIssuer));
      gates.push(gate("router token wiring matches live V2", routerGmx === legacy.gmx, `gmx = ${routerGmx}`));
      gates.push(
        gate("allowlist state", true, `designatedVestersLength = ${allowlistLength} (0 until step 8, then 1)`)
      );
    } else {
      gates.push(gate("binding checks", undefined, "waiting on deployments"));
    }
    record("step 2: deployment and binding", gates);
  }

  // ---- step 3: roles, legacy grants, router config mirror ----
  {
    const gates: Gate[] = [];

    // mainnet grants come only from the release role round, which grants a role to a
    // deployed contract only when config/roles.ts lists its name under that role
    {
      const rolesFile = path.join(__dirname, "../../config/roles.ts");
      const rolesSource = fs.existsSync(rolesFile) ? fs.readFileSync(rolesFile, "utf8") : "";
      const listedUnder = (role: string) => {
        const match = rolesSource.match(new RegExp(`(?:^|\\s)${role}:\\s*\\[([^\\]]*)\\]`));
        return match ? match[1] : "";
      };
      const controllerList = listedUnder("CONTROLLER");
      const missingFromConfig = [
        "RewardRouterV3",
        "EsGmxIssuer",
        "SeasonRatioVester",
        "OrphanRatioVester",
        "GmxVesterCapZeroer",
        "GlpVesterCapZeroer",
        "ReferralVesterCapZeroer",
      ].filter((name) => !controllerList.includes(`"${name}"`));
      const govTokenListed = listedUnder("GOV_TOKEN_CONTROLLER").includes('"RewardRouterV3"');
      gates.push(
        gate(
          "config/roles.ts lists the seven contracts for the role round",
          rolesSource ? missingFromConfig.length === 0 && govTokenListed : undefined,
          rolesSource
            ? [...missingFromConfig, ...(govTokenListed ? [] : ["RewardRouterV3 (GOV_TOKEN_CONTROLLER)"])].join(", ") ||
                "all listed"
            : "config/roles.ts not found"
        )
      );
    }

    if (deployed.RoleStore) {
      const controllerTargets = [
        ["RewardRouterV3", deployed.RewardRouterV3],
        ["EsGmxIssuer", deployed.EsGmxIssuer],
        ["SeasonRatioVester", deployed.SeasonRatioVester],
        ["OrphanRatioVester", deployed.OrphanRatioVester],
        ["GmxVesterCapZeroer", deployed.GmxVesterCapZeroer],
        ["GlpVesterCapZeroer", deployed.GlpVesterCapZeroer],
        ["ReferralVesterCapZeroer", deployed.ReferralVesterCapZeroer],
      ].filter(([, address]) => address) as [string, string][];
      const roleChecks = await multiRead(
        provider,
        controllerTargets
          .map(
            ([, address]) =>
              [
                deployed.RoleStore as string,
                "hasRole(address,bytes32) view returns (bool)",
                [address, ROLE_HASH("CONTROLLER")],
              ] as [string, string, unknown[]]
          )
          .concat(
            ["INCENTIVE_ADMIN", "INCENTIVE_GUARDIAN", "INCENTIVE_DISTRIBUTOR"].map(
              (role) =>
                [
                  deployed.RoleStore as string,
                  "getRoleMemberCount(bytes32) view returns (uint256)",
                  [ROLE_HASH(role)],
                ] as [string, string, unknown[]]
            )
          )
      );
      const missingController = controllerTargets.filter((_, i) => roleChecks[i] !== true).map(([name]) => name);
      gates.push(
        gate(
          "CONTROLLER granted to all seven contracts",
          controllerTargets.length === 7 ? missingController.length === 0 : undefined,
          controllerTargets.length === 7 ? missingController.join(", ") || "all granted" : "waiting on deployments"
        )
      );
      const [adminCount, guardianCount, distributorCount] = roleChecks.slice(controllerTargets.length);
      gates.push(
        gate(
          "INCENTIVE_ADMIN has a holder",
          adminCount ? !adminCount.isZero() : undefined,
          `count ${adminCount ?? "?"}`
        )
      );
      gates.push(
        gate(
          "INCENTIVE_GUARDIAN has a holder",
          guardianCount ? !guardianCount.isZero() : undefined,
          `count ${guardianCount ?? "?"}`
        )
      );
      gates.push(
        gate(
          "INCENTIVE_DISTRIBUTOR has a holder",
          distributorCount ? !distributorCount.isZero() : undefined,
          `count ${distributorCount ?? "?"}`
        )
      );
    } else {
      gates.push(gate("RoleStore checks", undefined, "no RoleStore deployment found"));
    }

    if (deployed.RewardRouterV3 && deployed.EsGmxIssuer && deployed.SeasonRatioVester && deployed.OrphanRatioVester) {
      const v3 = deployed.RewardRouterV3;
      // while V2 is live a second tracker handler could unstake without a matured request, and a router
      // holding CONTROLLER accepts unstake signals whose delay would start early; the router's legacy
      // grants come in the switch batch, the orphan vester's may come before it, and the issuer and the
      // season vester get none until the incentive launch
      const inactiveGrantChecks: [string, string, string, "isHandler" | "isMinter"][] = [
        ["issuer esGMX handler", legacy.esGmx, deployed.EsGmxIssuer, "isHandler"],
        ["season vester esGMX handler", legacy.esGmx, deployed.SeasonRatioVester, "isHandler"],
        ["season vester feeGmxTracker handler", legacy.feeGmxTracker, deployed.SeasonRatioVester, "isHandler"],
        ["season vester esGMX minter", legacy.esGmx, deployed.SeasonRatioVester, "isMinter"],
      ];
      const [v2Live, ...grantFlags] = await multiRead(provider, [
        [legacy.stakedGmxTracker, "isHandler(address) view returns (bool)", [legacy.router]],
        ...routerGrantChecks.map(
          ([, target, kind]) => [target, `${kind}(address) view returns (bool)`, [v3]] as [string, string, unknown[]]
        ),
        ...inactiveGrantChecks.map(
          ([, target, account, kind]) =>
            [target, `${kind}(address) view returns (bool)`, [account]] as [string, string, unknown[]]
        ),
      ]);
      const routerFlags = grantFlags.slice(0, routerGrantChecks.length);
      const inactiveFlags = grantFlags.slice(routerGrantChecks.length);
      const routerLive = routerGrantChecks.filter((_, i) => routerFlags[i] !== false).map(([label]) => label);
      gates.push(
        gate(
          "router without legacy grants while V2 is live",
          v2Live === undefined ? undefined : v2Live === false || routerLive.length === 0,
          v2Live === false ? "V2 is off (step 5)" : routerLive.join(", ") || "none, they come in the switch batch"
        )
      );
      const inactiveLive = inactiveGrantChecks.filter((_, i) => inactiveFlags[i] !== false).map(([label]) => label);
      gates.push(
        gate(
          "issuer and season vester without legacy grants until the incentive launch",
          inactiveFlags.some((flag) => flag === undefined) ? undefined : inactiveLive.length === 0,
          inactiveLive.join(", ") || "none"
        )
      );
      if (deployed.RoleStore && deployed.DataStore) {
        const [v3IsController, signalsPaused] = await multiRead(provider, [
          [deployed.RoleStore, "hasRole(address,bytes32) view returns (bool)", [v3, ROLE_HASH("CONTROLLER")]],
          [deployed.DataStore, "getBool(bytes32) view returns (bool)", [signalUnstakePauseKey(v3)]],
        ]);
        gates.push(
          gate(
            "unstake signals paused while V2 is live",
            v2Live === undefined ? undefined : v2Live === false || signalsPaused === true,
            `paused ${signalsPaused ?? "?"}, router CONTROLLER ${v3IsController ?? "?"}`
          )
        );
      }

      if (deployed.RoleStore) {
        // the govToken has no setMinter; V3 mints/burns voting power via this role
        const [v3GovTokenRole] = await multiRead(provider, [
          [govTokenRoleStore, "hasRole(address,bytes32) view returns (bool)", [v3, ROLE_HASH("GOV_TOKEN_CONTROLLER")]],
        ]);
        gates.push(gate("GOV_TOKEN_CONTROLLER: routerV3", v3GovTokenRole === true, `${v3GovTokenRole ?? "?"}`));
      }

      const mirror = await multiRead(provider, [
        [v3, "maxBoostBasisPoints() view returns (uint256)", []],
        [v3, "votingPowerType() view returns (uint8)", []],
        [v3, "inStrictTransferMode() view returns (bool)", []],
        [v3, "inRestakingMode() view returns (bool)", []],
      ]);
      gates.push(
        gate(
          "maxBoostBasisPoints mirrors V2",
          mirror[0]?.toString() === legacy.maxBoostBasisPoints,
          `v3 ${mirror[0]} vs v2 ${legacy.maxBoostBasisPoints}`
        )
      );
      gates.push(
        gate(
          "votingPowerType mirrors V2",
          mirror[1]?.toString() === legacy.votingPowerType,
          `v3 ${mirror[1]} vs v2 ${legacy.votingPowerType}`
        )
      );
      gates.push(
        gate(
          "inStrictTransferMode mirrors V2",
          mirror[2] === legacy.inStrictTransferMode,
          `v3 ${mirror[2]} vs v2 ${legacy.inStrictTransferMode}`
        )
      );
      gates.push(gate("inRestakingMode is off on V3", mirror[3] === false, `${mirror[3]}`));

      // raising the expiry later makes expired requests executable again, so it stays at its default
      const [unstakeDelay, unstakeExpiry, initialExpiry] = await multiRead(provider, [
        [v3, "unstakeDelay() view returns (uint256)", []],
        [v3, "unstakeExpiry() view returns (uint256)", []],
        [v3, "INITIAL_UNSTAKE_EXPIRY() view returns (uint256)", []],
      ]);
      const days = (v: ethers.BigNumber | undefined) => (v ? v.div(24 * 60 * 60).toString() : "?");
      gates.push(
        gate(
          "unstake expiry at its default",
          unstakeExpiry && initialExpiry ? unstakeExpiry.eq(initialExpiry) : undefined,
          `delay ${days(unstakeDelay)} days, expiry ${days(unstakeExpiry)} days`
        )
      );

      // a delay change goes through the release's TimelockConfig, executed by its controller as CONTROLLER,
      // and the router emits the change itself, so it needs CONTROLLER too; the live pair in the record
      // lacks the setters until the release deploys them
      if (deployed.TimelockConfig && deployed.ConfigTimelockController && deployed.RoleStore) {
        const delaySetterSelector = ethers.utils
          .id("signalSetUnstakeDelay(address,uint256,bytes32,bytes32)")
          .slice(2, 10);
        const timelockConfigCode = await provider.getCode(deployed.TimelockConfig);
        const [controllerIsController, routerIsController] = await multiRead(provider, [
          [
            deployed.RoleStore,
            "hasRole(address,bytes32) view returns (bool)",
            [deployed.ConfigTimelockController, ROLE_HASH("CONTROLLER")],
          ],
          [deployed.RoleStore, "hasRole(address,bytes32) view returns (bool)", [v3, ROLE_HASH("CONTROLLER")]],
        ]);
        gates.push(
          gate(
            "TimelockConfig pair can change the unstake delay",
            controllerIsController === undefined || routerIsController === undefined
              ? undefined
              : timelockConfigCode.includes(delaySetterSelector) &&
                  controllerIsController === true &&
                  routerIsController === true,
            `setters ${timelockConfigCode.includes(delaySetterSelector)}, controller CONTROLLER ${
              controllerIsController ?? "?"
            }, router CONTROLLER ${routerIsController ?? "?"}`
          )
        );
      }
    }

    if (filledCandidates.length) {
      // feeGmxTracker is the new vesters' pair token, where a stale handler can move their collateral;
      // grants a candidate lists under hold stay until their follow-up ends and are reported, not gated
      const revocable: [string, string, string][] = [
        ["esGMX minter", legacy.esGmx, "isMinter"],
        ["esGMX handler", legacy.esGmx, "isHandler"],
        ["bnGMX minter", legacy.bnGmx, "isMinter"],
        ["gmxVester handler", legacy.gmxVester, "isHandler"],
        ["glpVester handler", legacy.glpVester, "isHandler"],
        ["referralVester handler", referralVester, "isHandler"],
        ["feeGmxTracker handler", legacy.feeGmxTracker, "isHandler"],
      ];
      const revocationChecks = filledCandidates.flatMap((c) =>
        revocable.map(
          ([, target, kind]) =>
            [target, `${kind}(address) view returns (bool)`, [c.address]] as [string, string, unknown[]]
        )
      );
      const revocations = await multiRead(provider, revocationChecks);
      const stillGranted: string[] = [];
      const held: string[] = [];
      filledCandidates.forEach((c, i) => {
        revocable.forEach(([label], k) => {
          if (revocations[i * revocable.length + k] !== true) {
            return;
          }
          ((c as { hold?: string[] }).hold?.includes(label) ? held : stillGranted).push(`${c.name} ${label}`);
        });
      });
      gates.push(
        gate(
          "legacy cap-writer grants revoked",
          stillGranted.length === 0,
          (stillGranted.length === 0 ? "revoked" : `still granted: ${stillGranted.join(", ")}`) +
            (held.length ? `; held: ${held.join(", ")}` : "")
        )
      );
    } else {
      gates.push(gate("legacy cap-writer grants revoked", undefined, "candidates not filled"));
    }
    record("step 3: roles, signal pause, router config, legacy revocations", gates);
  }

  // ---- step 4: funding the issuer and the season vester comes with the incentive launch ----

  // ---- step 5: the switch, V2 off and V3 on in one batch, then signals open ----
  {
    const v2 = legacy.router;
    const checks: [string, string][] = [
      ["stakedGmxTracker", legacy.stakedGmxTracker],
      ["bonusGmxTracker", legacy.bonusGmxTracker],
      ["extendedGmxTracker", legacy.extendedGmxTracker],
      ["feeGmxTracker", legacy.feeGmxTracker],
      ["stakedGlpTracker", legacy.stakedGlpTracker],
      ["feeGlpTracker", legacy.feeGlpTracker],
      ["esGmx", legacy.esGmx],
      ["gmxVester", legacy.gmxVester],
      ["glpVester", legacy.glpVester],
      ["referralVester", referralVester],
    ];
    const results = await multiRead(
      provider,
      checks
        .map(([, target]) => [target, "isHandler(address) view returns (bool)", [v2]] as [string, string, unknown[]])
        .concat([[legacy.bnGmx, "isMinter(address) view returns (bool)", [v2]]])
    );
    const stillGranted = checks.filter((_, i) => results[i] === true).map(([label]) => label);
    if (results[checks.length] === true) {
      stillGranted.push("bnGmx minter");
    }
    if (deployed.RoleStore) {
      const [v2GovTokenRole] = await multiRead(provider, [
        [govTokenRoleStore, "hasRole(address,bytes32) view returns (bool)", [v2, ROLE_HASH("GOV_TOKEN_CONTROLLER")]],
      ]);
      if (v2GovTokenRole === true) {
        stillGranted.push("govToken GOV_TOKEN_CONTROLLER");
      }
    }
    const step5Gates = [gate("all V2 grants revoked", stillGranted.length === 0, stillGranted.join(", ") || "revoked")];
    if (deployed.RewardRouterV3) {
      const v3 = deployed.RewardRouterV3;
      const v3Flags = await multiRead(
        provider,
        routerGrantChecks.map(
          ([, target, kind]) => [target, `${kind}(address) view returns (bool)`, [v3]] as [string, string, unknown[]]
        )
      );
      const v3Missing = routerGrantChecks.filter((_, i) => v3Flags[i] !== true).map(([label]) => label);
      step5Gates.push(gate("V3 legacy grants live", v3Missing.length === 0, v3Missing.join(", ") || "all granted"));
      if (deployed.DataStore) {
        const [signalsPaused] = await multiRead(provider, [
          [deployed.DataStore, "getBool(bytes32) view returns (bool)", [signalUnstakePauseKey(v3)]],
        ]);
        step5Gates.push(
          gate(
            "unstake signals open after the switch",
            signalsPaused === undefined || v3Missing.length > 0 ? undefined : signalsPaused === false,
            `paused ${signalsPaused ?? "?"}`
          )
        );
      }
    } else {
      step5Gates.push(gate("V3 legacy grants live", undefined, "waiting on deployments"));
    }
    record("step 5: switch (V2 off, V3 on, signals open)", step5Gates);
  }

  // ---- steps 6-7: snapshot and provisioning ----
  {
    const gates: Gate[] = [];
    if (!snapshot) {
      gates.push(gate("orphan snapshot artifact", undefined, "run takeSnapshot after cutover"));
    } else {
      gates.push(
        gate(
          "orphan snapshot artifact",
          true,
          `block ${snapshot.block}, ${snapshot.accounts.length} accounts, total ${snapshot.total}`
        )
      );
      const pinnedFull = snapshot.scan?.pinned === true && snapshot.scan?.fromBlock === 0;
      gates.push(
        gate(
          "snapshot pinned to a block and full-history",
          pinnedFull ? true : undefined,
          pinnedFull ? "" : "re-run takeSnapshot with SNAPSHOT_BLOCK set and FROM_BLOCK=0"
        )
      );
      gates.push(
        gate(
          "multichain vault fully attributed",
          snapshot.multichainVault ? snapshot.multichainVault.unattributed === "0" : undefined,
          `unattributed ${snapshot.multichainVault?.unattributed ?? "?"}`
        )
      );
      // the snapshot must land after the switch and before the first issuance
      const orderingReads: [string, string, unknown[]][] = [
        [legacy.esGmx, "isHandler(address) view returns (bool)", [legacy.router]],
        [legacy.stakedGmxTracker, "isHandler(address) view returns (bool)", [legacy.router]],
      ];
      if (deployed.EsGmxIssuer) {
        orderingReads.push([deployed.EsGmxIssuer, "totalIssuedAmount() view returns (uint256)", []]);
      }
      const ordering = await multiRead(provider, orderingReads, snapshot.block);
      const flags = ["esGmx", "stakedGmxTracker"].map((name, i) => `${name} handler ${ordering[i] ?? "?"}`).join(", ");
      gates.push(
        gate(
          "V2 de-permissioned at the snapshot block",
          ordering[0] === undefined || ordering[1] === undefined
            ? undefined
            : ordering[0] === false && ordering[1] === false,
          `${flags} (archive read at ${snapshot.block})`
        )
      );
      if (deployed.EsGmxIssuer) {
        // issuance before the block is acceptable only when the snapshot acknowledged it and netted the claimed part out
        const netted =
          snapshot.issuance?.acknowledged === true && snapshot.issuance?.totalIssuedAtBlock === ordering[2]?.toString();
        gates.push(
          gate(
            "no issuance before the snapshot block, or netted by the snapshot",
            ordering[2] ? ordering[2].isZero() || netted : undefined,
            `totalIssuedAmount ${ordering[2] ?? "?"}` +
              (netted
                ? ` (netted ${snapshot.issuance.nettedAmount} across ${snapshot.issuance.nettedAccounts} accounts)`
                : "") +
              (!netted && ordering[2] && !ordering[2].isZero()
                ? "; re-run takeSnapshot with ISSUANCE_BEFORE_SNAPSHOT=1"
                : "")
          )
        );
      }
      if (!deployed.OrphanRatioVester) {
        gates.push(gate("provision caps match snapshot", undefined, "waiting on OrphanRatioVester deployment"));
      } else {
        const stride = Math.max(1, Math.floor(snapshot.accounts.length / 25));
        const sample = snapshot.accounts.filter((_: any, i: number) => i % stride === 0).slice(0, 25);
        const caps = await multiRead(
          provider,
          sample.map(
            (e: any) =>
              [deployed.OrphanRatioVester as string, "provisionCaps(address) view returns (uint256)", [e.account]] as [
                string,
                string,
                unknown[]
              ]
          )
        );
        const mismatches = sample.filter((e: any, i: number) => caps[i]?.toString() !== e.amount).length;
        gates.push(
          gate(
            `provision caps match snapshot (stride sample of ${sample.length})`,
            mismatches === 0,
            `${mismatches} mismatches`
          )
        );
        const [orphanGmx] = await multiRead(provider, [
          [legacy.gmx, "balanceOf(address) view returns (uint256)", [deployed.OrphanRatioVester]],
        ]);
        const funded = orphanGmx ? orphanGmx.toString() : "?";
        gates.push(
          gate(
            "orphan funded (decision 3 sets the fraction)",
            orphanGmx ? !orphanGmx.isZero() : undefined,
            `${funded} of target ${snapshot.total}`
          )
        );
      }
    }
    record("steps 6-7: snapshot and provisioning", gates);
  }

  // ---- step 8: open transfers and vesting ----
  {
    const gates: Gate[] = [];
    // the season vester is designated at the incentive launch
    if (deployed.OrphanRatioVester && deployed.RewardRouterV3) {
      const [orphanComplete, allowlistLength, vester0, orphanEsGmxHandler, orphanFeeHandler, orphanEsGmxMinter] =
        await multiRead(provider, [
          [deployed.OrphanRatioVester, "provisioningComplete() view returns (bool)", []],
          [deployed.RewardRouterV3, "designatedVestersLength() view returns (uint256)", []],
          [deployed.RewardRouterV3, "designatedVesters(uint256) view returns (address)", [0]],
          [legacy.esGmx, "isHandler(address) view returns (bool)", [deployed.OrphanRatioVester]],
          [legacy.feeGmxTracker, "isHandler(address) view returns (bool)", [deployed.OrphanRatioVester]],
          [legacy.esGmx, "isMinter(address) view returns (bool)", [deployed.OrphanRatioVester]],
        ]);
      // the vester pulls esGMX and pair tokens through its handler flags and burns esGMX as a minter
      gates.push(
        gate(
          "orphan vester legacy grants live (step5_orphan_grants)",
          orphanEsGmxHandler === true && orphanFeeHandler === true && orphanEsGmxMinter === true,
          `esGMX handler ${orphanEsGmxHandler}, feeGmxTracker handler ${orphanFeeHandler}, esGMX minter ${orphanEsGmxMinter}`
        )
      );
      gates.push(gate("provisioningComplete on the orphan vester", orphanComplete === true, `${orphanComplete}`));
      const correct = allowlistLength?.toString() === "1" && vester0 === deployed.OrphanRatioVester;
      gates.push(
        gate("allowlist holds exactly the orphan vester", correct, `length ${allowlistLength}, [${vester0 ?? ""}]`)
      );

      if (deployed.EsGmxIssuer) {
        const [orphanGmx, totalIssued, totalClaimed, issuerEsGmx] = await multiRead(provider, [
          [legacy.gmx, "balanceOf(address) view returns (uint256)", [deployed.OrphanRatioVester]],
          [deployed.EsGmxIssuer, "totalIssuedAmount() view returns (uint256)", []],
          [deployed.EsGmxIssuer, "totalClaimedAmount() view returns (uint256)", []],
          [legacy.esGmx, "balanceOf(address) view returns (uint256)", [deployed.EsGmxIssuer]],
        ]);
        const bps = process.env.ORPHAN_FUNDING_BPS ? parseInt(process.env.ORPHAN_FUNDING_BPS) : undefined;
        const fundingTarget =
          bps !== undefined && snapshot ? ethers.BigNumber.from(snapshot.total).mul(bps).div(10000) : undefined;
        gates.push(
          gate(
            "orphan funding bound (decision 3 via ORPHAN_FUNDING_BPS)",
            fundingTarget && orphanGmx ? orphanGmx.gte(fundingTarget) : undefined,
            `funded ${orphanGmx ?? "?"} vs cap total ${snapshot?.total ?? "?"}${
              fundingTarget ? `, target ${fundingTarget}` : " (set ORPHAN_FUNDING_BPS to gate)"
            }`
          )
        );
        const outstanding = totalIssued && totalClaimed ? totalIssued.sub(totalClaimed) : undefined;
        gates.push(
          gate(
            "issuer esGMX covers unclaimed issuance",
            issuerEsGmx && outstanding ? issuerEsGmx.gte(outstanding) : undefined,
            `balance ${issuerEsGmx ?? "?"}, outstanding ${outstanding ?? "?"}`
          )
        );
      }
    } else {
      gates.push(gate("wiring checks", undefined, "waiting on deployments"));
    }
    record("step 8: open transfers and vesting", gates);
  }

  // ---- step 9: zeroing ----
  {
    const gates: Gate[] = [];
    if (deployed.GmxVesterCapZeroer && deployed.GlpVesterCapZeroer && deployed.ReferralVesterCapZeroer) {
      const [gmxGrant, glpGrant, referralGrant] = await multiRead(provider, [
        [legacy.gmxVester, "isHandler(address) view returns (bool)", [deployed.GmxVesterCapZeroer]],
        [legacy.glpVester, "isHandler(address) view returns (bool)", [deployed.GlpVesterCapZeroer]],
        [referralVester, "isHandler(address) view returns (bool)", [deployed.ReferralVesterCapZeroer]],
      ]);
      gates.push(
        gate(
          "zeroer handler grants live",
          gmxGrant === true && glpGrant === true && referralGrant === true,
          `gmx ${gmxGrant} glp ${glpGrant} referral ${referralGrant}`
        )
      );
    }
    // with the flag off the cap check is skipped and a zeroed cap needs no pair tokens
    const [gmxFlag, glpFlag] = await multiRead(provider, [
      [legacy.gmxVester, "hasMaxVestableAmount() view returns (bool)", []],
      [legacy.glpVester, "hasMaxVestableAmount() view returns (bool)", []],
    ]);
    gates.push(
      gate(
        "hasMaxVestableAmount on the gmx and glp vesters",
        gmxFlag === true && glpFlag === true,
        `gmx ${gmxFlag} glp ${glpFlag}`
      )
    );
    // the referral vester's gov Timelock lets its contract handlers call batchSetBonusRewards and
    // batchIncreaseBonusRewards, which reopen caps without a buffer; once that gov is shared with
    // the other legacy contracts the handlers are operational keys and no revocation bundle exists
    if (referralTimelockHandlers.length > 0) {
      const [referralGov, mainGov] = await multiRead(provider, [
        [referralVester, "gov() view returns (address)", []],
        [legacy.esGmx, "gov() view returns (address)", []],
      ]);
      const live = await multiRead(
        provider,
        referralTimelockHandlers.map(
          (h) => [referralGov, "isHandler(address) view returns (bool)", [h]] as [string, string, unknown[]]
        )
      );
      const stillLive = referralTimelockHandlers.filter((_, i) => live[i] !== false);
      const accepted = process.env.ACCEPT_REFERRAL_TIMELOCK_HANDLERS === "1";
      const shared = referralGov !== undefined && referralGov === mainGov;
      const remedy = shared
        ? "shared gov, no revocation bundle (decisions item 2); accept with ACCEPT_REFERRAL_TIMELOCK_HANDLERS=1"
        : "bundle step9_referral_timelock_handlers or accept with ACCEPT_REFERRAL_TIMELOCK_HANDLERS=1";
      gates.push(
        gate(
          "referral Timelock contract handlers revoked",
          stillLive.length === 0 || accepted,
          stillLive.length === 0
            ? "none live"
            : `${stillLive.length} of ${referralTimelockHandlers.length} live on ${referralGov}` +
                (accepted ? " (accepted via ACCEPT_REFERRAL_TIMELOCK_HANDLERS=1)" : `; ${remedy}`)
        )
      );
    }
    if (!capAccounts) {
      gates.push(gate("legacy cap enumeration artifact", undefined, "run enumerateLegacyCapAccounts"));
    } else {
      const fullScan = capAccounts.scan?.fromBlock === 0;
      gates.push(
        gate(
          "cap enumeration covers full history",
          fullScan ? true : undefined,
          fullScan
            ? `generated ${capAccounts.generatedAt}`
            : `partial scan from block ${capAccounts.scan?.fromBlock}; re-run with FROM_BLOCK=0`
        )
      );
      const sampleOf = (list: any[]) => {
        const stride = Math.max(1, Math.floor(list.length / 25));
        return list.filter((_: any, i: number) => i % stride === 0).slice(0, 25);
      };
      if (!capAccounts.referralVester) {
        gates.push(
          gate(
            "cap enumeration includes the referral vester",
            undefined,
            "stale artifact; re-run enumerateLegacyCapAccounts"
          )
        );
      }
      const sample = [
        ...sampleOf(capAccounts.gmxVester.accounts),
        ...sampleOf(capAccounts.glpVester.accounts),
        ...sampleOf(capAccounts.referralVester?.accounts ?? []),
      ];
      const caps = await multiRead(
        provider,
        sample.map(
          (e: any) =>
            [e.vester, "cumulativeRewardDeductions(address) view returns (uint256)", [e.account]] as [
              string,
              string,
              unknown[]
            ]
        )
      );
      const open = caps.filter((v) => !v || !v.eq(ethers.constants.MaxUint256)).length;
      gates.push(
        gate(
          "zeroing converged (stride sample per vester)",
          open === 0,
          `${open} still open of ${sample.length} sampled`
        )
      );
    }
    record("step 9: legacy cap zeroing", gates);
  }

  // ---- step 10: cadence ----
  {
    const gates: Gate[] = [];
    if (deployed.EsGmxIssuer) {
      const [totalIssued] = await multiRead(provider, [
        [deployed.EsGmxIssuer, "totalIssuedAmount() view returns (uint256)", []],
      ]);
      gates.push(
        gate(
          "cadence started (informational)",
          totalIssued ? !totalIssued.isZero() : undefined,
          `totalIssuedAmount ${totalIssued ?? "?"}`
        )
      );
    } else {
      gates.push(gate("cadence checks", undefined, "waiting on deployments"));
    }
    record("step 10: weekly cadence", gates);
  }

  console.log("\nsummary:");
  for (const s of summary) {
    console.log(`  ${s.ready ? "READY  " : "pending"} ${s.step}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
