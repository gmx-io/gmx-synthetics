import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "SwapOrderUtils",
  libraryNames: ["MultichainUtils", "SwapUtils"],
});

export default func;
