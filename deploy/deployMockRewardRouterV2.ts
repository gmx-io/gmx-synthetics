import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MockRewardRouterV2",
  dependencyNames: ["GMX", "ESGMX", "WETH", "MockGmxVester", "MockGovToken"],
  getDeployArgs: async ({ dependencyContracts }) => {
    return [
      dependencyContracts.GMX.address,
      dependencyContracts.ESGMX.address,
      dependencyContracts.WETH.address,
      dependencyContracts.GMX.address, // feeGmxTracker placeholder
      dependencyContracts.MockGmxVester.address,
      dependencyContracts.MockGovToken.address,
    ];
  },
});

export default func;
