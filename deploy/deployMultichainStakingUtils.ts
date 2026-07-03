import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MultichainStakingUtils",
  libraryNames: ["MultichainUtils"],
});

export default func;
