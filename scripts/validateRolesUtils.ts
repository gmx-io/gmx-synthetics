import hre from "hardhat";
import Role from "../artifacts/contracts/role/Role.sol/Role.json";
import { hashString } from "../utils/hash";

async function validateMember({ role, member }) {
  if (["ROLE_ADMIN", "TIMELOCK_MULTISIG", "CONTROLLER"].includes(role)) {
    const code = await ethers.provider.getCode(member);
    if (code === "0x") {
      throw new Error(`EOA (Externally Owned Account) with ${role} role`);
    }
  }
}

export async function validateRoles() {
  const roles = Role.abi.map((i) => i.name);
  console.log(`checking ${roles.length} roles`);
  console.log(roles);

  const roleStore = await hre.ethers.getContract("RoleStore");

  const _expectedRoles = await hre.gmx.getRoles();

  const expectedRoles = {};

  for (const role in _expectedRoles) {
    expectedRoles[role] = {};

    for (const member in _expectedRoles[role]) {
      expectedRoles[role][member.toLowerCase()] = true;
    }
  }

  const rolesToAdd = [];
  const rolesToRemove = [];

  for (const role of roles) {
    const roleKey = hashString(role);
    const members = await roleStore.getRoleMembers(roleKey, 0, 100);

    const memberIsInStore = {};

    console.log(`${role} role (${roleKey}): ${members.length}`);
    for (const member of members) {
      await validateMember({ role, member });

      console.log(`   ${member}`);
      if (!expectedRoles[role][member.toLowerCase()]) {
        rolesToRemove.push({
          role,
          member,
        });
      }

      memberIsInStore[member.toLowerCase()] = true;
    }

    for (const member in expectedRoles[role]) {
      await validateMember({ role, member });

      if (!memberIsInStore[member.toLowerCase()]) {
        rolesToAdd.push({
          role,
          member,
        });
      }
    }
  }

  console.log(`${rolesToAdd.length} rolesToAdd`);
  console.log(rolesToAdd);
  console.log(`${rolesToRemove.length} rolesToRemove`);
  console.log(rolesToRemove);

  return { rolesToAdd, rolesToRemove };
}
