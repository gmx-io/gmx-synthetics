import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "MarketStore",
  "OrderVault",
  "Oracle",
  "SwapHandler",
  "FeeReceiver",
  "ReferralStorage",
];

const func = createDeployFunction({
  contractName: "OrderHandler",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["OrderUtils", "OrderStoreUtils", "OrderEventUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
  },
});

export default func;
