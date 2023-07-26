import { hashString } from "./hash";
import hre from "hardhat";

export async function grantRole(roleStore, account, role) {
  await roleStore.grantRole(account, hashString(role));
}

export async function revokeRole(roleStore, account, role) {
  await roleStore.revokeRole(account, hashString(role));
}

export async function grantRoleIfNotGranted(address: string, role: string, addressLabel = "") {
  const { deployments, getNamedAccounts } = hre;
  const { read, execute, log } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleHash = hashString(role);
  const hasRole = await read("RoleStore", "hasRole", address, roleHash);

  if (!hasRole) {
    log("granting role %s to %s %s", role, addressLabel, address);
    await execute("RoleStore", { from: deployer, log: true }, "grantRole", address, roleHash);
  } else {
    log("role %s already granted to %s %s", role, addressLabel, address);
  }
}

export async function revokeRoleIfGranted(address: string, role: string, addressLabel = "") {
  const { deployments, getNamedAccounts } = hre;
  const { read, execute, log } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleHash = hashString(role);
  const hasRole = await read("RoleStore", "hasRole", address, roleHash);

  if (hasRole) {
    log("revoking role %s for %s %s", role, addressLabel, address);
    await execute("RoleStore", { from: deployer, log: true }, "revokeRole", address, roleHash);
  } else {
    log("role %s already revoked for %s %s", role, addressLabel, address);
  }
}
