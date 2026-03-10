import { HardhatRuntimeEnvironment } from "hardhat/types";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MockGmxVester",
  dependencyNames: ["ESGMX"],
  getDeployArgs: async ({ dependencyContracts }) => {
    return [dependencyContracts.ESGMX.address];
  },
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  const shouldDeployForNetwork = ["hardhat"];
  return !shouldDeployForNetwork.includes(network.name);
};

export default func;
