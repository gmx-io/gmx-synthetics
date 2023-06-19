import { HardhatRuntimeEnvironment } from "hardhat/types";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReferralStorage",
  id: "ReferralStorage_2",
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  const shouldDeployForNetwork = ["avalancheFuji", "arbitrumGoerli", "hardhat"];
  return !shouldDeployForNetwork.includes(network.name);
};

export default func;
