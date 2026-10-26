import fs from "fs";
import path from "path";
import { ethers } from "ethers";

import { MULTICALL3 } from "./lib";

export const OUT_DIR = path.join(__dirname, "out");

export const ROLE_HASH = (role: string) =>
  ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], [role]));

export const INCENTIVE_FEATURE_BASES = [
  "INCENTIVE_VESTER_DEPOSIT_FEATURE_DISABLED",
  "INCENTIVE_VESTER_TRANSFER_FEATURE_DISABLED",
  "INCENTIVE_VESTER_CLAIM_FEATURE_DISABLED",
  "INCENTIVE_ISSUER_CLAIM_FEATURE_DISABLED",
  "SIGNAL_UNSTAKE_FEATURE_DISABLED",
];

export function getDeployment(networkName: string, name: string): { address: string } | undefined {
  const file = path.join(__dirname, "..", "..", "deployments", networkName, `${name}.json`);
  if (!fs.existsSync(file)) {
    return undefined;
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function readOutFile<T>(name: string): T | undefined {
  const file = path.join(OUT_DIR, name);
  if (!fs.existsSync(file)) {
    return undefined;
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeOutFile(name: string, value: unknown): string {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
}

// legacy Timelock actions execute as signal -> buffer -> execute pairs addressed to the
// Timelock; the action hash commits to the exact args and a duplicate signal reverts
export type TimelockExecution = {
  timelock: string;
  bufferSeconds: string;
  actionHash: string;
  pendingEta: string;
  status: "unsignalled" | "pending" | "executable";
  signal: { signature: string; args: unknown[]; calldata: string };
  execute: { signature: string; args: unknown[]; calldata: string };
};

export type GovAction = {
  label: string;
  authority: string;
  target: string;
  signature: string;
  args: unknown[];
  calldata: string;
  execution?: TimelockExecution;
  // seconds that must pass after the previous action in the bundle (a config timelock execute)
  delaySeconds?: string;
};

export function makeAction(
  label: string,
  authority: string,
  target: string,
  abiFragment: string,
  args: unknown[]
): GovAction {
  const iface = new ethers.utils.Interface([`function ${abiFragment}`]);
  const name = abiFragment.slice(0, abiFragment.indexOf("("));
  return {
    label,
    authority,
    target,
    signature: abiFragment,
    args,
    calldata: iface.encodeFunctionData(name, args),
  };
}

const TIMELOCK_PAIRS: { [kind: string]: { types: string[]; signature: string } } = {
  setHandler: { types: ["string", "address", "address", "bool"], signature: "(address,address,bool)" },
  setMinter: { types: ["string", "address", "address", "bool"], signature: "(address,address,bool)" },
  withdrawToken: {
    types: ["string", "address", "address", "address", "uint256"],
    signature: "(address,address,address,uint256)",
  },
};

export function makeTimelockExecution(
  kind: "setHandler" | "setMinter" | "withdrawToken",
  timelock: string,
  args: unknown[]
): TimelockExecution {
  const { types, signature } = TIMELOCK_PAIRS[kind];
  const signalName = `signal${kind[0].toUpperCase()}${kind.slice(1)}`;
  const signalFragment = `${signalName}${signature}`;
  const executeFragment = `${kind}${signature}`;
  const iface = new ethers.utils.Interface([`function ${signalFragment}`, `function ${executeFragment}`]);
  return {
    timelock,
    bufferSeconds: "",
    actionHash: ethers.utils.solidityKeccak256(types, [kind, ...(args as any[])]),
    pendingEta: "0",
    status: "unsignalled",
    signal: { signature: signalFragment, args, calldata: iface.encodeFunctionData(signalName, args) },
    execute: { signature: executeFragment, args, calldata: iface.encodeFunctionData(kind, args) },
  };
}

export type Gate = { name: string; ok: boolean | undefined; detail: string };

export function gate(name: string, ok: boolean | undefined, detail = ""): Gate {
  return { name, ok, detail };
}

export function printStep(step: string, gates: Gate[]): boolean {
  const okAll = gates.every((g) => g.ok === true);
  const anyUnknown = gates.some((g) => g.ok === undefined);
  const status = okAll ? "READY" : anyUnknown && gates.every((g) => g.ok !== false) ? "PENDING" : "BLOCKED";
  console.log(`\n[${status}] ${step}`);
  for (const g of gates) {
    const mark = g.ok === true ? "ok  " : g.ok === false ? "FAIL" : "?   ";
    console.log(`  ${mark} ${g.name}${g.detail ? ` (${g.detail})` : ""}`);
  }
  return okAll;
}

const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
];

// multiRead that throws on any failed call; use wherever a missing value must not
// silently read as zero
export async function multiReadStrict(
  provider: ethers.providers.Provider,
  entries: [string, string, unknown[]][],
  blockTag?: number
): Promise<any[]> {
  const results = await multiRead(provider, entries, blockTag);
  const failed = results.findIndex((v) => v === undefined);
  if (failed >= 0) {
    const [target, fragment] = entries[failed];
    throw new Error(`read failed: ${fragment} on ${target}${blockTag ? ` at block ${blockTag}` : ""}`);
  }
  return results;
}

// batched view calls via Multicall3: entries are [target, abiFragment, args]
export async function multiRead(
  provider: ethers.providers.Provider,
  entries: [string, string, unknown[]][],
  blockTag?: number
): Promise<any[]> {
  const multicall = new ethers.Contract(MULTICALL3, MULTICALL3_ABI, provider);
  const results: any[] = [];
  const batchSize = 500;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const calls = batch.map(([target, fragment, args]) => {
      const iface = new ethers.utils.Interface([`function ${fragment}`]);
      const name = fragment.slice(0, fragment.indexOf("("));
      return { target, allowFailure: true, callData: iface.encodeFunctionData(name, args) };
    });
    const raw = await multicall.callStatic.aggregate3(calls, blockTag ? { blockTag } : {});
    for (let j = 0; j < batch.length; j++) {
      if (!raw[j].success || raw[j].returnData === "0x") {
        results.push(undefined);
        continue;
      }
      const [, fragment] = batch[j];
      const iface = new ethers.utils.Interface([`function ${fragment}`]);
      const name = fragment.slice(0, fragment.indexOf("("));
      results.push(iface.decodeFunctionResult(name, raw[j].returnData)[0]);
    }
  }
  return results;
}
