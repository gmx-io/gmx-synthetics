import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["DataStore"];

const func = createDeployFunction({
  contractName: "StaticOracleProvider",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: [],
});

export default func;
