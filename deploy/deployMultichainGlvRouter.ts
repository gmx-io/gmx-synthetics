import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const baseConstructorContracts = [
  "Router",
  "DataStore",
  "EventEmitter",
  "Oracle",
  "OrderVault",
  "OrderHandler",
  "ExternalHandler",
  "MultichainVault",
];

const glvConstructorContracts = ["GlvHandler", "GlvVault"];

const func = createDeployFunction({
  contractName: "MultichainGlvRouter",
  dependencyNames: [...baseConstructorContracts, ...glvConstructorContracts],
  getDeployArgs: async ({ dependencyContracts }) => {
    const baseParams = {
      router: dependencyContracts.Router.address,
      dataStore: dependencyContracts.DataStore.address,
      eventEmitter: dependencyContracts.EventEmitter.address,
      oracle: dependencyContracts.Oracle.address,
      orderVault: dependencyContracts.OrderVault.address,
      orderHandler: dependencyContracts.OrderHandler.address,
      externalHandler: dependencyContracts.ExternalHandler.address,
      multichainVault: dependencyContracts.MultichainVault.address,
    };

    return [baseParams, dependencyContracts.GlvHandler.address, dependencyContracts.GlvVault.address];
  },
  libraryNames: ["MultichainUtils", "OrderStoreUtils", "RelayUtils", "SwapUtils", "MarketUtils", "GlvWithdrawalUtils"],

  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract.address, "ROUTER_PLUGIN");
  },
});

export default func;
