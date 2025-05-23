import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GasUtils",
  libraryNames: ["MultichainUtils"],
});

export default func;
