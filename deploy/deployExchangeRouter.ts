import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ExchangeRouter",
  dependencyNames: [
    "Router",
    "RoleStore",
    "DataStore",
    "EventEmitter",
    "DepositHandler",
    "WithdrawalHandler",
    "OrderHandler",
    "MarketStore",
    "ReferralStorage",
  ],
  getDeployArgs: async ({ dependencyContracts }) => {
    return [
      dependencyContracts["Router"].address,
      dependencyContracts["RoleStore"].address,
      dependencyContracts["DataStore"].address,
      dependencyContracts["EventEmitter"].address,
      dependencyContracts["DepositHandler"].address,
      dependencyContracts["WithdrawalHandler"].address,
      dependencyContracts["OrderHandler"].address,
      dependencyContracts["MarketStore"].address,
      dependencyContracts["ReferralStorage"].address,
    ];
  },
  libraryNames: [
    "DepositStoreUtils",
    "WithdrawalStoreUtils",
    "OrderStoreUtils",
    "MarketEventUtils",
    "ReferralEventUtils",
  ],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract.address, "ROUTER_PLUGIN");
  },
});

export default func;
