import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";
import { getNamedAccounts } from "hardhat";
import { CANCELLER_ROLE, EXECUTOR_ROLE, PROPOSER_ROLE, TIMELOCK_ADMIN_ROLE } from "../utils/gov";

const libraries = ["MarketUtils"];

const constructorContracts = ["EventEmitter", "DataStore", "OracleStore", "RoleStore", "ConfigTimelockController"];

async function grantProposerRole(timelockConfig: string) {
  const { deployer } = await getNamedAccounts();

  const configTimelockController = await ethers.getContract("ConfigTimelockController");

  if (await configTimelockController.hasRole(TIMELOCK_ADMIN_ROLE, deployer)) {
    await configTimelockController.grantRole(PROPOSER_ROLE, timelockConfig);
    await configTimelockController.grantRole(CANCELLER_ROLE, timelockConfig);
    await configTimelockController.grantRole(EXECUTOR_ROLE, timelockConfig);
    await configTimelockController.revokeRole(TIMELOCK_ADMIN_ROLE, deployer);
  } else {
    console.warn("skipping configTimelockController role config, as deployer does not have access to update roles");
  }
}

const func = createDeployFunction({
  contractName: "TimelockConfig",
  dependencyNames: constructorContracts,
  libraryNames: libraries,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  afterDeploy: async ({ deployedContract }) => {
    await grantProposerRole(deployedContract.address);
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract, "ROLE_ADMIN");
  },
});

export default func;
