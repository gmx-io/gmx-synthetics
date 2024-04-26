import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore", "DataStore"];

const func = createDeployFunction({
  contractName: "ShiftVault",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  id: "ShiftVault_1",
});

export default func;
