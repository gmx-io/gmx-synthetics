import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const constructorContracts = ["RoleStore", "DataStore", "EventEmitter"];

const func = createDeployFunction({
  contractName: "ContributorHandler",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
  },
  // NOTE: this id should not be changed unless absolutely necessary
  // if a new ContributorHandler is deployed, the funding accounts / treasuries
  // would need to re-approve spending of tokens for the new ContributorHandler
  id: "ContributorHandler_1",
});

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  if (["botanix", "avalanche"].includes(hre.network.name)) {
    return true;
  }
};

export default func;
