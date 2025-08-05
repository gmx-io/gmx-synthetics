import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const timelockDelay = 24 * 60 * 60;

const func = createDeployFunction({
  contractName: "ConfigTimelockController",
  dependencyNames: ["Oracle", "DataStore", "EventEmitter"],
  libraryNames: ["PositionImpactPoolUtils"],
  getDeployArgs: async ({ dependencyContracts }) => {
    const { roles } = await hre.gmx.getRoles();
    const executors = Object.keys(roles.TIMELOCK_ADMIN);
    return [
      timelockDelay,
      executors,
      executors,
      dependencyContracts["Oracle"].address,
      dependencyContracts["DataStore"].address,
      dependencyContracts["EventEmitter"].address,
    ];
  },
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract, "ROLE_ADMIN");
  },
});

export default func;
