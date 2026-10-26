import { BigNumber, constants, Contract, providers, utils } from "ethers";
import { hashString } from "./hash";
import { PROTOCOL_MULTISIG } from "./constants";
import { getRoleName } from "./roleNames";

const controllerInterface = new utils.Interface([
  "event CallScheduled(bytes32 indexed id,uint256 indexed index,address target,uint256 value,bytes data,bytes32 predecessor,uint256 delay)",
  "event CallExecuted(bytes32 indexed id,uint256 indexed index,address target,uint256 value,bytes data)",
  "event CallSalt(bytes32 indexed id,bytes32 salt)",
  "function getTimestamp(bytes32) view returns (uint256)",
  "function hasRole(bytes32,address) view returns (bool)",
]);
const roleInterface = new utils.Interface([
  "function grantRole(address account,bytes32 roleKey)",
  "function revokeRole(address account,bytes32 roleKey)",
  "function hasRole(address,bytes32) view returns (bool)",
]);
const timelockInterface = new utils.Interface([
  "function timelockController() view returns (address)",
  "function roleStore() view returns (address)",
  "function cancelAction(bytes32 id)",
]);

export type RoleGrantCleanupParams = {
  chainId: number;
  timelockConfig: string;
  timelockController: string;
  roleStore: string;
  controllerDeploymentTxHash?: string;
};

export function validateRoleGrantCleanupParams(params: RoleGrantCleanupParams) {
  if (params.controllerDeploymentTxHash && !utils.isHexString(params.controllerDeploymentTxHash, 32)) {
    throw new Error("Invalid controller deployment transaction hash");
  }
  if (!Number.isSafeInteger(params.chainId) || params.chainId <= 0) throw new Error("Invalid chainId");
  for (const key of ["timelockConfig", "timelockController", "roleStore"] as const) {
    if (!utils.isAddress(params[key]) || params[key] === constants.AddressZero) {
      throw new Error(`Invalid ${key} address`);
    }
  }
}

function isRoleCall(target: string, data: string, roleStore: string, kind?: string) {
  return (
    target.toLowerCase() === roleStore.toLowerCase() &&
    (kind ? [kind] : ["grantRole", "revokeRole"]).some((name) => data.slice(0, 10) === roleInterface.getSighash(name))
  );
}

// The controller is a non-upgradeable contract. Locate its creation without a release-specific block constant.
export async function findControllerDeploymentBlock(
  provider: providers.Provider,
  address: string,
  toBlock: number,
  deploymentTxHash?: string
) {
  if (!Number.isSafeInteger(toBlock) || toBlock < 0) throw new Error("Invalid snapshot block");
  if (deploymentTxHash) {
    const receipt = await provider.getTransactionReceipt(deploymentTxHash);
    if (
      !receipt ||
      receipt.status !== 1 ||
      receipt.blockNumber > toBlock ||
      receipt.contractAddress?.toLowerCase() !== address.toLowerCase()
    ) {
      throw new Error("Invalid controller deployment receipt");
    }
    if ((await provider.getBlock(receipt.blockNumber)).hash !== receipt.blockHash) {
      throw new Error("Controller deployment receipt is no longer canonical");
    }
    return receipt.blockNumber;
  }
  if ((await provider.getCode(address, toBlock)) === "0x") throw new Error("Controller has no code at snapshot");
  let low = 0;
  let high = toBlock;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((await provider.getCode(address, middle)) === "0x") low = middle + 1;
    else high = middle;
  }
  return low;
}

