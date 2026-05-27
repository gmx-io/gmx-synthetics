import fs from "fs";
import path from "path";
import hre from "hardhat";

/*
Generate a Safe Transaction Builder batch JSON to cancel all timelock operations
that were scheduled by a previously-executed signal Safe tx.

Reads the receipt of SIGNAL_TX_HASH, finds every CallScheduled event emitted by
ConfigTimelockController in that tx, extracts the operation ids, and writes a
Safe batch JSON with one TimelockConfig.cancelAction(bytes32) call per op.

Usage:
  SIGNAL_TX_HASH=0x... \
    npx hardhat run scripts/cancelTimelockOps.ts --network arbitrum

  e.g. cancel the SCDEV-212 signal (withdrawFromPositionImpactPool, 11 ops):
  SIGNAL_TX_HASH=0x4450dbc0a7dd6f7b4f116ded33436cae921dfbe5a28e99101b20dfd542394dd1 \
    npx hardhat run scripts/cancelTimelockOps.ts --network arbitrum

Output: out/safe-batch-cancelAction-<network>-<timestamp>.json

The script also prints the current on-chain state of each operation so you can
spot ops that are already executed or already cancelled (those would revert at
cancel time and should be removed from the batch).

Applicability and limitations:
- Specific to ops scheduled via `TimelockConfig`. Cancellation goes through
  `TimelockConfig.cancelAction(bytes32)`.
- Only matches `CallScheduled` events from `ConfigTimelockController`. Other
  GMX timelocks (`GovTimelockController`, v1 `GmxTimelock`) won't work as-is.
- The executing Safe (or EOA) must hold the `TIMELOCK_ADMIN` role on
  `TimelockConfig` — same role used to signal in the first place.
- Handles both `schedule` (one event per op) and `scheduleBatch` (multiple
  `CallScheduled` events sharing one id) — duplicate ids are collapsed so the
  output has a single `cancelAction` per unique opHash, which cancels a batch
  atomically the same way OZ stores it.
- Requires hardhat-deploy artifacts for `TimelockConfig` and
  `ConfigTimelockController` in `deployments/<network>/`.
*/

const CALL_SCHEDULED_SIG = "CallScheduled(bytes32,uint256,address,uint256,bytes,bytes32,uint256)";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

async function main() {
  const txHash = process.env.SIGNAL_TX_HASH;
  if (!txHash) {
    throw new Error("SIGNAL_TX_HASH env var is required");
  }

  const timelock = await hre.ethers.getContract("TimelockConfig");
  const timelockController = await hre.ethers.getContract("ConfigTimelockController");

  const callScheduledTopic = hre.ethers.utils.id(CALL_SCHEDULED_SIG);

  console.log(`Fetching receipt for ${txHash}...`);
  const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
  if (!receipt) {
    throw new Error(`Transaction ${txHash} not found on network ${hre.network.name}`);
  }
  console.log(`  Block: ${receipt.blockNumber}`);
  console.log(`  Status: ${receipt.status === 1 ? "Success" : "Failed"}`);
  if (receipt.status !== 1) {
    throw new Error("Transaction reverted; no scheduled ops to cancel");
  }

  const scheduledLogs = receipt.logs.filter(
    (log) =>
      log.address.toLowerCase() === timelockController.address.toLowerCase() && log.topics[0] === callScheduledTopic
  );

  if (scheduledLogs.length === 0) {
    throw new Error(
      `No CallScheduled events from ConfigTimelockController (${timelockController.address}) in tx ${txHash}`
    );
  }

  // scheduleBatch emits multiple CallScheduled events with the same id (one per sub-call); keep first occurrence per id
  const uniqueLogs = new Map<string, typeof scheduledLogs[0]>();
  for (const log of scheduledLogs) {
    const opHash = log.topics[1];
    if (!uniqueLogs.has(opHash)) {
      uniqueLogs.set(opHash, log);
    }
  }
  const duplicates = scheduledLogs.length - uniqueLogs.size;
  const dupNote = duplicates > 0 ? ` (${duplicates} duplicate event(s) from scheduleBatch collapsed)` : "";
  console.log(
    `\nFound ${scheduledLogs.length} CallScheduled event(s)${dupNote}, ${uniqueLogs.size} unique opHash(es):\n`
  );

  const uniqueLogsArr = Array.from(uniqueLogs.values());
  const ops: { opHash: string; target: string; delay: string; state: string }[] = [];
  for (let i = 0; i < uniqueLogsArr.length; i++) {
    const log = uniqueLogsArr[i];
    const decoded = timelockController.interface.parseLog(log);
    const opHash: string = log.topics[1];
    const target: string = decoded.args.target;
    const delay: string = decoded.args.delay.toString();

    const ts = await timelockController.getTimestamp(opHash);
    let state: string;
    if (ts.eq(0)) {
      state = "NOT SCHEDULED (already cancelled or never existed)";
    } else if (ts.eq(1)) {
      state = "DONE (already executed)";
    } else {
      const now = Math.floor(Date.now() / 1000);
      const diff = ts.toNumber() - now;
      const relTime = diff === 0 ? "now" : diff > 0 ? `in ${formatDuration(diff)}` : `${formatDuration(-diff)} ago`;
      state = `SCHEDULED (ready ${relTime}, unix=${ts.toString()})`;
    }

    ops.push({ opHash, target, delay, state });
    console.log(`  [${i + 1}] opHash=${opHash}`);
    console.log(`        target=${target}, delay=${delay}s`);
    console.log(`        state: ${state}`);
  }

  const cancellable = ops.filter((op) => op.state.startsWith("SCHEDULED"));
  if (cancellable.length !== ops.length) {
    console.log(
      `\nWARNING: ${ops.length - cancellable.length} op(s) are not in SCHEDULED state and cannot be cancelled.`
    );
    console.log(`Including only ${cancellable.length} cancellable op(s) in the Safe batch.`);
  }
  if (cancellable.length === 0) {
    throw new Error("No cancellable operations found");
  }

  const transactions = cancellable.map((op) => ({
    to: timelock.address,
    value: "0",
    data: null,
    contractMethod: {
      name: "cancelAction",
      payable: false,
      inputs: [{ name: "id", type: "bytes32", internalType: "bytes32" }],
    },
    contractInputsValues: { id: op.opHash },
  }));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = "out";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const filename = path.join(outDir, `safe-batch-cancelAction-${hre.network.name}-${stamp}.json`);

  const batch = {
    version: "1.0",
    chainId: String(hre.network.config.chainId),
    createdAt: Date.now(),
    meta: {
      name: `Cancel timelock ops from ${txHash.slice(0, 10)}… (${transactions.length} ops)`,
      description: `Cancels ${transactions.length} timelock op(s) scheduled by ${txHash}. Reproducible: SIGNAL_TX_HASH=${txHash} npx hardhat run scripts/cancelTimelockOps.ts --network ${hre.network.name}`,
      txBuilderVersion: "1.16.5",
      createdFromSafeAddress: "",
      createdFromOwnerAddress: "",
      checksum: "",
    },
    transactions,
  };

  fs.writeFileSync(filename, JSON.stringify(batch, null, 2));
  console.log(`\nSafe Transaction Builder batch written to: ${filename}`);
  console.log(`  Load via Safe --> Transaction Builder --> drag and drop the JSON file`);
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
