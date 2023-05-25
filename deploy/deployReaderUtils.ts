import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderUtils",
  libraryNames: ["BaseOrderUtils", "MarketStoreUtils", "PositionStoreUtils", "PositionPricingUtils"],
});

export default func;