// Scan both event types: executed revokes select the scope; schedules supply their original pairing and salt.
export async function findRoleHistoryTransactions(
  provider: providers.Provider,
  params: RoleGrantCleanupParams,
  fromBlock: number,
  toBlock: number
) {
  if (!Number.isSafeInteger(fromBlock) || fromBlock < 0 || !Number.isSafeInteger(toBlock) || toBlock < fromBlock) {
    throw new Error("Invalid role history block range");
  }
  const hashes = new Set<string>();
  let chunkSize = Math.min(50_000_000, toBlock - fromBlock + 1);
  let nextBlock = fromBlock;
  while (nextBlock <= toBlock) {
    const endBlock = Math.min(nextBlock + chunkSize - 1, toBlock);
    let logs: providers.Log[];
    try {
      logs = await provider.getLogs({
        address: params.timelockController,
        topics: [
          [controllerInterface.getEventTopic("CallScheduled"), controllerInterface.getEventTopic("CallExecuted")],
        ],
        fromBlock: nextBlock,
        toBlock: endBlock,
      });
    } catch (error) {
      const message = String(error.message || "").toLowerCase();
      if (
        chunkSize > 1 &&
        /block range|range.*(large|limit)|too many|response size|query timeout|limited to/.test(message)
      ) {
        chunkSize = Math.max(1, Math.floor(chunkSize / 2));
        continue;
      }
      throw new Error(`Unable to read role events in blocks ${nextBlock}-${endBlock}; discovery incomplete`);
    }
    for (const log of logs) {
      if (log.removed) throw new Error("Role log was removed; rerun discovery");
      const { args } = controllerInterface.parseLog(log);
      if (isRoleCall(args.target, args.data, params.roleStore)) hashes.add(log.transactionHash);
    }
    nextBlock = endBlock + 1;
    // Keep the accepted range instead of repeatedly exceeding the RPC limit.
  }
  return [...hashes];
}

type RoleEvent = {
  args: utils.Result;
  log: providers.Log;
  receipt: providers.TransactionReceipt;
};

type PairedGrant = {
  id: string;
  revokeId: string;
  account: string;
  role: string;
  roleName: string | null;
  predecessor: string;
  salt: string;
  signalTxHash: string;
  signalBlockNumber: number;
  delay: string;
  revokeExecutionTxHash: string;
  revokeExecutionBlockNumber: number;
  hasLaterGrantSchedule: boolean;
  grantExecutionBeforeRevoke: boolean;
  grantExecutionFound: boolean;
};

type UnpairedRevoke = { id: string; account: string; role: string; roleName: string | null; executionTxHash: string };

type PairedRevoke = {
  id: string;
  grantId: string;
  account: string;
  role: string;
  roleName: string | null;
  predecessor: string;
  salt: string;
  signalTxHash: string;
  signalBlockNumber: number;
  delay: string;
  grantExecutionTxHash: string;
  grantExecutionBlockNumber: number;
  hasLaterRevokeSchedule: boolean;
};

function operationId(target: string, data: string, predecessor: string, salt: string) {
  return utils.keccak256(
    utils.defaultAbiCoder.encode(
      ["address", "uint256", "bytes", "bytes32", "bytes32"],
      [target, 0, data, predecessor, salt]
    )
  );
}

function isBefore(a: RoleEvent, b: RoleEvent) {
  return (
    a.log.blockNumber < b.log.blockNumber ||
    (a.log.blockNumber === b.log.blockNumber && a.log.logIndex < b.log.logIndex)
  );
}

