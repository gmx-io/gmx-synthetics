import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["EventEmitter", "DataStore", "OracleStore", "RoleStore"];
const timelockDelay = 24 * 60 * 60;

const func = createDeployFunction({
  contractName: "ConfigTimelockController",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts
      .map((dependencyName) => dependencyContracts[dependencyName].address)
      .concat(timelockDelay);
  },
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract.address, "ROLE_ADMIN");
  },
});

export default func;
