import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore"];

const func = createDeployFunction({
  contractName: "OracleStore",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
});

export default func;