// A paired grant must have been scheduled alongside the executed revoke, with the same predecessor and salt.
export function discoverPairedRoleGrants(receipts: providers.TransactionReceipt[], params: RoleGrantCleanupParams) {
  const schedules = new Map<string, RoleEvent[]>();
  const executions = new Map<string, RoleEvent[]>();
  const salts = new Map<string, string>();
  const seenReceipts = new Set<string>();
  for (const receipt of receipts) {
    if (receipt.status !== 1) throw new Error(`Role history transaction failed: ${receipt.transactionHash}`);
    if (seenReceipts.has(receipt.transactionHash.toLowerCase())) throw new Error("Duplicate role history receipt");
    seenReceipts.add(receipt.transactionHash.toLowerCase());
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== params.timelockController.toLowerCase()) continue;
      if (log.topics[0] === controllerInterface.getEventTopic("CallSalt")) {
        const { args } = controllerInterface.parseLog(log);
        salts.set(`${receipt.transactionHash}:${args.id}`, args.salt);
        continue;
      }
      const store =
        log.topics[0] === controllerInterface.getEventTopic("CallScheduled")
          ? schedules
          : log.topics[0] === controllerInterface.getEventTopic("CallExecuted")
          ? executions
          : undefined;
      if (!store) continue;
      const { args } = controllerInterface.parseLog(log);
      const group = store.get(args.id) || [];
      group.push({ args, log, receipt });
      store.set(args.id, group);
    }
  }
  const grants: PairedGrant[] = [];
  const unpairedRevokes: UnpairedRevoke[] = [];
  for (const [revokeId, executed] of executions) {
    if (!executed.some(({ args }) => isRoleCall(args.target, args.data, params.roleStore, "revokeRole"))) continue;
    if (executed.length !== 1 || !executed[0].args.index.eq(0) || !executed[0].args.value.eq(0)) {
      throw new Error(`Batched revoke operation ${revokeId}: automatic pairing is unsupported`);
    }
    const execution = executed[0];
    const prior = (schedules.get(revokeId) || []).filter((event) => isBefore(event, execution));
    const scheduled = prior.sort((a, b) => (isBefore(a, b) ? -1 : 1)).pop();
    if (!scheduled) throw new Error(`Missing schedule for executed revoke ${revokeId}; history incomplete`);
    const inSignal = (schedules.get(revokeId) || []).filter(
      (event) => event.receipt.transactionHash === scheduled.receipt.transactionHash
    );
    const salt = salts.get(`${scheduled.receipt.transactionHash}:${revokeId}`) || constants.HashZero;
    if (
      inSignal.length !== 1 ||
      !scheduled.args.index.eq(0) ||
      !scheduled.args.value.eq(0) ||
      scheduled.args.data !== execution.args.data ||
      scheduled.args.target !== execution.args.target ||
      operationId(scheduled.args.target, scheduled.args.data, scheduled.args.predecessor, salt) !== revokeId
    ) {
      throw new Error(`Unexpected revoke encoding or batch: ${revokeId}`);
    }
    const decoded = roleInterface.parseTransaction({ data: scheduled.args.data });
    const account: string = decoded.args.account;
    const role: string = decoded.args.roleKey;
    const grantId = operationId(
      params.roleStore,
      roleInterface.encodeFunctionData("grantRole", [account, role]),
      scheduled.args.predecessor,
      salt
    );
    const paired = (schedules.get(grantId) || []).filter(
      (event) => event.receipt.transactionHash === scheduled.receipt.transactionHash
    );
    if (paired.length === 0) {
      // A separate request (including a re-signalled revoke) is not proof of an original pair.
      if (schedules.has(grantId)) {
        throw new Error(
          `Grant ${grantId} was scheduled separately from executed revoke ${revokeId}; pairing ambiguous`
        );
      }
      const batchedGrant = [...schedules.values()]
        .flat()
        .some(
          ({ args, receipt }) =>
            receipt.transactionHash === scheduled.receipt.transactionHash &&
            isRoleCall(args.target, args.data, params.roleStore, "grantRole") &&
            args.data === roleInterface.encodeFunctionData("grantRole", [account, role]) &&
            args.predecessor === scheduled.args.predecessor &&
            (salts.get(`${receipt.transactionHash}:${args.id}`) || constants.HashZero) === salt
        );
      if (batchedGrant)
        throw new Error(`Batched paired grant for revoke ${revokeId}: automatic pairing is unsupported`);
      unpairedRevokes.push({
        id: revokeId,
        account,
        role,
        roleName: getRoleName(role),
        executionTxHash: execution.receipt.transactionHash,
      });
      continue;
    }
    const grant = paired[0];
    const grantSalt = salts.get(`${grant.receipt.transactionHash}:${grantId}`) || constants.HashZero;
    if (
      paired.length !== 1 ||
      !grant.args.index.eq(0) ||
      !grant.args.value.eq(0) ||
      !isBefore(grant, execution) ||
      operationId(grant.args.target, grant.args.data, grant.args.predecessor, grantSalt) !== grantId
    ) {
      throw new Error(`Unexpected paired grant encoding or batch: ${grantId}`);
    }
    const grantExecutions = executions.get(grantId) || [];
    if (grantExecutions.length > 1) throw new Error(`Multiple executions of grant ${grantId}; history inconsistent`);
    grants.push({
      id: grantId,
      revokeId,
      account,
      role,
      roleName: getRoleName(role),
      predecessor: scheduled.args.predecessor,
      salt,
      signalTxHash: grant.receipt.transactionHash,
      signalBlockNumber: grant.receipt.blockNumber,
      delay: grant.args.delay.toString(),
      revokeExecutionTxHash: execution.receipt.transactionHash,
      revokeExecutionBlockNumber: execution.receipt.blockNumber,
      hasLaterGrantSchedule: (schedules.get(grantId) || []).some((event) => isBefore(grant, event)),
      grantExecutionBeforeRevoke: grantExecutions.length === 1 && isBefore(grantExecutions[0], execution),
      grantExecutionFound: grantExecutions.length === 1,
    });
  }
  // Revokes left after a grant executes are informational rollback operations, not cancellation candidates.
  const revokeCandidates: PairedRevoke[] = [];
  const warnings: string[] = [];
  for (const [grantId, executed] of executions) {
    if (!executed.some(({ args }) => isRoleCall(args.target, args.data, params.roleStore, "grantRole"))) continue;
    const warn = (reason: string) => warnings.push(`Pending revoke report for grant ${grantId}: ${reason}`);
    if (executed.length !== 1 || !executed[0].args.index.eq(0) || !executed[0].args.value.eq(0)) {
      warn("batched grant is unsupported");
      continue;
    }
    const execution = executed[0];
    const prior = (schedules.get(grantId) || []).filter((event) => isBefore(event, execution));
    const scheduled = prior.sort((a, b) => (isBefore(a, b) ? -1 : 1)).pop();
    if (!scheduled) {
      warn("missing grant schedule");
      continue;
    }
    const inSignal = (schedules.get(grantId) || []).filter(
      (event) => event.receipt.transactionHash === scheduled.receipt.transactionHash
    );
    const salt = salts.get(`${scheduled.receipt.transactionHash}:${grantId}`) || constants.HashZero;
    if (
      inSignal.length !== 1 ||
      !scheduled.args.index.eq(0) ||
      !scheduled.args.value.eq(0) ||
      scheduled.args.data !== execution.args.data ||
      scheduled.args.target !== execution.args.target ||
      operationId(scheduled.args.target, scheduled.args.data, scheduled.args.predecessor, salt) !== grantId
    ) {
      warn("unexpected grant encoding or batch");
      continue;
    }
    const { account, roleKey: role } = roleInterface.parseTransaction({ data: scheduled.args.data }).args;
    const revokeData = roleInterface.encodeFunctionData("revokeRole", [account, role]);
    const revokeId = operationId(params.roleStore, revokeData, scheduled.args.predecessor, salt);
    const paired = (schedules.get(revokeId) || []).filter(
      (event) => event.receipt.transactionHash === scheduled.receipt.transactionHash
    );
    if (!paired.length) {
      if (schedules.has(revokeId)) {
        warn(`revoke ${revokeId} was scheduled separately; pairing ambiguous`);
      } else if (
        [...schedules.values()]
          .flat()
          .some(
            ({ args, receipt }) =>
              receipt.transactionHash === scheduled.receipt.transactionHash &&
              isRoleCall(args.target, args.data, params.roleStore, "revokeRole") &&
              args.data === revokeData &&
              args.predecessor === scheduled.args.predecessor &&
              (salts.get(`${receipt.transactionHash}:${args.id}`) || constants.HashZero) === salt
          )
      ) {
        warn("batched paired revoke is unsupported");
      }
      continue;
    }
    const revoke = paired[0];
    const revokeSalt = salts.get(`${revoke.receipt.transactionHash}:${revokeId}`) || constants.HashZero;
    if (
      paired.length !== 1 ||
      !revoke.args.index.eq(0) ||
      !revoke.args.value.eq(0) ||
      !isBefore(revoke, execution) ||
      operationId(revoke.args.target, revoke.args.data, revoke.args.predecessor, revokeSalt) !== revokeId
    ) {
      warn(`unexpected paired revoke encoding or batch: ${revokeId}`);
      continue;
    }
    revokeCandidates.push({
      id: revokeId,
      grantId,
      account,
      role,
      roleName: getRoleName(role),
      predecessor: scheduled.args.predecessor,
      salt,
      signalTxHash: revoke.receipt.transactionHash,
      signalBlockNumber: revoke.receipt.blockNumber,
      delay: revoke.args.delay.toString(),
      grantExecutionTxHash: execution.receipt.transactionHash,
      grantExecutionBlockNumber: execution.receipt.blockNumber,
      hasLaterRevokeSchedule: (schedules.get(revokeId) || []).some((event) => isBefore(revoke, event)),
    });
  }
  return { grants, unpairedRevokes, revokeCandidates, warnings };
}

