import { grantRoleIfNotGranted, revokeRoleIfGranted } from "../utils/role";

const func = async ({ gmx }) => {
  const rolesConfig = await gmx.getRoles();
  for (const { account, label, roles, rolesToRemove } of rolesConfig) {
    if (!roles && !rolesToRemove) {
      console.warn("WARN: No roles and rolesToRemove for %s", account);
    }

    if (roles) {
      for (const role of roles) {
        await grantRoleIfNotGranted(account, role, label);
      }
    }

    if (rolesToRemove) {
      for (const roleToRemove of rolesToRemove) {
        await revokeRoleIfGranted(account, roleToRemove, label);
      }
    }
  }
};

func.tags = ["Roles"];
func.dependencies = ["RoleStore"];

export default func;
