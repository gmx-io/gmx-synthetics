import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const timelockDelay = 24 * 60 * 60;

const func = createDeployFunction({
  contractName: "ConfigTimelockController",
  dependencyNames: [],
  getDeployArgs: async ({ dependencyContracts }) => {
    return [timelockDelay, [], []];
  },
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract.address, "ROLE_ADMIN");
  },
});

export default func;
