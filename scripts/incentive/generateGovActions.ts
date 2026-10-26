import fs from "fs";
import path from "path";
import { ethers } from "ethers";

import { REWARD_ROUTER_V2, getProvider, getRouterAddresses, getReferralVester, assertArbitrum } from "./lib";
import {
  ROLE_HASH,
  getDeployment,
  makeAction,
  makeTimelockExecution,
  writeOutFile,
  multiReadStrict,
  GovAction,
} from "./migrationLib";

// Generates the governance call bundles for the gated migration steps (1 drain, 2 bind,
// 3, 5 switch, 8, 9) and the unstake signal pause, as calldata for the Safe / Timelock tooling;
// read-only, never sends. Legacy-gov actions carry the Timelock signal/execute pair with the
// action hash and its live pending status, so a re-run never suggests a duplicate signal;
// revocation lists come from live grant state.
// env: INCENTIVE_RPC, NETWORK_NAME, DRAIN_RECEIVER, HOLDER_<ROLE>, UNSTAKE_DELAY_DAYS (optional delay change),
//      UNSTAKE_DELAY_SALT (optional, when the same delay value has been scheduled before)

const AddressZero = ethers.constants.AddressZero;

async function main() {
  const provider = getProvider();
  await assertArbitrum(provider);
  const networkName = process.env.NETWORK_NAME || "arbitrum";
  const legacy = await getRouterAddresses(provider, REWARD_ROUTER_V2.arbitrum);

  const need = (name: string) => {
    const deployment = getDeployment(networkName, name);
    if (!deployment) {
      throw new Error(`missing deployment: ${name}; run the deploy scripts first`);
    }
    return deployment.address;
  };
  const roleStore = need("RoleStore");
  // the govToken's own RoleStore, not the deployment's: they differ on a fresh fork stack
  const [govTokenRoleStore] = await multiReadStrict(provider, [
    [legacy.govToken, "roleStore() view returns (address)", []],
  ]);
  const routerV3 = need("RewardRouterV3");
  const issuer = need("EsGmxIssuer");
  const season = need("SeasonRatioVester");
  const orphan = need("OrphanRatioVester");
  const gmxZeroer = need("GmxVesterCapZeroer");
  const glpZeroer = need("GlpVesterCapZeroer");
  const referralZeroer = need("ReferralVesterCapZeroer");
  const config = need("Config");

  const holdersFile = path.join(__dirname, "migration-holders.json");
  const holders = fs.existsSync(holdersFile) ? JSON.parse(fs.readFileSync(holdersFile, "utf8")).holders : {};
  // HOLDER_<ROLE> env entries override the file (rehearsal accounts on a fork)
  for (const role of Object.keys(holders)) {
    if (process.env[`HOLDER_${role}`]) {
      holders[role] = process.env[`HOLDER_${role}`];
    }
  }
  const unfilledHolders = Object.entries(holders)
    .filter(([, address]) => !ethers.utils.isAddress(address as string))
    .map(([role]) => role);

  const candidatesFile = path.join(__dirname, "legacy-writer-candidates.json");
  const candidatesJson = fs.existsSync(candidatesFile) ? JSON.parse(fs.readFileSync(candidatesFile, "utf8")) : {};
  const candidates: { name: string; address: string; hold?: string[] }[] = candidatesJson.candidates || [];
  const filledCandidates = candidates.filter((c) => ethers.utils.isAddress(c.address));
  const referralTimelockHandlers: string[] = (candidatesJson.referralTimelockHandlers || []).filter((a: string) =>
    ethers.utils.isAddress(a)
  );

  // the referral vester's gov is a different Timelock, so each target resolves its own gov
  const referralVester = await getReferralVester(provider, legacy.esGmx);
  const legacyTargets = [
    legacy.esGmx,
    legacy.bnGmx,
    legacy.stakedGmxTracker,
    legacy.bonusGmxTracker,
    legacy.extendedGmxTracker,
    legacy.feeGmxTracker,
    legacy.stakedGlpTracker,
    legacy.feeGlpTracker,
    legacy.gmxVester,
    legacy.glpVester,
    referralVester,
  ];
  const govs = await multiReadStrict(
    provider,
    legacyTargets.map((t) => [t, "gov() view returns (address)", []] as [string, string, unknown[]])
  );
  const govOf = new Map(legacyTargets.map((t, i) => [t, govs[i]]));
  const mainTimelock = govOf.get(legacy.esGmx) as string;

  const incomplete: string[] = [];
  const bundles: { [step: string]: GovAction[] } = {};
  const notes: { [step: string]: string } = {};

  const legacyAction = (
    label: string,
    target: string,
    kind: "setHandler" | "setMinter",
    account: string,
    active: boolean
  ): GovAction => {
    const timelock = govOf.get(target);
    if (!timelock) {
      throw new Error(`no gov resolved for legacy target ${target}`);
    }
    const action = makeAction(label, "legacy gov (Timelock)", target, `${kind}(address,bool)`, [account, active]);
    action.execution = makeTimelockExecution(kind, timelock, [target, account, active]);
    return action;
  };

  // ---- step 1: drain the esGMX-emitting distributors (precondition) ----
  const drainReceiver = process.env.DRAIN_RECEIVER;
  if (!drainReceiver || !ethers.utils.isAddress(drainReceiver)) {
    incomplete.push("step1_drain: set DRAIN_RECEIVER (actions emitted with a zero receiver placeholder)");
  }
  const receiver = drainReceiver && ethers.utils.isAddress(drainReceiver) ? drainReceiver : AddressZero;
  const [gmxDistributor, glpDistributor] = await multiReadStrict(provider, [
    [legacy.stakedGmxTracker, "distributor() view returns (address)", []],
    [legacy.stakedGlpTracker, "distributor() view returns (address)", []],
  ]);
  const drainInfo = await multiReadStrict(provider, [
    [legacy.esGmx, "balanceOf(address) view returns (uint256)", [gmxDistributor]],
    [gmxDistributor, "gov() view returns (address)", []],
    [legacy.esGmx, "balanceOf(address) view returns (uint256)", [glpDistributor]],
    [glpDistributor, "gov() view returns (address)", []],
  ]);
  const step1: GovAction[] = [];
  for (const [tracker, distributor, balance, gov] of [
    ["stakedGmxTracker", gmxDistributor, drainInfo[0], drainInfo[1]],
    ["stakedGlpTracker", glpDistributor, drainInfo[2], drainInfo[3]],
  ] as [string, string, ethers.BigNumber, string][]) {
    if (!balance || balance.isZero()) {
      continue;
    }
    // the exact amount is in the action hash; emission is zero so balances are static
    const action = makeAction(
      `drain ${ethers.utils.formatEther(balance)} esGMX from ${tracker} distributor`,
      "distributor gov (old Timelock, no multicall)",
      distributor,
      "withdrawToken(address,address,uint256)",
      [legacy.esGmx, receiver, balance.toString()]
    );
    action.execution = makeTimelockExecution("withdrawToken", gov, [
      distributor,
      legacy.esGmx,
      receiver,
      balance.toString(),
    ]);
    step1.push(action);
  }
  bundles["step1_drain"] = step1;
  notes["step1_drain"] =
    "size the drain against outstanding tracker claimables (or include claimables in the orphan caps) so pending user claims stay payable";

  // ---- step 2: issuer binding ----
  // setVester is one-shot and does not check its argument, so it is only emitted for a season
  // vester that names this issuer
  const [seasonIssuer, issuerVester] = await multiReadStrict(provider, [
    [season, "issuer() view returns (address)", []],
    [issuer, "vester() view returns (address)", []],
  ]);
  const seasonNamesIssuer = seasonIssuer.toLowerCase() === issuer.toLowerCase();
  if (!seasonNamesIssuer) {
    incomplete.push(
      `step2_bind: SeasonRatioVester.issuer() is ${seasonIssuer}, not EsGmxIssuer ${issuer}; setVester omitted`
    );
  }
  if (issuerVester !== AddressZero && issuerVester.toLowerCase() !== season.toLowerCase()) {
    incomplete.push(`step2_bind: EsGmxIssuer.vester() is already ${issuerVester}, not SeasonRatioVester ${season}`);
  }
  bundles["step2_bind"] = [
    ...(seasonNamesIssuer && issuerVester === AddressZero
      ? [makeAction("bind issuer to SeasonRatioVester", "TIMELOCK_ADMIN", issuer, "setVester(address)", [season])]
      : []),
    makeAction(
      "confirm binding on SeasonRatioVester (permissionless follow-up)",
      "anyone",
      season,
      "confirmIssuerBinding()",
      []
    ),
  ];

  // ---- step 3: RoleStore grants ----
  const step3Roles: GovAction[] = [];
  for (const [label, address] of [
    ["RewardRouterV3", routerV3],
    ["EsGmxIssuer", issuer],
    ["SeasonRatioVester", season],
    ["OrphanRatioVester", orphan],
    ["GmxVesterCapZeroer", gmxZeroer],
    ["GlpVesterCapZeroer", glpZeroer],
    ["ReferralVesterCapZeroer", referralZeroer],
  ]) {
    step3Roles.push(
      makeAction(`grant CONTROLLER to ${label}`, "RoleStore admin", roleStore, "grantRole(address,bytes32)", [
        address,
        ROLE_HASH("CONTROLLER"),
      ])
    );
  }
  step3Roles.push(
    makeAction(
      "grant GOV_TOKEN_CONTROLLER to RewardRouterV3 (govToken mint/burn for voting power)",
      "RoleStore admin",
      govTokenRoleStore,
      "grantRole(address,bytes32)",
      [routerV3, ROLE_HASH("GOV_TOKEN_CONTROLLER")]
    )
  );
  for (const [role, holder] of Object.entries(holders)) {
    if (ethers.utils.isAddress(holder as string)) {
      step3Roles.push(
        makeAction(`grant ${role} to ${holder}`, "RoleStore admin", roleStore, "grantRole(address,bytes32)", [
          holder,
          ROLE_HASH(role),
        ])
      );
    }
  }
  bundles["step3_rolestore"] = step3Roles;

  // ---- step 3: unstake signal pause, set before the router's CONTROLLER grant executes ----
  // a router holding CONTROLLER accepts signalUnstake, and a request made before the switch would
  // start its delay early; the pause is cleared right after the switch batch (step5_signal_unpause)
  const signalUnstakeBase = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(["string"], ["SIGNAL_UNSTAKE_FEATURE_DISABLED"])
  );
  const routerKeyData = ethers.utils.defaultAbiCoder.encode(["address"], [routerV3]);
  const [pauseKeyAllowed] = await multiReadStrict(provider, [
    [config, "allowedBaseKeys(bytes32) view returns (bool)", [signalUnstakeBase]],
  ]);
  if (pauseKeyAllowed !== true) {
    incomplete.push(
      `step3_signal_pause: Config ${config} does not allow SIGNAL_UNSTAKE_FEATURE_DISABLED; deploy the release's Config first`
    );
  }
  bundles["step3_signal_pause"] = [
    makeAction("pause unstake signals on RewardRouterV3", "CONFIG_KEEPER", config, "setBool(bytes32,bytes,bool)", [
      signalUnstakeBase,
      routerKeyData,
      true,
    ]),
  ];
  notes["step3_signal_pause"] =
    "execute once the role round has given the release's Config CONTROLLER and before it gives RewardRouterV3 CONTROLLER";

  // ---- step 3: legacy-side revocations (Timelock signal/execute pairs) ----
  // the router's legacy grants come in the switch batch, since while V2 is live a second tracker handler
  // could unstake without a matured request; the orphan vester's (step5_orphan_grants) may come before
  // it; the issuer and the season vester get none until the incentive launch
  const step3Legacy: GovAction[] = [];

  // legacy cap-writer revocations, generated from live grant state for filled candidates;
  // feeGmxTracker is the new vesters' pair token, where a stale handler can move their collateral
  if (filledCandidates.length) {
    const revocable: [string, string, "setMinter" | "setHandler"][] = [
      ["esGMX minter", legacy.esGmx, "setMinter"],
      ["esGMX handler", legacy.esGmx, "setHandler"],
      ["bnGMX minter", legacy.bnGmx, "setMinter"],
      ["gmxVester handler", legacy.gmxVester, "setHandler"],
      ["glpVester handler", legacy.glpVester, "setHandler"],
      ["referralVester handler", referralVester, "setHandler"],
      ["feeGmxTracker handler", legacy.feeGmxTracker, "setHandler"],
    ];
    const grantChecks = filledCandidates.flatMap((c) =>
      revocable.map(([, target, kind]) => [
        target,
        `${kind === "setMinter" ? "isMinter" : "isHandler"}(address) view returns (bool)`,
        [c.address],
      ])
    ) as [string, string, unknown[]][];
    const grants = await multiReadStrict(provider, grantChecks);
    const held: string[] = [];
    filledCandidates.forEach((c, i) => {
      revocable.forEach(([label, target, kind], k) => {
        if (grants[i * revocable.length + k] !== true) {
          return;
        }
        if (c.hold?.includes(label)) {
          held.push(`${label} ${c.name}`);
          return;
        }
        step3Legacy.push(legacyAction(`revoke ${label} ${c.name}`, target, kind, c.address, false));
      });
    });
    if (held.length) {
      notes["step3_legacy"] = `held, not revoked (see the candidates file): ${held.join(", ")}`;
    }
  } else {
    incomplete.push("step3_legacy: cap-writer candidates not filled, revocation actions not generated");
  }
  bundles["step3_legacy"] = step3Legacy;

  // the router config is set in the RewardRouterV3 constructor from the live V2 values, so there is no
  // config bundle; migrationStatus checks that the deployed router still matches V2

  // ---- step 5: the switch, V2's revocations from live grant state and V3's grants in one batch ----
  const v2 = legacy.router;
  const revocationTargets: [string, string, string][] = [
    ["stakedGmxTracker", legacy.stakedGmxTracker, "isHandler"],
    ["bonusGmxTracker", legacy.bonusGmxTracker, "isHandler"],
    ["extendedGmxTracker", legacy.extendedGmxTracker, "isHandler"],
    ["feeGmxTracker", legacy.feeGmxTracker, "isHandler"],
    ["stakedGlpTracker", legacy.stakedGlpTracker, "isHandler"],
    ["feeGlpTracker", legacy.feeGlpTracker, "isHandler"],
    ["esGMX", legacy.esGmx, "isHandler"],
    ["gmxVester", legacy.gmxVester, "isHandler"],
    ["glpVester", legacy.glpVester, "isHandler"],
    ["referralVester", referralVester, "isHandler"],
    ["bnGMX", legacy.bnGmx, "isMinter"],
  ];
  const step5: GovAction[] = [];
  const revocationReads = await multiReadStrict(
    provider,
    revocationTargets.map(
      ([, target, kind]) => [target, `${kind}(address) view returns (bool)`, [v2]] as [string, string, unknown[]]
    )
  );
  revocationTargets.forEach(([label, target, kind], i) => {
    if (revocationReads[i] === true) {
      const method = kind === "isHandler" ? "setHandler" : "setMinter";
      step5.push(
        legacyAction(
          `revoke V2 ${method === "setHandler" ? "handler" : "minter"} on ${label}`,
          target,
          method as "setHandler" | "setMinter",
          v2,
          false
        )
      );
    }
  });
  const [v2HasGovTokenRole] = await multiReadStrict(provider, [
    [govTokenRoleStore, "hasRole(address,bytes32) view returns (bool)", [v2, ROLE_HASH("GOV_TOKEN_CONTROLLER")]],
  ]);
  const routerGrants: [string, string][] = [
    ["esGMX", legacy.esGmx],
    ["stakedGmxTracker", legacy.stakedGmxTracker],
    ["bonusGmxTracker", legacy.bonusGmxTracker],
    ["extendedGmxTracker", legacy.extendedGmxTracker],
    ["feeGmxTracker", legacy.feeGmxTracker],
    ["stakedGlpTracker", legacy.stakedGlpTracker],
    ["feeGlpTracker", legacy.feeGlpTracker],
  ];
  for (const [label, target] of routerGrants) {
    step5.push(legacyAction(`${label} handler for RewardRouterV3`, target, "setHandler", routerV3, true));
  }
  step5.push(legacyAction("bnGMX minter for RewardRouterV3", legacy.bnGmx, "setMinter", routerV3, true));
  if (v2HasGovTokenRole === true) {
    step5.push(
      makeAction(
        "revoke GOV_TOKEN_CONTROLLER from RewardRouterV2",
        "RoleStore admin",
        govTokenRoleStore,
        "revokeRole(address,bytes32)",
        [v2, ROLE_HASH("GOV_TOKEN_CONTROLLER")]
      )
    );
  }
  bundles["step5_switch"] = step5;
  notes["step5_switch"] =
    "every Timelock pair here executes in ONE batch, so V2 never coexists with V3; confirm Dolomite's forced unstake before signalling; the GOV_TOKEN_CONTROLLER revoke goes through the security committee with the batch; then step5_signal_unpause";

  bundles["step5_signal_unpause"] = [
    makeAction("open unstake signals on RewardRouterV3", "CONFIG_KEEPER", config, "setBool(bytes32,bytes,bool)", [
      signalUnstakeBase,
      routerKeyData,
      false,
    ]),
  ];
  notes["step5_signal_unpause"] = "right after the switch batch has executed";

  // ---- step 5: the orphan vester's legacy grants, any time before step8_wire ----
  bundles["step5_orphan_grants"] = [
    legacyAction("esGMX handler for OrphanRatioVester", legacy.esGmx, "setHandler", orphan, true),
    legacyAction("feeGmxTracker handler for OrphanRatioVester", legacy.feeGmxTracker, "setHandler", orphan, true),
    legacyAction("esGMX minter for OrphanRatioVester", legacy.esGmx, "setMinter", orphan, true),
  ];
  notes["step5_orphan_grants"] =
    "execute any time before step8_wire opens vesting, before the switch too, since the orphan vester holds no caps until provisioning";

  // ---- optional: unstake delay change through the release's TimelockConfig (24 hours) ----
  // a delay increase also applies to requests already pending, so it can land before or after the switch
  const delayDays = process.env.UNSTAKE_DELAY_DAYS;
  const delaySetterSelector = ethers.utils.id("signalSetUnstakeDelay(address,uint256,bytes32,bytes32)").slice(2, 10);
  if (delayDays && !(await provider.getCode(need("TimelockConfig"))).includes(delaySetterSelector)) {
    incomplete.push(
      `unstake_delay: TimelockConfig ${need(
        "TimelockConfig"
      )} has no signalSetUnstakeDelay; deploy the release's TimelockConfig first`
    );
  } else if (delayDays) {
    const timelockConfig = need("TimelockConfig");
    const configTimelockController = need("ConfigTimelockController");
    const delay = ethers.BigNumber.from(delayDays).mul(24 * 60 * 60);
    const [maxDelay, unstakeExpiry, minDelay] = await multiReadStrict(provider, [
      [routerV3, "MAX_UNSTAKE_DELAY() view returns (uint256)", []],
      [routerV3, "unstakeExpiry() view returns (uint256)", []],
      [configTimelockController, "getMinDelay() view returns (uint256)", []],
    ]);
    if (delay.gt(maxDelay) || (!unstakeExpiry.isZero() && delay.gte(unstakeExpiry))) {
      throw new Error(`UNSTAKE_DELAY_DAYS ${delayDays} is above MAX_UNSTAKE_DELAY or at or above the live expiry`);
    }
    const salt = ethers.utils.id(process.env.UNSTAKE_DELAY_SALT || `setUnstakeDelay:${delay.toString()}`);
    const payload = new ethers.utils.Interface(["function setUnstakeDelay(uint256)"]).encodeFunctionData(
      "setUnstakeDelay",
      [delay]
    );
    const execute = makeAction(
      `execute the unstake delay change to ${delayDays} days`,
      "TIMELOCK_ADMIN",
      timelockConfig,
      "execute(address,bytes,bytes32,bytes32)",
      [routerV3, payload, ethers.constants.HashZero, salt]
    );
    execute.delaySeconds = minDelay.toString();
    bundles["unstake_delay"] = [
      makeAction(
        `signal the unstake delay change to ${delayDays} days`,
        "TIMELOCK_ADMIN",
        timelockConfig,
        "signalSetUnstakeDelay(address,uint256,bytes32,bytes32)",
        [routerV3, delay, ethers.constants.HashZero, salt]
      ),
      execute,
    ];
    notes[
      "unstake_delay"
    ] = `execute ${minDelay}s after the signal, once the ConfigTimelockController and RewardRouterV3 hold CONTROLLER; the router emits the change itself`;
  }

  // ---- step 8: open transfers and vesting ----
  bundles["step8_wire"] = [
    makeAction("provisioningComplete on OrphanRatioVester", "INCENTIVE_ADMIN", orphan, "setProvisioningComplete()", []),
    makeAction("designate OrphanRatioVester", "TIMELOCK_ADMIN", routerV3, "addDesignatedVester(address)", [orphan]),
  ];
  notes["step8_wire"] =
    "the season vester is designated at the incentive launch, after its setProvisioningComplete and before the issuer's first distributeEpoch; a designated vester without provisioningComplete makes every account transfer revert, and issuance distributed before the designation stays with the sender on an account transfer";

  // ---- step 9: zeroer grants ----
  bundles["step9_zeroer_grants"] = [
    legacyAction("gmxVester handler for GmxVesterCapZeroer", legacy.gmxVester, "setHandler", gmxZeroer, true),
    legacyAction("glpVester handler for GlpVesterCapZeroer", legacy.glpVester, "setHandler", glpZeroer, true),
    legacyAction(
      "referralVester handler for ReferralVesterCapZeroer",
      referralVester,
      "setHandler",
      referralZeroer,
      true
    ),
  ];
  notes["step9_zeroer_grants"] =
    "signals can go out at least a day early; a pending signal grants nothing until executed";

  // the referral vester's gov Timelock lets its contract handlers call batchSetBonusRewards and
  // batchIncreaseBonusRewards, which reopen caps without a buffer; setContractHandler is an
  // unbuffered admin call. Revocations are generated only while that gov is a dedicated Timelock.
  // Once it also governs the other legacy contracts (the team Timelock after the gov move, which
  // is the V1 Vault's gov as well) its handlers are operational keys, the decision is the team's
  // (decisions item 2), and zeroing with the maximum deduction keeps their cap writes inert
  if (referralTimelockHandlers.length > 0) {
    const referralGov = govOf.get(referralVester) as string;
    const shared = legacyTargets.some((target) => target !== referralVester && govOf.get(target) === referralGov);
    if (shared) {
      notes[
        "step9_referral_timelock_handlers"
      ] = `not generated: the referral vester's gov ${referralGov} also governs the other legacy contracts, so revoking its contract handlers would strip operational keys; accept with ACCEPT_REFERRAL_TIMELOCK_HANDLERS=1 for the status gate (decisions item 2)`;
    } else {
      const live = await multiReadStrict(
        provider,
        referralTimelockHandlers.map(
          (h) => [referralGov, "isHandler(address) view returns (bool)", [h]] as [string, string, unknown[]]
        )
      );
      bundles["step9_referral_timelock_handlers"] = referralTimelockHandlers
        .filter((_, i) => live[i] === true)
        .map((h) =>
          makeAction(
            `revoke referral Timelock contract handler ${h}`,
            "referral Timelock admin",
            referralGov,
            "setContractHandler(address,bool)",
            [h, false]
          )
        );
      notes["step9_referral_timelock_handlers"] =
        "execute before zeroing, or record acceptance with ACCEPT_REFERRAL_TIMELOCK_HANDLERS=1 for the status gate; handlers already revoked are omitted";
    }
  }

  // fill live buffer and pending status per Timelock-executed action
  const paired = Object.values(bundles)
    .flat()
    .filter((a) => a.execution);
  const timelocks = [...new Set(paired.map((a) => a.execution!.timelock))];
  const buffers = await multiReadStrict(
    provider,
    timelocks.map((t) => [t, "buffer() view returns (uint256)", []] as [string, string, unknown[]])
  );
  const bufferOf = new Map(timelocks.map((t, i) => [t, buffers[i].toString()]));
  const etas = await multiReadStrict(
    provider,
    paired.map(
      (a) =>
        [a.execution!.timelock, "pendingActions(bytes32) view returns (uint256)", [a.execution!.actionHash]] as [
          string,
          string,
          unknown[]
        ]
    )
  );
  const now = (await provider.getBlock("latest")).timestamp;
  paired.forEach((a, i) => {
    const eta = etas[i];
    a.execution!.bufferSeconds = bufferOf.get(a.execution!.timelock) as string;
    a.execution!.pendingEta = eta.toString();
    a.execution!.status = eta.isZero() ? "unsignalled" : eta.lt(now) ? "executable" : "pending";
  });

  const result = {
    generatedAt: new Date().toISOString(),
    network: networkName,
    mainTimelock,
    unfilledHolders,
    incomplete,
    notes,
    bundles,
  };
  const outFile = writeOutFile("gov-actions.json", result);

  for (const [step, actions] of Object.entries(bundles)) {
    console.log(`\n${step} (${actions.length} actions):${notes[step] ? ` NOTE ${notes[step]}` : ""}`);
    for (const a of actions) {
      console.log(`  [${a.authority}] ${a.label}`);
      console.log(`      ${a.target} ${a.signature} ${JSON.stringify(a.args)}`);
      if (a.execution) {
        console.log(
          `      via ${a.execution.timelock} ${a.execution.signal.signature} -> ${a.execution.bufferSeconds}s -> ${a.execution.execute.signature} [${a.execution.status}]`
        );
      }
    }
  }
  for (const [step, note] of Object.entries(notes)) {
    if (!bundles[step]) {
      console.log(`\n${step} (no actions): NOTE ${note}`);
    }
  }
  if (unfilledHolders.length) {
    console.log(`\nUNFILLED role holders (step3_rolestore incomplete): ${unfilledHolders.join(", ")}`);
  }
  for (const line of incomplete) {
    console.log(`INCOMPLETE: ${line}`);
  }
  console.log(`\nwritten to ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
