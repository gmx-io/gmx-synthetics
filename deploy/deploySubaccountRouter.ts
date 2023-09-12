import { HardhatRuntimeEnvironment } from "hardhat/types";
import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["Router", "RoleStore", "DataStore", "EventEmitter", "OrderHandler", "OrderVault"];

const func = createDeployFunction({
  contractName: "SubaccountRouter",
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
    "WithdrawalStoreUtils",
  ],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract.address, "ROUTER_PLUGIN");
  },
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  const shouldDeployForNetwork = ["avalancheFuji", "arbitrumGoerli", "hardhat"];
  return !shouldDeployForNetwork.includes(network.name);
};

export default func;
