import { HardhatRuntimeEnvironment } from "hardhat/types";

import { createDeployFunction } from "../utils/deploy";
import { grantRoleIfNotGranted } from "../utils/role";

const constructorContracts = ["RoleStore", "MarketPoolDonationHandler", "GlvDonationHandler"];

const func = createDeployFunction({
  contractName: "DonationBatcher",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract, "DONATION_KEEPER");
  },
  // NOTE: this id should not be changed unless absolutely necessary.
  // Existing-mainnet deployments require a separate governance role grant.
  id: "DonationBatcher_2",
});

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  if (["botanix", "avalanche", "megaEth"].includes(hre.network.name)) {
    return true;
  }
};

export default func;
