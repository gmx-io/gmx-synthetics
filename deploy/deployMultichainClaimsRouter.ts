import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const baseConstructorContracts = [
  "Router",
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "Oracle",
  "OrderVault",
  "OrderHandler",
  "SwapHandler",
  "ExternalHandler",
  "MultichainVault",
];

const claimsConstructorContracts = [];

const func = createDeployFunction({
  contractName: "MultichainClaimsRouter",
  dependencyNames: [...baseConstructorContracts, ...claimsConstructorContracts],
  getDeployArgs: async ({ dependencyContracts }) => {
    const baseParams = {
      router: dependencyContracts.Router.address,
      roleStore: dependencyContracts.RoleStore.address,
      dataStore: dependencyContracts.DataStore.address,
      eventEmitter: dependencyContracts.EventEmitter.address,
      oracle: dependencyContracts.Oracle.address,
      orderVault: dependencyContracts.OrderVault.address,
      orderHandler: dependencyContracts.OrderHandler.address,
      swapHandler: dependencyContracts.SwapHandler.address,
      externalHandler: dependencyContracts.ExternalHandler.address,
      multichainVault: dependencyContracts.MultichainVault.address,
    };

    return [baseParams];
  },
  libraryNames: [
    "FeeUtils",
    "GasUtils",
    "MarketEventUtils",
    "MarketStoreUtils",
    "MultichainUtils",
    "ReferralUtils",
    "RelayUtils",
  ],

  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
  },
});

export default func;
