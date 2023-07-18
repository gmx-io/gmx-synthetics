import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore"];

const func = createDeployFunction({
  contractName: "EventEmitter",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  id: "EventEmitter_1",
});

export default func;
