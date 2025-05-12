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
  "ExternalHandler",
  "MultichainVault",
];

const gmConstructorContracts = [
  "DepositVault",
  "DepositHandler",
  "WithdrawalVault",
  "WithdrawalHandler",
  "ShiftVault",
  "ShiftHandler",
];

const func = createDeployFunction({
  contractName: "MultichainGmRouter",
  dependencyNames: [...baseConstructorContracts, ...gmConstructorContracts],
  getDeployArgs: async ({ dependencyContracts }) => {
    const baseParams = {
      router: dependencyContracts.Router.address,
      roleStore: dependencyContracts.RoleStore.address,
      dataStore: dependencyContracts.DataStore.address,
      eventEmitter: dependencyContracts.EventEmitter.address,
      oracle: dependencyContracts.Oracle.address,
      orderVault: dependencyContracts.OrderVault.address,
      orderHandler: dependencyContracts.OrderHandler.address,
      externalHandler: dependencyContracts.ExternalHandler.address,
      multichainVault: dependencyContracts.MultichainVault.address,
    };

    return [
      baseParams,
      dependencyContracts.DepositVault.address,
      dependencyContracts.DepositHandler.address,
      dependencyContracts.WithdrawalVault.address,
      dependencyContracts.WithdrawalHandler.address,
      dependencyContracts.ShiftVault.address,
      dependencyContracts.ShiftHandler.address,
    ];
  },
  libraryNames: ["MarketUtils", "MultichainUtils", "RelayUtils", "SwapUtils"],

  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract.address, "ROUTER_PLUGIN");
  },
});

export default func;
