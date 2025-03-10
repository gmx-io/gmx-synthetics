import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore", "DataStore"];

const func = createDeployFunction({
  contractName: "DepositVault",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  id: "DepositVault",
});

export default func;
