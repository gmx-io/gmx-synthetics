import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "EdgeDataStreamVerifier",
  getDeployArgs: async () => {
    return [process.env.EDGE_TRUSTED_SIGNER];
  },
});

export default func;
