import { ethers } from "ethers";
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

const stakingConstructorContracts = ["GmxAccountWalletFactory"];

const func = createDeployFunction({
  contractName: "MultichainStakingRouter",
  dependencyNames: [...baseConstructorContracts, ...stakingConstructorContracts],
  getDeployArgs: async ({ dependencyContracts, network, gmx, get }) => {
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

    // use the real V1 RewardRouterV2 on mainnet (resolved from config/vaultV1.ts),
    // fall back to the hardhat-only mock for tests
    const vaultV1Config = await gmx.getVaultV1();
    let rewardRouterAddress = vaultV1Config.rewardRouterV2;
    if (network.name === "hardhat") {
      rewardRouterAddress = (await get("MockRewardRouterV2")).address;
    }
    if (!rewardRouterAddress || !ethers.utils.isAddress(rewardRouterAddress)) {
      throw new Error(`invalid rewardRouterV2 address: ${rewardRouterAddress}`);
    }

    return [baseParams, dependencyContracts.GmxAccountWalletFactory.address, rewardRouterAddress];
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

// MockRewardRouterV2 only deploys on hardhat, so it can't be a dependencyName
// (that would throw on mainnet). Keep it in the dependency graph for hardhat.
func.dependencies = func.dependencies.concat(["MockRewardRouterV2"]);

func.skip = async ({ network, gmx }: HardhatRuntimeEnvironment) => {
  if (network.name === "hardhat") {
    return false;
  }
  // deploy only where a real V1 RewardRouterV2 is configured (arbitrum / avalanche);
  // skip testnets and any network without one
  const vaultV1Config = await gmx.getVaultV1();
  return !vaultV1Config?.rewardRouterV2;
};

export default func;
