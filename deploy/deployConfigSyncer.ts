import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore", "Config", "DataStore", "EventEmitter"];

const func = createDeployFunction({
  contractName: "ConfigSyncer",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts, gmx, network, get }) => {
    const riskOracleConfig = await gmx.getRiskOracle();
    let riskOracleAddress = riskOracleConfig.riskOracle;
    if (network.name === "hardhat") {
      const riskOracle = await get("MockRiskOracle");
      riskOracleAddress = riskOracle.address;
    }
    if (!riskOracleAddress) {
      throw new Error("riskOracleAddress is not defined");
    }
    return constructorContracts
      .map((dependencyName) => dependencyContracts[dependencyName].address)
      .concat(riskOracleAddress);
  },
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract.address, "CONFIG_KEEPER");
  },
});

func.dependencies = func.dependencies.concat(["MockRiskOracle"]);

export default func;
