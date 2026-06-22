import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";
import { HardhatRuntimeEnvironment } from "hardhat/types";

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

const stakingConstructorContracts = ["GmxAccountWalletFactory", "MockRewardRouterV2"];

const func = createDeployFunction({
  contractName: "MultichainStakingRouter",
  dependencyNames: [...baseConstructorContracts, ...stakingConstructorContracts],
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

    return [
      baseParams,
      dependencyContracts.GmxAccountWalletFactory.address,
      dependencyContracts.MockRewardRouterV2.address,
    ];
  },
  libraryNames: [
    "GasUtils",
    "MultichainUtils",
    "RelayUtils",
    "StakingUtils",
    "MultichainStakingUtils",
    "SignatureUtils",
  ],

  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract, "ROUTER_PLUGIN");
  },
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  const shouldDeployForNetwork = ["hardhat", "avalancheFuji", "arbitrumSepolia"];
  return !shouldDeployForNetwork.includes(network.name);
};

export default func;
