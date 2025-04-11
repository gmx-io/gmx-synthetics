import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GasTest",
});

func.skip = async () => {
  if (process.env.DEPLOY_GAS_TEST !== "true") {
    return true;
  }

  return false;
};

export default func;
