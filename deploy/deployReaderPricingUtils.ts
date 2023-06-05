import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderPricingUtils",
  libraryNames: ["MarketStoreUtils", "PositionStoreUtils", "PositionUtils"],
});

export default func;
