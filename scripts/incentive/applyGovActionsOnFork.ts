import { ethers } from "ethers";

import { getProvider, assertArbitrum } from "./lib";
import { ROLE_HASH, getDeployment, readOutFile, GovAction } from "./migrationLib";

// Applies the generated governance bundles on a fork node for the rehearsal: Timelock pairs are
// signalled by the impersonated admin, the buffer is skipped with evm_increaseTime, then executed;
// RoleStore calls go through the impersonated role admin and role-gated calls through a holder
// (granted to the first fork account when none exists); a direct action with delaySeconds is
// sent after advancing time by that much. Refuses anything but a fork.
// env: INCENTIVE_RPC (fork node), HARDHAT_FORK=arbitrum, NETWORK_NAME (default localhost),
//      STEPS (comma-separated bundle names, applied in order)

const ROLE_STORE_ABI = [
  "function getRoleMembers(bytes32 roleKey, uint256 start, uint256 end) view returns (address[])",
  "function grantRole(address account, bytes32 roleKey)",
];
const TIMELOCK_ABI = ["function admin() view returns (address)", "function buffer() view returns (uint256)"];

async function main() {
  const provider = getProvider();
  await assertArbitrum(provider);
  const { chainId } = await provider.getNetwork();
  if (process.env.HARDHAT_FORK !== "arbitrum" || chainId !== 31337) {
    throw new Error("applyGovActionsOnFork runs only against a hardhat node forking Arbitrum");
  }
  const networkName = process.env.NETWORK_NAME || "localhost";
  const actionsFile = readOutFile<any>("gov-actions.json");
  if (!actionsFile) {
    throw new Error("no gov-actions.json; run generateGovActions first");
  }
  const steps = (process.env.STEPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (steps.length === 0) {
    throw new Error(`set STEPS to a comma-separated list of: ${Object.keys(actionsFile.bundles).join(", ")}`);
  }
  const deployedRoleStore = getDeployment(networkName, "RoleStore")?.address;
  if (!deployedRoleStore) {
    throw new Error(`no RoleStore deployment for ${networkName}`);
  }
  const defaultAccount = (await provider.listAccounts())[0];

  const impersonate = async (address: string): Promise<ethers.providers.JsonRpcSigner> => {
    await provider.send("hardhat_impersonateAccount", [address]);
    await provider.send("hardhat_setBalance", [address, ethers.utils.hexValue(ethers.utils.parseEther("1"))]);
    return provider.getSigner(address);
  };

  const roleAdminOf = async (roleStore: string): Promise<string> => {
    const [admin] = await new ethers.Contract(roleStore, ROLE_STORE_ABI, provider).getRoleMembers(
      ROLE_HASH("ROLE_ADMIN"),
      0,
      1
    );
    if (!admin) {
      throw new Error(`RoleStore ${roleStore} has no ROLE_ADMIN member`);
    }
    return admin;
  };

  const roleHolder = async (role: string): Promise<string> => {
    const roleStore = new ethers.Contract(deployedRoleStore, ROLE_STORE_ABI, provider);
    const [holder] = await roleStore.getRoleMembers(ROLE_HASH(role), 0, 1);
    if (holder) {
      return holder;
    }
    const admin = await impersonate(await roleAdminOf(deployedRoleStore));
    await (await roleStore.connect(admin).grantRole(defaultAccount, ROLE_HASH(role))).wait();
    console.log(`  granted ${role} to ${defaultAccount} for the rehearsal`);
    return defaultAccount;
  };

  const send = async (from: string, to: string, data: string, label: string) => {
    const signer = await impersonate(from);
    try {
      const tx = await signer.sendTransaction({ to, data });
      await tx.wait();
      console.log(`  ok   ${label}`);
    } catch (e: any) {
      const reason = e?.error?.message || e?.reason || e?.message || String(e);
      throw new Error(`${label}: ${reason}`);
    }
  };

  for (const step of steps) {
    const actions: GovAction[] = actionsFile.bundles[step];
    if (!actions) {
      throw new Error(`unknown bundle ${step}`);
    }
    console.log(`\n${step}: ${actions.length} actions`);
    const pairs = actions.filter((a) => a.execution);
    const direct = actions.filter((a) => !a.execution);

    for (const action of direct) {
      let from: string;
      if (action.authority === "RoleStore admin") {
        from = await roleAdminOf(action.target);
      } else if (action.authority === "referral Timelock admin") {
        from = await new ethers.Contract(action.target, TIMELOCK_ABI, provider).admin();
      } else if (action.authority === "anyone") {
        from = defaultAccount;
      } else if (/^[A-Z_]+$/.test(action.authority)) {
        from = await roleHolder(action.authority);
      } else {
        throw new Error(`no fork signer rule for authority "${action.authority}" (${action.label})`);
      }
      if (action.delaySeconds) {
        await provider.send("evm_increaseTime", [Number(action.delaySeconds) + 1]);
        await provider.send("evm_mine", []);
        console.log(`  time advanced ${Number(action.delaySeconds) + 1}s`);
      }
      await send(from, action.target, action.calldata, action.label);
    }

    if (pairs.length > 0) {
      let maxBuffer = 0;
      for (const action of pairs) {
        const execution = action.execution!;
        const timelock = new ethers.Contract(execution.timelock, TIMELOCK_ABI, provider);
        const admin = await timelock.admin();
        const buffer = Number(execution.bufferSeconds || (await timelock.buffer()).toString());
        maxBuffer = Math.max(maxBuffer, buffer);
        if (execution.status === "unsignalled") {
          await send(admin, execution.timelock, execution.signal.calldata, `signal  ${action.label}`);
        } else {
          console.log(`  skip signal (${execution.status}) ${action.label}`);
        }
      }
      await provider.send("evm_increaseTime", [maxBuffer + 1]);
      await provider.send("evm_mine", []);
      console.log(`  time advanced ${maxBuffer + 1}s past the buffer`);
      for (const action of pairs) {
        const execution = action.execution!;
        const admin = await new ethers.Contract(execution.timelock, TIMELOCK_ABI, provider).admin();
        await send(admin, execution.timelock, execution.execute.calldata, `execute ${action.label}`);
      }
    }
  }
  console.log("\nbundles applied; run migrationStatus against the fork");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
