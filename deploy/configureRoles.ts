import { grantRoleIfNotGranted } from "../utils/role";

const func = async ({ gmx }) => {
  const rolesConfig = await gmx.getRoles();
  for (const role in rolesConfig) {
    const accounts = rolesConfig[role];
    for (const account in accounts) {
      await grantRoleIfNotGranted(account, role);
    }
  }
};

func.tags = ["Roles"];
func.dependencies = ["RoleStore"];

export default func;
