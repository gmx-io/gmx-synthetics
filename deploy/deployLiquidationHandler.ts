import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "Oracle",
  "OrderVault",
  "SwapHandler",
  "ReferralStorage",
];

const func = createDeployFunction({
  contractName: "LiquidationHandler",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: [
    "OrderUtils",
    "ExecuteOrderUtils",
    "LiquidationUtils",
    "MarketStoreUtils",
    "PositionStoreUtils",
    "OrderStoreUtils",
  ],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
  },
  id: "LiquidationHandler-new",
});

export default func;
