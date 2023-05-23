import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "PositionUtils",
  libraryNames: ["MarketStoreUtils", "PositionPricingUtils"],
});

export default func;
