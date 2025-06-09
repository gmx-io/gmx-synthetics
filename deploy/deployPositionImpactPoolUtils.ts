import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "PositionImpactPoolUtils",
  libraryNames: ["MarketUtils", "MarketEventUtils", "MarketStoreUtils", "PositionUtils"],
});

export default func;
