import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";
import { getIncentiveTokenAddresses, skipIncentiveDeploy } from "../utils/incentive";

const constructorContracts = ["RoleStore", "DataStore", "EventEmitter"];

const func = createDeployFunction({
  contractName: "EsGmxIssuer",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    const tokens = await getIncentiveTokenAddresses(hre);
    return constructorContracts
      .map((dependencyName) => dependencyContracts[dependencyName].address)
      .concat(tokens.esGmx);
  },
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
  },
  // one-shot vester binding lives on this contract; a silent redeploy would sever it
  id: "EsGmxIssuer_1",
});

func.dependencies = func.dependencies.concat(["IncentiveMockTokens"]);
func.skip = skipIncentiveDeploy;

export default func;
