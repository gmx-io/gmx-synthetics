import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = [
  "Router",
  "DataStore",
  "EventEmitter",
  "Oracle",
  "OrderHandler",
  "OrderVault",
  "ExternalHandler",
];

const func = createDeployFunction({
  contractName: "SubaccountGelatoRelayRouter",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["MarketStoreUtils", "OrderStoreUtils", "SwapUtils", "SubaccountUtils", "MarketUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract.address, "ROUTER_PLUGIN");
  },
});

export default func;
