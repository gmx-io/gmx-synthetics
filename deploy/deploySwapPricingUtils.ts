import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "SwapPricingUtils",
  libraryNames: [],
});

export default func;
