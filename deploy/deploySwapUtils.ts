import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "SwapUtils",
  libraryNames: ["FeeUtils"],
  debug: true,
});

export default func;
