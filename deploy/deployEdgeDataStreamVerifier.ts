import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "EdgeDataStreamVerifier",
  getDeployArgs: async () => {
    const oracleConfig = await hre.gmx.getOracle();
    return [oracleConfig.edgeOracleSigner];
  },
  id: "EdgeDataStreamVerifier_6",
});

export default func;
