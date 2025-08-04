import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["Router", "RoleStore", "DataStore", "EventEmitter", "OrderHandler", "OrderVault"];

const func = createDeployFunction({
  contractName: "SubaccountRouter",
  dependencyNames: constructorContracts,
  getDependencies: () => {
    if (hre.gmx.isExistingMainnetDeployment) {
      return ["OrderStoreUtils", "SubaccountUtils"];
    }

    return false;
  },
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["OrderStoreUtils", "SubaccountUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract, "ROUTER_PLUGIN");
  },
});

export default func;
