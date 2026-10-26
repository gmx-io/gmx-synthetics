import { createDeployFunction } from "../utils/deploy";
import { skipIncentiveDeploy } from "../utils/incentive";

const func = createDeployFunction({
  contractName: "IncentiveEventUtils",
});

func.skip = skipIncentiveDeploy;

export default func;
