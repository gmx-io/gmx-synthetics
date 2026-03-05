import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GmxAccountWalletFactory",
  dependencyNames: ["RoleStore"],
  getDeployArgs: async ({ dependencyContracts }) => {
    return [dependencyContracts.RoleStore.address];
  },
});

export default func;
