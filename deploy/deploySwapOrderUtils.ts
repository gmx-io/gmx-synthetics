import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "SwapOrderUtils",
  libraryNames: ["OrderStoreUtils", "MarketEventUtils"],
});

export default func;
