import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderUtils",
  libraryNames: ["MarketStoreUtils", "PositionStoreUtils", "PositionPricingUtils"],
});

export default func;
