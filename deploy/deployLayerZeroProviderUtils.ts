import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "LayerZeroProviderUtils",
  libraryNames: ["GasUtils"],
});

export default func;
