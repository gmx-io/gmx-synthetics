import { HardhatRuntimeEnvironment } from "hardhat/types";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MockRewardRouterV2",
  dependencyNames: ["GMX", "ESGMX", "WETH", "MockGmxVester", "MockGovToken"],
  getDeployArgs: async ({ dependencyContracts }) => {
    return [
      dependencyContracts.GMX.address,
      dependencyContracts.ESGMX.address,
      dependencyContracts.WETH.address,
      dependencyContracts.MockGmxVester.address,
      dependencyContracts.MockGovToken.address,
    ];
  },
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  const shouldDeployForNetwork = ["hardhat"];
  return !shouldDeployForNetwork.includes(network.name);
};

export default func;
