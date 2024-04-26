import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = [
  "Router",
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "DepositHandler",
  "WithdrawalHandler",
  "ShiftHandler",
  "OrderHandler",
  "ExternalHandler",
];

const func = createDeployFunction({
  contractName: "ExchangeRouter",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: [
    "CallbackUtils",
    "DepositStoreUtils",
    "FeeUtils",
    "MarketEventUtils",
    "MarketStoreUtils",
    "OrderStoreUtils",
    "ReferralUtils",
    "ShiftStoreUtils",
    "WithdrawalStoreUtils",
  ],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract.address, "ROUTER_PLUGIN");
  },
});

export default func;
