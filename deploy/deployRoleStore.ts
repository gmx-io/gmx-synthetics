import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "RoleStore",
  id: "RoleStore",
  dependencyNames: ["FundAccounts"],
  afterDeploy: async ({ gmx }) => {
    const rolesConfig = await gmx.getRoles();
    for (const { account, roles } of rolesConfig) {
      for (const role of roles) {
        await grantRoleIfNotGranted(account, role);
      }
    }
  },
});

export default func;
