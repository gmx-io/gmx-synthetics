import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MarketPositionImpactPoolUtils",
  libraryNames: ["MarketUtils", "MarketEventUtils", "MarketStoreUtils", "PositionUtils"],
});

export default func;
