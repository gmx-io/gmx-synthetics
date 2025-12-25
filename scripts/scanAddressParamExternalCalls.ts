/**
 * Bytecode scanner: address-parameter external call targets
 *
 * Scans deployed *runtime* bytecode to find ABI functions where an `address` parameter
 * may flow into an external interaction opcode (CALL/DELEGATECALL/STATICCALL/CALLCODE/SELFDESTRUCT).
 *
 * Inputs:
 * - Reads `deployments/<DEPLOYMENT_NETWORK>/*.json` (Hardhat Deploy format).
 * - Uses `abi` + `deployedBytecode` from each deployment file.
 * - No RPC required.
 *
 * Run:
 * - `./node_modules/.bin/hardhat run --no-compile scripts/scanAddressParamExternalCalls.ts --network arbitrum`
 *
 * Optional filters:
 * - `CONTRACT_FILTER=Config`   Only scan deployment filenames containing this substring.
 * - `FUNCTION_FILTER=set`      Only scan ABI function names containing this substring.
 *
 * Guard check:
 * - View / pure functions are ignored.
 * - For each remaining match, the script parses Solidity modifiers from the deployment metadata and fails if
 *   a function has neither an allow-listed access-control modifier nor a reentrancy guard.
 *
 * Debug / inconclusive output:
 * - `PRINT_INCONCLUSIVE=1`     Print functions where analysis hit safety limits.
 *
 * Tuning (reduce "inconclusive", may use more RAM/CPU):
 * - `NODE_OPTIONS="--max-old-space-size=8192"`
 * - `SCAN_MAX_STATE_UPDATES=200000 SCAN_MAX_STEPS=400000`
 *
 * Notes:
 * - This is best-effort static analysis; false positives/negatives are possible.
 * - "inconclusive" usually means the analysis hit `SCAN_MAX_STATE_UPDATES` or `SCAN_MAX_STEPS`.
 */
import fs from "fs";
import path from "path";
import hre from "hardhat";
import { FormatTypes, FunctionFragment, Interface } from "@ethersproject/abi";

type DeploymentJson = { abi?: unknown; deployedBytecode?: string; metadata?: string };

type Invocation = { name: string; text: string };

type Instruction = {
  pc: number;
  opcode: number;
  name: string;
  pushData?: string;
  pushValue?: bigint;
};

type StackValue = {
  taint: bigint;
  consts?: bigint[];
};

function getEnvInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}=${raw}, expected a positive integer`);
  }
  return parsed;
}

const MAX_CONSTS = getEnvInt("SCAN_MAX_CONSTS", 4);
const MAX_STACK_TRACKED = getEnvInt("SCAN_MAX_STACK_TRACKED", 64);
const MAX_STATE_UPDATES = getEnvInt("SCAN_MAX_STATE_UPDATES", 25_000);
const MAX_STEPS = getEnvInt("SCAN_MAX_STEPS", 150_000);

// Explicit allow-list of access control modifiers.
// Important: we intentionally do NOT match on a generic "only*" prefix to avoid accidentally excluding
// newly-added modifiers whose semantics might be weaker than expected.
const ACCESS_CONTROL_MODIFIERS = new Set<string>([
  // RoleModule
  "onlySelfOrController",
  "onlySelf",
  "onlyTimelockMultisig",
  "onlyTimelockAdmin",
  "onlyConfigKeeper",
  "onlyLimitedConfigKeeper",
  "onlyController",
  "onlyGovTokenController",
  "onlyRouterPlugin",
  "onlyMarketKeeper",
  "onlyFeeKeeper",
  "onlyFeeDistributionKeeper",
  "onlyOrderKeeper",
  "onlyPricingKeeper",
  "onlyLiquidationKeeper",
  "onlyAdlKeeper",
  "onlyContributorKeeper",
  "onlyContributorDistributor",
  "onlyClaimAdmin",
  "onlyMultichainReader",
  // OpenZeppelin TimelockController / Governor
  "onlyRoleOrOpenRole",
  "onlyGovernance",
]);

const MASK_256 = (1n << 256n) - 1n;
const toU256 = (value: bigint) => value & MASK_256;

function uniqBigints(values: bigint[]): bigint[] {
  const set = new Set(values.map((x) => x.toString()));
  const out = Array.from(set).map((x) => BigInt(x));
  out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

function mergeConsts(a?: bigint[], b?: bigint[]): bigint[] | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  const merged = uniqBigints([...a, ...b]);
  if (merged.length > MAX_CONSTS) return undefined;
  return merged;
}

function combineConsts(a?: bigint[], b?: bigint[], op?: (x: bigint, y: bigint) => bigint): bigint[] | undefined {
  if (!a || !b || !op) return undefined;
  const out: bigint[] = [];
  for (const x of a) {
    for (const y of b) {
      out.push(toU256(op(x, y)));
      if (out.length > MAX_CONSTS) return undefined;
    }
  }
  return uniqBigints(out);
}

function unaryConsts(a?: bigint[], op?: (x: bigint) => bigint): bigint[] | undefined {
  if (!a || !op) return undefined;
  const out = a.map((x) => toU256(op(x)));
  return uniqBigints(out);
}

function popOrUnknown(stack: StackValue[]): StackValue {
  return stack.pop() ?? { taint: 0n };
}

function peekFromTop(stack: StackValue[], indexFromTop: number): StackValue {
  const index = stack.length - 1 - indexFromTop;
  return index >= 0 ? stack[index] : { taint: 0n };
}

function normalizeStack(stack: StackValue[]): StackValue[] {
  if (stack.length <= MAX_STACK_TRACKED) return stack;
  return stack.slice(stack.length - MAX_STACK_TRACKED);
}

function opcodeName(opcode: number): string {
  if (opcode === 0x5f) return "PUSH0";
  if (opcode >= 0x60 && opcode <= 0x7f) return `PUSH${opcode - 0x5f}`;
  if (opcode >= 0x80 && opcode <= 0x8f) return `DUP${opcode - 0x7f}`;
  if (opcode >= 0x90 && opcode <= 0x9f) return `SWAP${opcode - 0x8f}`;
  if (opcode >= 0xa0 && opcode <= 0xa4) return `LOG${opcode - 0xa0}`;

  switch (opcode) {
    case 0x00:
      return "STOP";
    case 0x01:
      return "ADD";
    case 0x02:
      return "MUL";
    case 0x03:
      return "SUB";
    case 0x04:
      return "DIV";
    case 0x05:
      return "SDIV";
    case 0x06:
      return "MOD";
    case 0x07:
      return "SMOD";
    case 0x08:
      return "ADDMOD";
    case 0x09:
      return "MULMOD";
    case 0x0a:
      return "EXP";
    case 0x0b:
      return "SIGNEXTEND";
    case 0x10:
      return "LT";
    case 0x11:
      return "GT";
    case 0x12:
      return "SLT";
    case 0x13:
      return "SGT";
    case 0x14:
      return "EQ";
    case 0x15:
      return "ISZERO";
    case 0x16:
      return "AND";
    case 0x17:
      return "OR";
    case 0x18:
      return "XOR";
    case 0x19:
      return "NOT";
    case 0x1a:
      return "BYTE";
    case 0x1b:
      return "SHL";
    case 0x1c:
      return "SHR";
    case 0x1d:
      return "SAR";
    case 0x20:
      return "SHA3";
    case 0x30:
      return "ADDRESS";
    case 0x31:
      return "BALANCE";
    case 0x32:
      return "ORIGIN";
    case 0x33:
      return "CALLER";
    case 0x34:
      return "CALLVALUE";
    case 0x35:
      return "CALLDATALOAD";
    case 0x36:
      return "CALLDATASIZE";
    case 0x37:
      return "CALLDATACOPY";
    case 0x38:
      return "CODESIZE";
    case 0x39:
      return "CODECOPY";
    case 0x3a:
      return "GASPRICE";
    case 0x3b:
      return "EXTCODESIZE";
    case 0x3c:
      return "EXTCODECOPY";
    case 0x3d:
      return "RETURNDATASIZE";
    case 0x3e:
      return "RETURNDATACOPY";
    case 0x3f:
      return "EXTCODEHASH";
    case 0x40:
      return "BLOCKHASH";
    case 0x41:
      return "COINBASE";
    case 0x42:
      return "TIMESTAMP";
    case 0x43:
      return "NUMBER";
    case 0x44:
      return "PREVRANDAO";
    case 0x45:
      return "GASLIMIT";
    case 0x46:
      return "CHAINID";
    case 0x47:
      return "SELFBALANCE";
    case 0x48:
      return "BASEFEE";
    case 0x50:
      return "POP";
    case 0x51:
      return "MLOAD";
    case 0x52:
      return "MSTORE";
    case 0x53:
      return "MSTORE8";
    case 0x54:
      return "SLOAD";
    case 0x55:
      return "SSTORE";
    case 0x56:
      return "JUMP";
    case 0x57:
      return "JUMPI";
    case 0x58:
      return "PC";
    case 0x59:
      return "MSIZE";
    case 0x5a:
      return "GAS";
    case 0x5b:
      return "JUMPDEST";
    case 0xf0:
      return "CREATE";
    case 0xf1:
      return "CALL";
    case 0xf2:
      return "CALLCODE";
    case 0xf3:
      return "RETURN";
    case 0xf4:
      return "DELEGATECALL";
    case 0xf5:
      return "CREATE2";
    case 0xfa:
      return "STATICCALL";
    case 0xfd:
      return "REVERT";
    case 0xfe:
      return "INVALID";
    case 0xff:
      return "SELFDESTRUCT";
    default:
      return `OP_${opcode.toString(16).padStart(2, "0")}`;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) throw new Error("Invalid hex string length");
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  if (bytes.length === 0) return 0n;
  return BigInt("0x" + Buffer.from(bytes).toString("hex"));
}

function disassemble(bytecode: Uint8Array): Instruction[] {
  const instructions: Instruction[] = [];
  for (let pc = 0; pc < bytecode.length; ) {
    const opcode = bytecode[pc];
    const name = opcodeName(opcode);
    if (opcode === 0x5f) {
      instructions.push({ pc, opcode, name, pushData: "", pushValue: 0n });
      pc += 1;
      continue;
    }

    if (opcode >= 0x60 && opcode <= 0x7f) {
      const len = opcode - 0x5f;
      const data = bytecode.slice(pc + 1, pc + 1 + len);
      const pushData = Buffer.from(data).toString("hex");
      const pushValue = bytesToBigInt(data);
      instructions.push({ pc, opcode, name, pushData, pushValue });
      pc += 1 + len;
      continue;
    }

    instructions.push({ pc, opcode, name });
    pc += 1;
  }
  return instructions;
}

function findSelectorEntrypoints(instructions: Instruction[], jumpdests: Set<number>): Map<string, number> {
  const map = new Map<string, number>();

  for (let i = 0; i < instructions.length; i++) {
    const instr = instructions[i];
    if (instr.name !== "PUSH4" || !instr.pushData) continue;

    const selector = ("0x" + instr.pushData.padStart(8, "0")).toLowerCase();

    // Heuristic match of the common dispatcher pattern:
    // ... PUSH4 <sel> EQ PUSHn <dest> JUMPI
    let eqIndex = -1;
    for (let j = i + 1; j < Math.min(i + 12, instructions.length); j++) {
      if (instructions[j].name === "EQ") {
        eqIndex = j;
        break;
      }
    }
    if (eqIndex === -1) continue;

    for (let k = eqIndex + 1; k < Math.min(eqIndex + 12, instructions.length - 1); k++) {
      const maybePush = instructions[k];
      if (!maybePush.name.startsWith("PUSH") || maybePush.pushValue === undefined) continue;
      const maybeJumpi = instructions[k + 1];
      if (!maybeJumpi || maybeJumpi.name !== "JUMPI") continue;

      const dest = Number(maybePush.pushValue);
      if (jumpdests.has(dest)) {
        map.set(selector, dest);
      }
      break;
    }
  }

  return map;
}

function mergeValue(existing: StackValue, incoming: StackValue): { merged: StackValue; changed: boolean } {
  const mergedTaint = existing.taint | incoming.taint;
  const mergedConsts = mergeConsts(existing.consts, incoming.consts);
  const changed =
    mergedTaint !== existing.taint || (existing.consts ?? []).join(",") !== (mergedConsts ?? []).join(",");
  return { merged: { taint: mergedTaint, consts: mergedConsts }, changed };
}

function mergeStack(existing: StackValue[], incoming: StackValue[]): { merged: StackValue[]; changed: boolean } {
  if (existing.length !== incoming.length) {
    return { merged: incoming, changed: true };
  }

  let changed = false;
  const merged = existing.map((value, i) => {
    const res = mergeValue(value, incoming[i]);
    if (res.changed) changed = true;
    return res.merged;
  });

  return { merged, changed };
}

type AnalysisResult = {
  usedParamBits: bigint;
  status: "found" | "not_found" | "incomplete";
  reason?: "max_steps" | "max_state_updates";
  steps: number;
  stateUpdates: number;
};

function analyzeFunctionForAddressParamExternalCalls(params: {
  instructions: Instruction[];
  pcToIndex: Map<number, number>;
  jumpdests: Set<number>;
  entryPc: number;
  addressParamOffsets: Map<bigint, bigint>;
}): AnalysisResult {
  const { instructions, pcToIndex, jumpdests, entryPc, addressParamOffsets } = params;
  const entryIndex = pcToIndex.get(entryPc);
  if (entryIndex === undefined) return { usedParamBits: 0n, status: "not_found", steps: 0, stateUpdates: 0 };

  const visited = new Map<number, Map<number, StackValue[]>>();
  const worklist: Array<{ index: number; stack: StackValue[] }> = [];
  let aborted = false;
  let abortReason: AnalysisResult["reason"];
  let stateUpdates = 0;

  const enqueue = (index: number, stack: StackValue[]) => {
    if (aborted) return;
    if (index < 0 || index >= instructions.length) return;
    const normalized = normalizeStack(stack);

    const byDepth = visited.get(index) ?? new Map<number, StackValue[]>();
    const depth = normalized.length;
    const existing = byDepth.get(depth);

    if (!existing) {
      byDepth.set(depth, normalized);
      visited.set(index, byDepth);
      worklist.push({ index, stack: normalized });
      if (++stateUpdates > MAX_STATE_UPDATES) {
        aborted = true;
        abortReason = "max_state_updates";
      }
      return;
    }

    const merged = mergeStack(existing, normalized);
    if (merged.changed) {
      byDepth.set(depth, merged.merged);
      visited.set(index, byDepth);
      worklist.push({ index, stack: merged.merged });
      if (++stateUpdates > MAX_STATE_UPDATES) {
        aborted = true;
        abortReason = "max_state_updates";
      }
    }
  };

  // At the dispatcher jump target the selector is commonly still on the stack.
  // Enqueue both empty and 1-unknown stack variants to reduce false negatives.
  enqueue(entryIndex, []);
  enqueue(entryIndex, [{ taint: 0n }]);

  let usedParamBits = 0n;
  let steps = 0;

  while (worklist.length > 0) {
    if (aborted) return { usedParamBits, status: "incomplete", reason: abortReason, steps, stateUpdates };
    if (steps++ > MAX_STEPS) return { usedParamBits, status: "incomplete", reason: "max_steps", steps, stateUpdates };

    const { index, stack } = worklist.pop()!;
    const instr = instructions[index];

    const next = (newStack: StackValue[]) => enqueue(index + 1, newStack);

    switch (instr.name) {
      case "STOP":
      case "RETURN":
      case "REVERT":
      case "INVALID":
        break;

      case "JUMP": {
        const destVal = popOrUnknown([...stack]);
        const dests = destVal.consts ?? [];
        for (const dest of dests) {
          const destPc = Number(dest);
          if (!jumpdests.has(destPc)) continue;
          const destIndex = pcToIndex.get(destPc);
          if (destIndex !== undefined) {
            enqueue(destIndex, stack.slice(0, -1));
          }
        }
        break;
      }

      case "JUMPI": {
        const working = [...stack];
        const destVal = popOrUnknown(working);
        popOrUnknown(working); // condition

        // Fallthrough
        enqueue(index + 1, working);

        // Jump branch(es) if resolvable
        const dests = destVal.consts ?? [];
        for (const dest of dests) {
          const destPc = Number(dest);
          if (!jumpdests.has(destPc)) continue;
          const destIndex = pcToIndex.get(destPc);
          if (destIndex !== undefined) {
            enqueue(destIndex, working);
          }
        }
        break;
      }

      case "PUSH0":
        next([...stack, { taint: 0n, consts: [0n] }]);
        break;

      default:
        if (instr.name.startsWith("PUSH") && instr.pushValue !== undefined) {
          next([...stack, { taint: 0n, consts: [instr.pushValue] }]);
          break;
        }

        if (instr.name.startsWith("DUP")) {
          const n = parseInt(instr.name.slice(3), 10);
          const value = peekFromTop(stack, n - 1);
          next([...stack, value]);
          break;
        }

        if (instr.name.startsWith("SWAP")) {
          const n = parseInt(instr.name.slice(4), 10);
          const newStack = [...stack];
          const topIndex = newStack.length - 1;
          const swapIndex = newStack.length - 1 - n;
          if (topIndex >= 0 && swapIndex >= 0) {
            const tmp = newStack[topIndex];
            newStack[topIndex] = newStack[swapIndex];
            newStack[swapIndex] = tmp;
          }
          next(newStack);
          break;
        }

        if (instr.name.startsWith("LOG")) {
          const topics = parseInt(instr.name.slice(3), 10);
          const newStack = [...stack];
          for (let i = 0; i < 2 + topics; i++) popOrUnknown(newStack);
          next(newStack);
          break;
        }

        // --- Stack-mutating opcodes ---
        switch (instr.name) {
          case "POP": {
            const newStack = [...stack];
            popOrUnknown(newStack);
            next(newStack);
            break;
          }

          case "ISZERO":
          case "NOT": {
            const newStack = [...stack];
            const a = popOrUnknown(newStack);
            const consts =
              instr.name === "NOT"
                ? unaryConsts(a.consts, (x) => toU256(~x))
                : unaryConsts(a.consts, (x) => (x === 0n ? 1n : 0n));
            newStack.push({ taint: instr.name === "NOT" ? a.taint : 0n, consts });
            next(newStack);
            break;
          }

          case "ADD":
          case "SUB":
          case "MUL":
          case "DIV":
          case "MOD":
          case "AND":
          case "OR":
          case "XOR":
          case "SHL":
          case "SHR":
          case "SAR":
          case "EXP": {
            const newStack = [...stack];
            const a = popOrUnknown(newStack);
            const b = popOrUnknown(newStack);
            const taint = a.taint | b.taint;

            const opMap: Record<string, (x: bigint, y: bigint) => bigint> = {
              ADD: (x, y) => x + y,
              SUB: (x, y) => x - y,
              MUL: (x, y) => x * y,
              DIV: (x, y) => (y === 0n ? 0n : x / y),
              MOD: (x, y) => (y === 0n ? 0n : x % y),
              AND: (x, y) => x & y,
              OR: (x, y) => x | y,
              XOR: (x, y) => x ^ y,
              SHL: (x, y) => (x >= 256n ? 0n : toU256(y << x)),
              SHR: (x, y) => (x >= 256n ? 0n : y >> x),
              SAR: (x, y) => (x >= 256n ? (y >> 255n) * MASK_256 : y >> x),
              EXP: (x, y) => x ** y,
            };

            const consts = combineConsts(a.consts, b.consts, opMap[instr.name]);
            newStack.push({ taint, consts });
            next(newStack);
            break;
          }

          case "EQ":
          case "LT":
          case "GT":
          case "SLT":
          case "SGT": {
            const newStack = [...stack];
            const a = popOrUnknown(newStack);
            const b = popOrUnknown(newStack);
            const opMap: Record<string, (x: bigint, y: bigint) => bigint> = {
              EQ: (x, y) => (x === y ? 1n : 0n),
              LT: (x, y) => (x < y ? 1n : 0n),
              GT: (x, y) => (x > y ? 1n : 0n),
              SLT: (x, y) => (x < y ? 1n : 0n),
              SGT: (x, y) => (x > y ? 1n : 0n),
            };
            const consts = combineConsts(a.consts, b.consts, opMap[instr.name]);
            newStack.push({ taint: 0n, consts });
            next(newStack);
            break;
          }

          case "SHA3": {
            const newStack = [...stack];
            popOrUnknown(newStack);
            popOrUnknown(newStack);
            newStack.push({ taint: 0n });
            next(newStack);
            break;
          }

          case "CALLDATALOAD": {
            const newStack = [...stack];
            const offset = popOrUnknown(newStack);
            let taint = 0n;
            for (const off of offset.consts ?? []) {
              const bit = addressParamOffsets.get(off);
              if (bit !== undefined) taint |= bit;
            }
            newStack.push({ taint });
            next(newStack);
            break;
          }

          case "CALLDATACOPY":
          case "CODECOPY":
          case "RETURNDATACOPY": {
            const newStack = [...stack];
            popOrUnknown(newStack);
            popOrUnknown(newStack);
            popOrUnknown(newStack);
            next(newStack);
            break;
          }

          case "EXTCODECOPY": {
            const newStack = [...stack];
            popOrUnknown(newStack);
            popOrUnknown(newStack);
            popOrUnknown(newStack);
            popOrUnknown(newStack);
            next(newStack);
            break;
          }

          case "MSTORE":
          case "MSTORE8":
          case "SSTORE": {
            const newStack = [...stack];
            popOrUnknown(newStack);
            popOrUnknown(newStack);
            next(newStack);
            break;
          }

          case "MLOAD":
          case "SLOAD":
          case "BALANCE":
          case "EXTCODESIZE":
          case "EXTCODEHASH": {
            const newStack = [...stack];
            popOrUnknown(newStack);
            newStack.push({ taint: 0n });
            next(newStack);
            break;
          }

          case "ADDRESS":
          case "ORIGIN":
          case "CALLER":
          case "CALLVALUE":
          case "CALLDATASIZE":
          case "CODESIZE":
          case "RETURNDATASIZE":
          case "GASPRICE":
          case "BLOCKHASH":
          case "COINBASE":
          case "TIMESTAMP":
          case "NUMBER":
          case "PREVRANDAO":
          case "GASLIMIT":
          case "CHAINID":
          case "SELFBALANCE":
          case "BASEFEE":
          case "PC":
          case "MSIZE":
          case "GAS": {
            next([...stack, { taint: 0n }]);
            break;
          }

          case "CALL":
          case "CALLCODE":
          case "DELEGATECALL":
          case "STATICCALL": {
            const to = peekFromTop(stack, 1);
            if (to.taint !== 0n) {
              usedParamBits |= to.taint;
              return { usedParamBits, status: "found", steps, stateUpdates };
            }

            const newStack = [...stack];
            const pops = instr.name === "CALL" || instr.name === "CALLCODE" ? 7 : 6;
            for (let i = 0; i < pops; i++) popOrUnknown(newStack);
            newStack.push({ taint: 0n });
            next(newStack);
            break;
          }

          case "SELFDESTRUCT": {
            const to = peekFromTop(stack, 0);
            if (to.taint !== 0n) {
              usedParamBits |= to.taint;
              return { usedParamBits, status: "found", steps, stateUpdates };
            }
            break;
          }

          case "CREATE": {
            const newStack = [...stack];
            popOrUnknown(newStack);
            popOrUnknown(newStack);
            popOrUnknown(newStack);
            newStack.push({ taint: 0n });
            next(newStack);
            break;
          }

          case "CREATE2": {
            const newStack = [...stack];
            popOrUnknown(newStack);
            popOrUnknown(newStack);
            popOrUnknown(newStack);
            popOrUnknown(newStack);
            newStack.push({ taint: 0n });
            next(newStack);
            break;
          }

          case "JUMPDEST": {
            next([...stack]);
            break;
          }

          default: {
            // Unknown opcode: keep going without changing the stack.
            // This is a best-effort scanner; unsupported opcodes may cause false negatives.
            next([...stack]);
            break;
          }
        }
    }
  }

  return { usedParamBits, status: "not_found", steps, stateUpdates };
}

function formatFunctionSignature(fragment: FunctionFragment): string {
  const formattedInputs = fragment.inputs
    .map((p) => (p.name ? `${p.format(FormatTypes.sighash)} ${p.name}` : p.format(FormatTypes.sighash)))
    .join(", ");
  return `${fragment.name}(${formattedInputs})`;
}

type FunctionGuards = {
  resolved: boolean;
  modifierNames: string[];
  hasAllowedAccessControl: boolean;
  hasReentrancyGuard: boolean;
  resolution?: string;
  error?: string;
};

type SourceCandidate = {
  sourceName: string;
  header: string;
  score: number;
  isPreferred: boolean;
  isImplemented: boolean;
};

// Mask a range with spaces but preserve newlines to keep indices & line numbers stable.
function maskRange(src: string, start: number, end: number): string {
  const before = src.slice(0, start);
  const mid = src.slice(start, end).replace(/[^\n]/g, " ");
  const after = src.slice(end);
  return before + mid + after;
}

// Strip comments and string literals (preserving newlines). This makes "search for function headers" much safer.
function stripNoise(src: string): string {
  let out = src;

  // Block comments /* ... */
  const block = /\/\*[\s\S]*?\*\//g;
  let m: RegExpExecArray | null;
  while ((m = block.exec(out))) out = maskRange(out, m.index, m.index + m[0].length);

  // Line comments //...
  const line = /\/\/[^\n\r]*/g;
  while ((m = line.exec(out))) out = maskRange(out, m.index, m.index + m[0].length);

  // String literals (optional 'unicode' prefix)
  const str = /\bunicode\s*("([^"\\]|\\.|\\\n)*"|'([^'\\]|\\.|\\\n)*')|("([^"\\]|\\.|\\\n)*"|'([^'\\]|\\.|\\\n)*')/g;
  while ((m = str.exec(out))) out = maskRange(out, m.index, m.index + m[0].length);

  return out;
}

function splitTopLevelCommaList(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

function normalizeSolidityType(type: string): string {
  // Normalize common aliases used in Solidity source.
  // - uint -> uint256, int -> int256
  // - byte -> bytes1
  return type
    .replace(/^uint(?=$|\[)/, "uint256")
    .replace(/^int(?=$|\[)/, "int256")
    .replace(/^byte(?=$|\[)/, "bytes1");
}

function isComplexType(type: string): boolean {
  // ABI prints tuples as "(...)" / "((...),...)" which won't match Solidity struct names.
  return type.includes("(") || type.includes(")");
}

function escapeRegExp(value: string): string {
  // Escape regex-special characters (Solidity identifiers can contain "$").
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractFunctionHeaderAt(
  source: string,
  functionIndex: number
): { header: string; isImplemented: boolean } | undefined {
  // Slice from "function" up to the first "{" or ";" that appears at top-level parentheses depth.
  // This includes modifiers (e.g. "nonReentrant onlyController") which is exactly what we need.
  let depth = 0;
  let end = -1;
  for (let i = functionIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if ((ch === "{" || ch === ";") && depth === 0) {
      end = i;
      break;
    }
  }
  if (end === -1) return undefined;
  const terminator = source[end];
  const isImplemented = terminator === "{";
  const header = source.slice(functionIndex, end).replace(/\s+/g, " ").trim();
  return { header, isImplemented };
}

function parseParamTypesFromHeader(header: string): string[] {
  const openParenIdx = header.indexOf("(");
  if (openParenIdx === -1) return [];

  // Find the end of the parameter list (balanced parentheses).
  let depth = 0;
  let closeParenIdx = -1;
  for (let i = openParenIdx; i < header.length; i++) {
    const ch = header[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        closeParenIdx = i;
        break;
      }
    }
  }
  if (closeParenIdx === -1) return [];

  const paramsRaw = header.slice(openParenIdx + 1, closeParenIdx).trim();
  if (paramsRaw === "") return [];

  return splitTopLevelCommaList(paramsRaw).map((p) => {
    const tokens = p.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return "";

    // e.g. "contract DataStore dataStore"
    let idx = 0;
    if (tokens[idx] === "contract" || tokens[idx] === "struct") idx++;
    let typeToken = tokens[idx] || "";

    // e.g. "address payable receiver"
    if (typeToken === "address" && tokens[idx + 1] === "payable") typeToken = "address";

    return normalizeSolidityType(typeToken);
  });
}

function functionNameFromSignature(signature: string): string {
  const idx = signature.indexOf("(");
  return (idx === -1 ? signature : signature.slice(0, idx)).trim();
}

function parseInvocationsFromHeader(header: string): Invocation[] {
  // Extract modifier invocations from a normalized Solidity function header.
  // Example:
  //   function foo(...) external nonReentrant onlyRoleOrOpenRole(EXECUTOR_ROLE)
  // becomes:
  //   [{name:"nonReentrant", text:"nonReentrant"}, {name:"onlyRoleOrOpenRole", text:"onlyRoleOrOpenRole(EXECUTOR_ROLE)"}]
  const fnIdx = header.indexOf("function");
  const openParenIdx = header.indexOf("(", fnIdx === -1 ? 0 : fnIdx);
  if (openParenIdx === -1) return [];

  // Find the end of the parameter list.
  let depth = 0;
  let closeParenIdx = -1;
  for (let i = openParenIdx; i < header.length; i++) {
    const ch = header[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        closeParenIdx = i;
        break;
      }
    }
  }
  if (closeParenIdx === -1) return [];

  const tail = header.slice(closeParenIdx + 1);
  const invocations: Invocation[] = [];
  let i = 0;

  const keywords = new Set([
    "external",
    "public",
    "internal",
    "private",
    "view",
    "pure",
    "payable",
    "virtual",
    "override",
    "returns",
    "memory",
    "calldata",
    "storage",
  ]);

  while (i < tail.length) {
    while (i < tail.length && /\s/.test(tail[i])) i++;
    if (i >= tail.length) break;

    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(tail.slice(i));
    if (!m) {
      i++;
      continue;
    }
    const name = m[0];
    i += name.length;

    // Stop at returns(...) — everything after is return types.
    if (name === "returns") break;

    // Parse optional modifier arguments: name(...)
    while (i < tail.length && /\s/.test(tail[i])) i++;
    if (i < tail.length && tail[i] === "(") {
      const startParen = i;
      let d = 0;
      i = startParen;
      while (i < tail.length) {
        const ch = tail[i];
        if (ch === "(") d++;
        else if (ch === ")") {
          d--;
          if (d === 0) {
            i++;
            break;
          }
        }
        i++;
      }
      const parens = tail.slice(startParen, i);
      const text = `${name}${parens}`.trim();
      if (!keywords.has(name)) invocations.push({ name, text });
    } else {
      if (!keywords.has(name)) invocations.push({ name, text: name });
    }
  }

  return invocations;
}

function getCompilationTargetSourceName(metadata: any): string | undefined {
  const compilationTarget = metadata?.settings?.compilationTarget;
  if (!compilationTarget || typeof compilationTarget !== "object") return undefined;
  const keys = Object.keys(compilationTarget);
  return keys.length > 0 ? keys[0] : undefined;
}

function scoreTypes(expectedTypes: string[], actualTypes: string[]): { ok: boolean; score: number } {
  // Only compare "simple" types. If the ABI type is a tuple, the Solidity source will likely use a struct name.
  // In that case, we treat it as "don't care" and do not score it.
  if (expectedTypes.length !== actualTypes.length) return { ok: false, score: 0 };
  let score = 0;
  for (let i = 0; i < expectedTypes.length; i++) {
    const expected = normalizeSolidityType(expectedTypes[i]);
    const actual = normalizeSolidityType(actualTypes[i]);
    if (isComplexType(expected) || isComplexType(actual)) continue;
    if (expected === "" || actual === "") continue;
    if (expected !== actual) return { ok: false, score: 0 };
    score++;
  }
  return { ok: true, score };
}

function findBestFunctionHeaderFromMetadata(params: {
  metadata: any;
  functionName: string;
  expectedTypes: string[];
  cleanCache: Map<string, string>;
}): SourceCandidate | undefined {
  const { metadata, functionName, expectedTypes, cleanCache } = params;
  const sources = metadata?.sources;
  if (!sources || typeof sources !== "object") return undefined;

  const preferredSourceName = getCompilationTargetSourceName(metadata);
  const sourceNames = Object.keys(sources);
  // Prefer the compilation target (where overrides live), but still scan everything (inherited functions live elsewhere).
  sourceNames.sort((a, b) => {
    const pa = a === preferredSourceName ? 0 : 1;
    const pb = b === preferredSourceName ? 0 : 1;
    return pa - pb || a.localeCompare(b);
  });

  let best: SourceCandidate | undefined;
  const re = new RegExp(`\\bfunction\\s+${escapeRegExp(functionName)}\\s*\\(`, "g");

  for (const sourceName of sourceNames) {
    const content = sources[sourceName]?.content;
    if (typeof content !== "string") continue;

    let clean = cleanCache.get(sourceName);
    if (!clean) {
      clean = stripNoise(content);
      cleanCache.set(sourceName, clean);
    }

    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean))) {
      const extracted = extractFunctionHeaderAt(clean, m.index);
      if (!extracted) continue;
      const { header, isImplemented } = extracted;
      if (!/\b(public|external)\b/.test(header)) continue;

      const actualTypes = parseParamTypesFromHeader(header);
      if (actualTypes.length !== expectedTypes.length) continue;

      const { ok, score } = scoreTypes(expectedTypes, actualTypes);
      if (!ok) continue;

      const isPreferred = sourceName === preferredSourceName;
      const candidate: SourceCandidate = { sourceName, header, score, isPreferred, isImplemented };

      if (!best) {
        best = candidate;
        continue;
      }
      // Prefer compilationTarget, then higher match score.
      if (best.isPreferred !== candidate.isPreferred) {
        if (candidate.isPreferred) best = candidate;
        continue;
      }
      // Prefer implemented functions (interface / abstract declarations can have the same name/types).
      if (best.isImplemented !== candidate.isImplemented) {
        if (candidate.isImplemented) best = candidate;
        continue;
      }
      if (candidate.score > best.score) best = candidate;
    }
  }

  return best;
}

function checkFunctionGuardsFromDeploymentMetadata(params: {
  contractName: string;
  deployment: DeploymentJson;
  fragment: FunctionFragment;
  cleanCache: Map<string, string>;
}): FunctionGuards {
  const { contractName, deployment, fragment, cleanCache } = params;

  if (!deployment.metadata || typeof deployment.metadata !== "string") {
    return {
      resolved: false,
      modifierNames: [],
      hasAllowedAccessControl: false,
      hasReentrancyGuard: false,
      error: `Missing deployment.metadata for ${contractName}`,
    };
  }

  let metadata: any;
  try {
    metadata = JSON.parse(deployment.metadata);
  } catch (e: any) {
    return {
      resolved: false,
      modifierNames: [],
      hasAllowedAccessControl: false,
      hasReentrancyGuard: false,
      error: `Failed to parse deployment.metadata for ${contractName}: ${e?.message || e}`,
    };
  }

  const expectedTypes = fragment.inputs.map((p) => normalizeSolidityType(p.format(FormatTypes.sighash)));
  const best = findBestFunctionHeaderFromMetadata({
    metadata,
    functionName: fragment.name,
    expectedTypes,
    cleanCache,
  });

  if (!best) {
    return {
      resolved: false,
      modifierNames: [],
      hasAllowedAccessControl: false,
      hasReentrancyGuard: false,
      error: `Could not resolve Solidity function header for ${contractName}.${fragment.name} from deployment metadata`,
    };
  }

  const invocations = parseInvocationsFromHeader(best.header);
  const modifierNames = Array.from(new Set(invocations.map((i) => i.name))).sort();

  const hasReentrancyGuard = modifierNames.includes("nonReentrant") || modifierNames.includes("globalNonReentrant");
  const hasAllowedAccessControl = modifierNames.some((m) => ACCESS_CONTROL_MODIFIERS.has(m));

  return {
    resolved: true,
    modifierNames,
    hasAllowedAccessControl,
    hasReentrancyGuard,
    resolution: `metadata:${best.sourceName}`,
  };
}

async function main() {
  const deploymentNetwork = process.env.DEPLOYMENT_NETWORK || process.env.DEPLOYMENTS_NETWORK || hre.network.name;
  const deploymentsDir = path.resolve(process.cwd(), "deployments", deploymentNetwork);
  const printInconclusive = process.env.PRINT_INCONCLUSIVE === "1" || process.env.PRINT_INCONCLUSIVE === "true";
  const contractFilter = process.env.CONTRACT_FILTER;
  const functionFilter = process.env.FUNCTION_FILTER;

  process.stdout.on("error", (err: any) => {
    if (err?.code === "EPIPE") process.exit(0);
  });

  if (!fs.existsSync(deploymentsDir)) {
    throw new Error(`Deployments dir not found: ${deploymentsDir}`);
  }

  const files = (await fs.promises.readdir(deploymentsDir))
    .filter((file) => file.endsWith(".json") && file !== ".migrations.json")
    .sort();

  // Counts of scan matches (excluding view/pure).
  let totalMatches = 0;
  let totalContractsWithViolations = 0;
  let totalFilteredByGuards = 0;
  let totalViolations = 0;
  let totalInconclusive = 0;
  const violations: Array<{ contractName: string; signature: string; suffix: string; guards: FunctionGuards }> = [];

  for (const file of files) {
    const contractName = file.replace(/\.json$/, "");
    if (contractFilter && !contractName.toLowerCase().includes(contractFilter.toLowerCase())) {
      continue;
    }

    const fullPath = path.join(deploymentsDir, file);
    const raw = await fs.promises.readFile(fullPath, "utf8");
    const json = JSON.parse(raw) as DeploymentJson;

    if (!json.deployedBytecode || typeof json.deployedBytecode !== "string") continue;
    if (!Array.isArray(json.abi)) continue;

    // Quick pre-filter: no call-type opcodes at all.
    const bytes = hexToBytes(json.deployedBytecode);
    const hasAnyCall =
      bytes.includes(0xf1) ||
      bytes.includes(0xf2) ||
      bytes.includes(0xf4) ||
      bytes.includes(0xfa) ||
      bytes.includes(0xff);
    if (!hasAnyCall) continue;

    const instructions = disassemble(bytes);
    const pcToIndex = new Map<number, number>();
    const jumpdests = new Set<number>();
    for (let i = 0; i < instructions.length; i++) {
      const instr = instructions[i];
      pcToIndex.set(instr.pc, i);
      if (instr.name === "JUMPDEST") jumpdests.add(instr.pc);
    }

    const selectorEntrypoints = findSelectorEntrypoints(instructions, jumpdests);

    const iface = new Interface(json.abi as any);
    const abiFunctions = Object.values(iface.functions);
    const flaggedFunctions: Array<{
      signature: string;
      usedParamNames: string[];
      fragment: FunctionFragment;
    }> = [];
    const inconclusiveFunctions: Array<{ signature: string; reason?: string }> = [];

    for (const fragment of abiFunctions) {
      if (functionFilter && !fragment.name.toLowerCase().includes(functionFilter.toLowerCase())) {
        continue;
      }

      // The guard check is only for public/external *mutable* functions.
      // `view` / `pure` functions are ignored early to avoid noisy results.
      if (fragment.stateMutability === "view" || fragment.stateMutability === "pure") {
        continue;
      }

      const inputs = fragment.inputs;
      const addressParamIndices = inputs.map((p, i) => (p.type === "address" ? i : -1)).filter((i) => i !== -1);
      if (addressParamIndices.length === 0) continue;

      const selector = iface.getSighash(fragment).toLowerCase();

      const entryPc = selectorEntrypoints.get(selector);
      if (entryPc === undefined) continue;

      const addressParamOffsets = new Map<bigint, bigint>();
      for (const inputIndex of addressParamIndices) {
        const offset = 4n + 32n * BigInt(inputIndex);
        addressParamOffsets.set(offset, 1n << BigInt(inputIndex));
      }

      const analysis = analyzeFunctionForAddressParamExternalCalls({
        instructions,
        pcToIndex,
        jumpdests,
        entryPc,
        addressParamOffsets,
      });

      if (analysis.status === "incomplete") {
        totalInconclusive++;
        inconclusiveFunctions.push({ signature: formatFunctionSignature(fragment), reason: analysis.reason });
        continue;
      }
      if (analysis.status !== "found") continue;

      const usedParamNames = addressParamIndices
        .filter((i) => (analysis.usedParamBits & (1n << BigInt(i))) !== 0n)
        .map((i) => inputs[i]?.name || `arg${i}`);

      flaggedFunctions.push({
        signature: formatFunctionSignature(fragment),
        usedParamNames,
        fragment,
      });
    }

    if (flaggedFunctions.length === 0 && (!printInconclusive || inconclusiveFunctions.length === 0)) continue;

    totalMatches += flaggedFunctions.length;

    // Cache stripped sources per deployment to avoid re-processing huge metadata strings for every function.
    const cleanCache = new Map<string, string>();

    const contractViolations: Array<{ signature: string; suffix: string; guards: FunctionGuards }> = [];
    for (const match of flaggedFunctions.sort((a, b) => a.signature.localeCompare(b.signature))) {
      const suffix = match.usedParamNames.length > 0 ? ` [target from: ${match.usedParamNames.join(", ")}]` : "";

      const guards = checkFunctionGuardsFromDeploymentMetadata({
        contractName,
        deployment: json,
        fragment: match.fragment,
        cleanCache,
      });

      // If we can't resolve modifiers, fail closed (treat as a violation).
      if (!guards.resolved) {
        contractViolations.push({ signature: match.signature, suffix, guards });
        continue;
      }

      // Filter out functions that are protected by either:
      // - an allow-listed access-control modifier (e.g. onlyController), OR
      // - a reentrancy guard modifier (nonReentrant/globalNonReentrant).
      if (guards.hasAllowedAccessControl || guards.hasReentrancyGuard) {
        totalFilteredByGuards++;
        continue;
      }

      contractViolations.push({ signature: match.signature, suffix, guards });
    }

    const shouldPrintContract =
      contractViolations.length > 0 || (printInconclusive && inconclusiveFunctions.length > 0);
    if (!shouldPrintContract) continue;

    console.log(contractName);

    if (contractViolations.length > 0) {
      totalContractsWithViolations++;
      totalViolations += contractViolations.length;
      for (const v of contractViolations) {
        const fnName = functionNameFromSignature(v.signature);
        const mods = v.guards.modifierNames.length > 0 ? v.guards.modifierNames.join(", ") : "none";
        const where = v.guards.resolution ? ` [${v.guards.resolution}]` : "";
        const err = v.guards.error ? ` (${v.guards.error})` : "";
        console.log(
          `  - [VIOLATION] ${contractName}.${fnName} ${v.signature}${v.suffix} [modifiers: ${mods}]${where}${err}`
        );
        violations.push({ contractName, signature: v.signature, suffix: v.suffix, guards: v.guards });
      }
    }

    if (printInconclusive && inconclusiveFunctions.length > 0) {
      for (const entry of inconclusiveFunctions.sort((a, b) => a.signature.localeCompare(b.signature))) {
        const reason = entry.reason ? ` (${entry.reason})` : "";
        console.log(`  - ${entry.signature} [inconclusive scan]${reason}`);
      }
    }

    console.log("");
  }

  const inconclusiveNote = totalInconclusive > 0 && !printInconclusive ? " (set PRINT_INCONCLUSIVE=1 to list)" : "";

  console.log(
    `Done. Checked ${totalMatches} mutable function(s). Filtered by guards: ${totalFilteredByGuards}. Violations: ${totalViolations} across ${totalContractsWithViolations} contract(s). Inconclusive scans: ${totalInconclusive}${inconclusiveNote}.`
  );

  if (totalViolations > 0) {
    console.log("Violations:");
    for (const v of violations) {
      console.log(`- ${v.contractName}.${functionNameFromSignature(v.signature)}`);
    }
    throw new Error(
      `Found ${totalViolations} function(s) that can route an address parameter into an external interaction without an allow-listed access-control modifier or a reentrancy guard.`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
