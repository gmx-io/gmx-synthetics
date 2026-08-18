import { HardhatRuntimeEnvironment } from "hardhat/types";
import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GmxAccountWalletFactory",
  dependencyNames: ["RoleStore", "DataStore", "EventEmitter"],
  getDeployArgs: async ({ dependencyContracts }) => {
    return [
      dependencyContracts.RoleStore.address,
      dependencyContracts.DataStore.address,
      dependencyContracts.EventEmitter.address,
    ];
  },
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
  },
  // wallet addresses derive from the factory address and bytecode, so redeploying
  // the factory would orphan existing wallets
  // bump the id only together with an explicit wallet migration plan
  id: "GmxAccountWalletFactory_1",
});

// gmx account wallets should exist on arbitrum only: they extend the gmx account,
// which settles on arbitrum
// also, the same wallet address on another chain could belong to a different user
// e.g. if the account that owns the wallet is a smart contract wallet
func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  const shouldDeployForNetwork = ["hardhat", "arbitrum"];
  return !shouldDeployForNetwork.includes(network.name);
};

export default func;
