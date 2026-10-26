import hre from "hardhat";

import { getRoleName, knownRoles } from "../utils/roleNames";

const { ethers } = hre;

async function main() {
  const roleStore = await ethers.getContract("RoleStore");
  const roleCount = await roleStore.getRoleCount();
  const roles = await roleStore.getRoles(0, roleCount);
  const deployments = await hre.deployments.all();

  const addressToName = Object.fromEntries(
    Object.entries(deployments).map(([name, deployment]) => [deployment.address, name])
  );

  for (const [roleHash, role] of Object.entries(knownRoles)) {
    console.log("%s %s", role, roleHash);
  }
  console.log(""); // newline

  for (const role of roles) {
    const roleMemberCount = await roleStore.getRoleMemberCount(role);
    const roleMembers = await roleStore.getRoleMembers(role, 0, roleMemberCount);
    const roleData = roleMembers.map((m) => {
      if (!addressToName[m]) {
        return m;
      }
      return `${m} (${addressToName[m]})`;
    });
    console.log("%s:\n\t%s", getRoleName(role) ?? role, roleData.join("\n\t"));
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
