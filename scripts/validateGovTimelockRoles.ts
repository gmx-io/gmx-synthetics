import hre from "hardhat";

import { TIMELOCK_ADMIN_ROLE, PROPOSER_ROLE, EXECUTOR_ROLE, CANCELLER_ROLE } from "../utils/gov";

const knownRoleLabels = new Map(
  [
    [TIMELOCK_ADMIN_ROLE, "TIMELOCK_ADMIN_ROLE"],
    [PROPOSER_ROLE, "PROPOSER_ROLE"],
    [CANCELLER_ROLE, "CANCELLER_ROLE"],
    [EXECUTOR_ROLE, "EXECUTOR_ROLE"],
  ].map(([role, label]) => [role.toLowerCase(), label])
);

async function getRoleLogs(address: string, fromBlock: number, toBlock: number) {
  const roleGrantedTopic = hre.ethers.utils.id("RoleGranted(bytes32,address,address)");
  const roleRevokedTopic = hre.ethers.utils.id("RoleRevoked(bytes32,address,address)");
  const logs = [];
  const maxChunkSize = Number(process.env.BLOCK_CHUNK_SIZE ?? 50_000_000);
  let chunkSize = maxChunkSize;
  let nextBlock = fromBlock;

  while (nextBlock <= toBlock) {
    const chunkEnd = Math.min(nextBlock + chunkSize - 1, toBlock);
    try {
      logs.push(
        ...(await hre.ethers.provider.getLogs({
          address,
          topics: [[roleGrantedTopic, roleRevokedTopic]],
          fromBlock: nextBlock,
          toBlock: chunkEnd,
        }))
      );
      nextBlock = chunkEnd + 1;
      chunkSize = Math.min(chunkSize * 2, maxChunkSize);
    } catch (error: any) {
      const message = error.message ?? error.body ?? "";
      const normalizedMessage = message.toLowerCase();
      if (
        normalizedMessage.includes("log response size exceeded") ||
        normalizedMessage.includes("query timeout exceeded") ||
        normalizedMessage.includes("block range") ||
        normalizedMessage.includes("range is too large") ||
        normalizedMessage.includes("limited to a")
      ) {
        chunkSize = Math.floor(chunkSize / 2);
        if (chunkSize < 1_000) {
          throw new Error(`Unable to query role events: ${message}`);
        }
        continue;
      }
      throw error;
    }
  }

  return logs.sort(
    (a, b) => a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex || a.logIndex - b.logIndex
  );
}

async function main() {
  const timelockDeployment = await hre.deployments.get("GovTimelockController");
  const timelock = await hre.ethers.getContractAt("GovTimelockController", timelockDeployment.address);
  const governor = await hre.ethers.getContract("ProtocolGovernor");
  const deploymentBlock = Number(timelockDeployment.receipt && timelockDeployment.receipt.blockNumber);

  if (!Number.isSafeInteger(deploymentBlock)) {
    throw new Error("Could not determine the timelock deployment block");
  }

  const logs = await getRoleLogs(timelock.address, deploymentBlock, await hre.ethers.provider.getBlockNumber());
  const membersByRole = new Map<string, Set<string>>();

  for (const log of logs) {
    const parsed = timelock.interface.parseLog(log);
    const role = parsed.args.role.toLowerCase();
    const account = parsed.args.account.toLowerCase();
    if (!membersByRole.has(role)) {
      membersByRole.set(role, new Set());
    }

    if (parsed.name === "RoleGranted") {
      membersByRole.get(role).add(account);
    } else {
      membersByRole.get(role).delete(account);
    }
  }

  const expectedMembers = new Map([
    [TIMELOCK_ADMIN_ROLE.toLowerCase(), new Set([timelock.address.toLowerCase()])],
    [PROPOSER_ROLE.toLowerCase(), new Set([governor.address.toLowerCase()])],
    [CANCELLER_ROLE.toLowerCase(), new Set([governor.address.toLowerCase()])],
    [EXECUTOR_ROLE.toLowerCase(), new Set([governor.address.toLowerCase()])],
  ]);
  const roles = new Set([...membersByRole.keys(), ...expectedMembers.keys()]);
  const errors: string[] = [];

  for (const role of roles) {
    const label = knownRoleLabels.get(role) ?? role;
    const members = membersByRole.get(role) ?? new Set();
    const expected = expectedMembers.get(role) ?? new Set();

    console.log(`${label}:`);
    for (const member of members) {
      const code = await hre.ethers.provider.getCode(member);
      console.log(`  ${hre.ethers.utils.getAddress(member)} (${code === "0x" ? "EOA" : "contract"})`);
      if (!expected.has(member)) {
        errors.push(`unexpected ${label} member ${member}`);
      }
    }
    for (const member of expected) {
      if (!members.has(member)) {
        errors.push(`missing ${label} member ${member}`);
      }
    }
  }

  for (const role of knownRoleLabels.keys()) {
    if ((await timelock.getRoleAdmin(role)).toLowerCase() !== TIMELOCK_ADMIN_ROLE.toLowerCase()) {
      errors.push(`${knownRoleLabels.get(role)} is not administered by TIMELOCK_ADMIN_ROLE`);
    }
  }

  if (errors.length > 0) {
    throw new Error(["Invalid GovTimelockController roles:", ...errors.map((error) => `- ${error}`)].join("\n"));
  }

  console.log("GovTimelockController roles are valid");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
