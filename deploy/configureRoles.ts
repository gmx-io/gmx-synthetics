import { grantRoleIfNotGranted } from "../utils/role";

const func = async ({ gmx }) => {
  const rolesConfig = await gmx.getRoles();
  for (const { account, roles } of rolesConfig) {
    for (const role of roles) {
      await grantRoleIfNotGranted(account, role);
    }
  }
};

func.tags = ["Roles"];
func.dependencies = ["RoleStore"];

export default func;
