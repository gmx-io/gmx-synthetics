import { HardhatRuntimeEnvironment } from "hardhat/types";

import { createDeployFunction } from "../utils/deploy";
import { grantRoleIfNotGranted } from "../utils/role";

const constructorContracts = ["RoleStore", "DataStore", "EventEmitter", "Oracle"];

const func = createDeployFunction({
  contractName: "MarketPoolDonationHandler",
  dependencyNames: constructorContracts,
  libraryNames: ["MarketEventUtils", "MarketStoreUtils", "MarketUtils"],
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
  },
  // NOTE: this id should not be changed unless absolutely necessary.
  // Funding accounts must approve the deployed handler before donations can be executed.
  id: "MarketPoolDonationHandler_2",
});

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  if (["botanix", "avalanche", "megaEth"].includes(hre.network.name)) {
    return true;
  }
};

export default func;
