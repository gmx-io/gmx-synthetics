import hre from "hardhat";

import { hashString } from "../utils/hash";

const { ethers } = hre;

const knownRoles = Object.fromEntries(
  [
    "ROLE_ADMIN",
    "TIMELOCK_ADMIN",
    "TIMELOCK_MULTISIG",
    "CONFIG_KEEPER",
    "LIMITED_CONFIG_KEEPER",
    "CONTROLLER",
    "GOV_TOKEN_CONTROLLER",
    "ROUTER_PLUGIN",
    "MARKET_KEEPER",
    "FEE_KEEPER",
    "FEE_DISTRIBUTION_KEEPER",
    "ORDER_KEEPER",
    "FROZEN_ORDER_KEEPER",
    "PRICING_KEEPER",
    "LIQUIDATION_KEEPER",
    "ADL_KEEPER",
  ].map((role) => [hashString(role), role])
);

async function main() {
  const roleStore = await ethers.getContract("RoleStore");
  const roleCount = await roleStore.getRoleCount();
  const roles = await roleStore.getRoles(0, roleCount);

  for (const [roleHash, role] of Object.entries(knownRoles)) {
    console.log("%s %s", role, roleHash);
  }
  console.log(""); // newline

  for (const role of roles) {
    const roleMemberCount = await roleStore.getRoleMemberCount(role);
    const roleMembers = await roleStore.getRoleMembers(role, 0, roleMemberCount);
    console.log("%s:\n\t%s", knownRoles[role] || role, roleMembers.join("\n\t"));
  }
}

main()
  .then(() => {
    console.log("done");
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
