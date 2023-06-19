import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore"];

const func = createDeployFunction({
  contractName: "DataStore",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["GasUtils", "OrderUtils", "AdlUtils", "PositionStoreUtils", "OrderStoreUtils"],
  id: "DataStore_2",
});

export default func;
