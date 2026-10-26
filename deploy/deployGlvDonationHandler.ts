import { HardhatRuntimeEnvironment } from "hardhat/types";

import { createDeployFunction } from "../utils/deploy";
import { grantRoleIfNotGranted } from "../utils/role";

const constructorContracts = ["RoleStore", "DataStore", "EventEmitter", "Oracle"];

const func = createDeployFunction({
  contractName: "GlvDonationHandler",
  dependencyNames: constructorContracts,
  libraryNames: ["GlvUtils", "MarketStoreUtils", "MarketUtils"],
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
  },
  // NOTE: this id should not be changed unless absolutely necessary.
  // Funding accounts must approve the deployed handler before donations can be executed.
  id: "GlvDonationHandler_2",
});

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  if (["botanix", "avalanche", "megaEth"].includes(hre.network.name)) {
    return true;
  }
};

export default func;
