import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MarketPositionImpactPoolUtils",
  libraryNames: ["MarketUtils", "MarketEventUtils", "MarketStoreUtils"],
});

export default func;
