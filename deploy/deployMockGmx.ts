import { HardhatRuntimeEnvironment } from "hardhat/types";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MockGMX",
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  const shouldDeployForNetwork = ["hardhat"];
  return !shouldDeployForNetwork.includes(network.name);
};

export default func;
