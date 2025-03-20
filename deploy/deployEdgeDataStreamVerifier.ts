import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "EdgeDataStreamVerifier",
  getDeployArgs: async () => {
    const oracleConfig = await hre.gmx.getOracle();
    return [oracleConfig.edgeOracleSigner];
  },
});

export default func;
