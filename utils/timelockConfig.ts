import hre from "hardhat";

import { hashString } from "./hash";
import { TimelockConfig } from "../typechain-types";

// The TimelockConfig to sign timelock actions through: the network's deployment by default, or
// TIMELOCK_CONFIG when actions must still go through the existing timelock, for example to grant
// roles to a newly deployed TimelockConfig. Either way the address must hold ROLE_ADMIN on the
// RoleStore, so a stale or premature address fails here instead of at the first signal.
export async function getTimelockConfig(): Promise<TimelockConfig> {
  const override = process.env.TIMELOCK_CONFIG;
  const address = override || (await hre.deployments.get("TimelockConfig")).address;
  const timelock = await hre.ethers.getContractAt("TimelockConfig", address);
  const roleStore = await hre.ethers.getContractAt("RoleStore", (await hre.deployments.get("RoleStore")).address);
  if (!(await roleStore.hasRole(timelock.address, hashString("ROLE_ADMIN")))) {
    throw new Error(
      `TimelockConfig ${timelock.address} does not hold ROLE_ADMIN on RoleStore ${roleStore.address} (${hre.network.name}); ` +
        "set TIMELOCK_CONFIG to the timelock that currently holds it"
    );
  }
  console.log("timelock", timelock.address, override ? "(TIMELOCK_CONFIG)" : "(deployment)");
  return timelock;
}
