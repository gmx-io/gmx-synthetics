import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MockGmxVester",
  dependencyNames: ["ESGMX"],
  getDeployArgs: async ({ dependencyContracts }) => {
    return [dependencyContracts.ESGMX.address];
  },
});

export default func;
