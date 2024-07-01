import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderDepositUtils",
  libraryNames: ["MarketUtils", "MarketStoreUtils", "PositionStoreUtils", "PositionUtils", "SwapPricingUtils"],
});

export default func;
