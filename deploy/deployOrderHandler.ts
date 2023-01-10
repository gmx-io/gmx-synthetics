import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "OrderHandler",
  dependencyNames: [
    "RoleStore",
    "DataStore",
    "EventEmitter",
    "MarketStore",
    "OrderVault",
    "Oracle",
    "SwapHandler",
    "FeeReceiver",
    "ReferralStorage",
  ],
  getDeployArgs: async ({ dependencyContracts }) => {
    return [
      dependencyContracts["RoleStore"].address,
      dependencyContracts["DataStore"].address,
      dependencyContracts["EventEmitter"].address,
      dependencyContracts["MarketStore"].address,
      dependencyContracts["OrderVault"].address,
      dependencyContracts["Oracle"].address,
      dependencyContracts["SwapHandler"].address,
      dependencyContracts["FeeReceiver"].address,
      dependencyContracts["ReferralStorage"].address,
    ];
  },
  libraryNames: ["OrderUtils", "OrderStoreUtils", "OrderEventUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract.address, "ORDER_KEEPER");
  },
});

export default func;
