import { createDeployFunction } from "../utils/deploy";

const dependencyNames = ["RoleStore", "DataStore"];

const func = createDeployFunction({
  contractName: "DepositVault",
  dependencyNames,
  getDeployArgs: async ({ dependencyContracts }) => {
    return dependencyNames.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
});

export default func;
