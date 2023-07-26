import { grantRoleIfNotGranted, revokeRoleIfGranted } from "../utils/role";

const rolesToRemove = {
  arbitrum: [],
  avalanche: [],
};

const func = async ({ gmx, network }) => {
  const rolesConfig = await gmx.getRoles();
  for (const { account, roles } of rolesConfig) {
    for (const role of roles) {
      await grantRoleIfNotGranted(account, role);
    }
  }

  const removalList = rolesToRemove[network.name];
  if (removalList) {
    for (const { role, member } of removalList) {
      await revokeRoleIfGranted(member, role);
    }
  }
};

func.tags = ["Roles"];
func.dependencies = ["RoleStore"];

export default func;
