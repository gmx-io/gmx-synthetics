import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const dependencyNames = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "MarketStore",
  "DepositVault",
  "Oracle",
  "FeeReceiver",
];

const func = createDeployFunction({
  contractName: "DepositHandler",
  dependencyNames,
  getDeployArgs: async ({ dependencyContracts }) => {
    return dependencyNames.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["DepositUtils", "DepositStoreUtils", "GasUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
  },
});

export default func;
