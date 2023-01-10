import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const dependencyNames = [
  "Router",
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "DepositHandler",
  "WithdrawalHandler",
  "OrderHandler",
  "MarketStore",
  "ReferralStorage",
];

const func = createDeployFunction({
  contractName: "ExchangeRouter",
  dependencyNames,
  getDeployArgs: async ({ dependencyContracts }) => {
    return dependencyNames.map((dependencyName) => dependencyContracts[dependencyName].address);
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
