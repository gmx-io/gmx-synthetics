import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ArbGasInfoTest",
});

func.skip = async (hre) => {
  if (process.env.DEPLOY_ARB_GAS_INFO_TEST !== "true") {
    return true;
  }

  if (hre.network.name !== "arbitrum") {
    console.warn("Skipping ArbGasInfoTest deployment on non-arbitrum network");
    return true;
  }
  return false;
};

export default func;
