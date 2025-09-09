import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderWithdrawalUtils",
  libraryNames: ["MarketUtils", "MarketStoreUtils", "PositionStoreUtils", "PositionUtils", "SwapPricingUtils"],
});

export default func;
