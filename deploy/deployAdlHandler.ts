import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const dependencyNames = [
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
  contractName: "AdlHandler",
  dependencyNames,
  getDeployArgs: async ({ dependencyContracts }) => {
    return dependencyNames.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["GasUtils", "OrderUtils", "AdlUtils", "PositionStoreUtils", "OrderStoreUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
  },
});

export default func;
