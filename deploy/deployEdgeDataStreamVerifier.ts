import { createDeployFunction } from "../utils/deploy";

const oracleConfig = hre.gmx.getOracle();

const func = createDeployFunction({
  contractName: "EdgeDataStreamVerifier",
  getDeployArgs: async () => {
    return [oracleConfig.edgeOracleSigner];
  },
});

export default func;
