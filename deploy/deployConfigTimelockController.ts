import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const timelockDelay = 24 * 60 * 60;

const func = createDeployFunction({
  contractName: "ConfigTimelockController",
  dependencyNames: ["Oracle", "DataStore", "EventEmitter"],
  libraryNames: ["MarketPositionImpactPoolUtils"],
  getDeployArgs: async ({ dependencyContracts }) => {
    const { deployer } = await hre.getNamedAccounts();
    return [
      timelockDelay,
      [deployer],
      [deployer],
      dependencyContracts["Oracle"].address,
      dependencyContracts["DataStore"].address,
      dependencyContracts["EventEmitter"].address,
    ];
  },
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract.address, "ROLE_ADMIN");
  },
});

export default func;
