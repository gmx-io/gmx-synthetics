import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "RoleStore",
  id: "RoleStore_2",
  afterDeploy: async ({ gmx }) => {
    const rolesConfig = await gmx.getRoles();
    for (const { account, roles } of rolesConfig) {
      for (const role of roles) {
        await grantRoleIfNotGranted(account, role);
      }
    }
  },
});

func.dependencies = func.dependencies.concat(["FundAccounts"]);

export default func;
