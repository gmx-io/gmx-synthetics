import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderUtils",
  libraryNames: ["ReaderPricingUtils", "MarketStoreUtils", "PositionStoreUtils", "PositionUtils"],
});

export default func;
