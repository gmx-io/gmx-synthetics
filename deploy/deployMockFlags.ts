import { HardhatRuntimeEnvironment } from "hardhat/types";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MockFlags",
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  const shouldDeployForNetwork = ["avalancheFuji", "arbitrumSepolia", "hardhat"];
  return !shouldDeployForNetwork.includes(network.name);
};

export default func;
