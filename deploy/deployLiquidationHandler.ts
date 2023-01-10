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
  contractName: "LiquidationHandler",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["GasUtils", "OrderUtils", "LiquidationUtils", "PositionStoreUtils", "OrderStoreUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
  },
});

export default func;
