import { createDeployFunction } from "../utils/deploy";
import { skipIncentiveLegacyDeploy } from "../utils/incentive";

const func = createDeployFunction({
  contractName: "RewardRouterUtils",
});

func.skip = skipIncentiveLegacyDeploy;

export default func;
