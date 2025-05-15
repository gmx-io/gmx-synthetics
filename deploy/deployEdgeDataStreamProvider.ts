import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["DataStore", "Oracle", "EdgeDataStreamVerifier"];

const func = createDeployFunction({
  contractName: "EdgeDataStreamProvider",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
});

export default func;
