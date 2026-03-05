import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MockGovToken",
  getDeployArgs: async () => {
    return ["MockGovToken", "govGMX", 18];
  },
});

export default func;
