import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = [
  "Router",
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "Oracle",
  "OrderHandler",
  "OrderVault",
  "SwapHandler",
  "ExternalHandler",
];

const func = createDeployFunction({
  contractName: "GelatoRelayRouter",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["OrderStoreUtils", "RelayUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract.address, "ROUTER_PLUGIN");
  },
});

export default func;