export type RoleGrantCleanupReport = {
  params: RoleGrantCleanupParams;
  safeAddress: string;
  blockNumber: number;
  blockHash: string;
  fromBlock: number;
  historyTxHashes: string[];
  unpairedRevokes: UnpairedRevoke[];
  grants: (PairedGrant & {
    timestamp: string;
    originalTimestamp: string;
    state: "cancelled" | "executed" | "executedBeforeRevoke" | "waiting" | "ready" | "rescheduled";
    revocationExecuted: boolean;
    rolePresent: boolean;
  })[];
  pendingRevokes: (PairedRevoke & {
    timestamp: string;
    originalTimestamp: string;
    state: "waiting" | "ready";
  })[];
  warnings: string[];
  errors: string[];
  complete: boolean;
};

// Provider-only contracts: this function cannot sign or submit transactions.
export async function inspectRoleGrantCleanup(
  provider: providers.Provider,
  params: RoleGrantCleanupParams,
  safeAddress = PROTOCOL_MULTISIG,
  snapshot?: providers.Block
): Promise<RoleGrantCleanupReport> {
  validateRoleGrantCleanupParams(params);
  if ((await provider.getNetwork()).chainId !== params.chainId)
    throw new Error("Parameters chainId does not match RPC");
  const block = snapshot || (await provider.getBlock("latest"));
  const overrides = { blockTag: block.number };
  const timelock = new Contract(params.timelockConfig, timelockInterface, provider);
  const controller = new Contract(params.timelockController, controllerInterface, provider);
  const roleStore = new Contract(params.roleStore, roleInterface, provider);
  if ((await timelock.timelockController(overrides)).toLowerCase() !== params.timelockController.toLowerCase()) {
    throw new Error("TimelockConfig/controller mismatch");
  }
  if ((await timelock.roleStore(overrides)).toLowerCase() !== params.roleStore.toLowerCase()) {
    throw new Error("TimelockConfig/RoleStore mismatch");
  }
  const fromBlock = await findControllerDeploymentBlock(
    provider,
    params.timelockController,
    block.number,
    params.controllerDeploymentTxHash
  );
  const historyTxHashes = await findRoleHistoryTransactions(provider, params, fromBlock, block.number);
  const receipts: providers.TransactionReceipt[] = [];
  const blockTimestamps = new Map<number, number>();
  for (const hash of historyTxHashes) {
    const receipt = await provider.getTransactionReceipt(hash);
    if (!receipt || receipt.blockNumber > block.number)
      throw new Error(`Missing or unconfirmed role history receipt: ${hash}`);
    const historyBlock = await provider.getBlock(receipt.blockNumber);
    if (historyBlock.hash !== receipt.blockHash)
      throw new Error(`Role history receipt is no longer canonical: ${hash}`);
    blockTimestamps.set(receipt.blockNumber, historyBlock.timestamp);
    receipts.push(receipt);
  }
  const discovered = discoverPairedRoleGrants(receipts, params);
  const report: RoleGrantCleanupReport = {
    params,
    safeAddress,
    blockNumber: block.number,
    blockHash: block.hash,
    fromBlock,
    historyTxHashes,
    unpairedRevokes: discovered.unpairedRevokes,
    grants: [],
    pendingRevokes: [],
    warnings: discovered.warnings,
    errors: [],
    complete: false,
  };
  if (!discovered.grants.length) report.errors.push("No paired grants found for executed revokes");
  for (const grant of discovered.grants) {
    const timestamp: BigNumber = await controller.getTimestamp(grant.id, overrides);
    const originalTimestamp = BigNumber.from(blockTimestamps.get(grant.signalBlockNumber)).add(grant.delay);
    const revocationExecuted = (await controller.getTimestamp(grant.revokeId, overrides)).eq(1);
    const rolePresent: boolean = await roleStore.hasRole(grant.account, grant.role, overrides);
    const state = timestamp.eq(0)
      ? "cancelled"
      : grant.hasLaterGrantSchedule
      ? "rescheduled"
      : timestamp.eq(1)
      ? grant.grantExecutionBeforeRevoke
        ? "executedBeforeRevoke"
        : "executed"
      : !timestamp.eq(originalTimestamp)
      ? "rescheduled"
      : timestamp.lte(block.timestamp)
      ? "ready"
      : "waiting";
    report.grants.push({
      ...grant,
      timestamp: timestamp.toString(),
      originalTimestamp: originalTimestamp.toString(),
      state,
      revocationExecuted,
      rolePresent,
    });
    if (state === "rescheduled") report.errors.push(`Grant ${grant.id} was rescheduled; investigate separately`);
    if (state === "executed")
      report.errors.push(`Grant ${grant.id} already executed after its revoke; investigate the role history`);
    if (timestamp.eq(1) && !grant.grantExecutionFound) report.errors.push(`Missing grant execution event: ${grant.id}`);
    if (!revocationExecuted) report.errors.push(`Paired revoke ${grant.revokeId} has not executed`);
    // Once this grant is cancelled, a fresh authorised grant may legitimately restore the role.
    if (rolePresent && state !== "executedBeforeRevoke" && state !== "cancelled")
      report.errors.push(`Revoked role is present: ${grant.account} / ${grant.role}`);
  }
  if (report.grants.some((grant) => grant.state === "ready" || grant.state === "waiting")) {
    if (!(await roleStore.hasRole(safeAddress, hashString("TIMELOCK_ADMIN"), overrides)))
      report.errors.push("Protocol multisig lacks TIMELOCK_ADMIN");
    if (!(await controller.hasRole(utils.id("CANCELLER_ROLE"), timelock.address, overrides)))
      report.errors.push("TimelockConfig lacks CANCELLER_ROLE on the controller");
  }
  for (const revoke of discovered.revokeCandidates) {
    const timestamp: BigNumber = await controller.getTimestamp(revoke.id, overrides);
    if (timestamp.lte(1)) continue;
    const originalTimestamp = BigNumber.from(blockTimestamps.get(revoke.signalBlockNumber)).add(revoke.delay);
    if (revoke.hasLaterRevokeSchedule || !timestamp.eq(originalTimestamp)) {
      report.warnings.push(`Pending revoke ${revoke.id} was rescheduled; excluded from the original counterparts`);
      continue;
    }
    report.pendingRevokes.push({
      ...revoke,
      timestamp: timestamp.toString(),
      originalTimestamp: originalTimestamp.toString(),
      state: timestamp.lte(block.timestamp) ? "ready" : "waiting",
    });
  }
  if ((await provider.getBlock(block.number)).hash !== block.hash)
    throw new Error("Snapshot block changed; rerun inspection");
  report.complete =
    report.errors.length === 0 &&
    report.grants.every((grant) => grant.state === "cancelled" || grant.state === "executedBeforeRevoke");
  return report;
}

export function buildRoleGrantCancellationBatches(report: RoleGrantCleanupReport, batchSize = 50) {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) throw new Error("Invalid SAFE_TX_BATCH_SIZE");
  if (report.errors.length) throw new Error(report.errors.join("\n"));
  const transactions = report.grants
    .filter((grant) => grant.state === "waiting" || grant.state === "ready")
    .map((grant) => ({
      to: report.params.timelockConfig,
      value: "0",
      data: timelockInterface.encodeFunctionData("cancelAction", [grant.id]),
      contractMethod: {
        name: "cancelAction",
        payable: false,
        inputs: [{ name: "id", type: "bytes32", internalType: "bytes32" }],
      },
      contractInputsValues: { id: grant.id },
    }));
  const batches: typeof transactions[] = [];
  for (let i = 0; i < transactions.length; i += batchSize) batches.push(transactions.slice(i, i + batchSize));
  return batches;
}
