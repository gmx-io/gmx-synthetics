import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GmxAccountWalletFactory",
  dependencyNames: ["RoleStore", "DataStore"],
  getDeployArgs: async ({ dependencyContracts }) => {
    return [dependencyContracts.RoleStore.address, dependencyContracts.DataStore.address];
  },
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
  },
});

export default func;
